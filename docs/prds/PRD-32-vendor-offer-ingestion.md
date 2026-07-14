# PRD-32 — Vendor Offer Ingestion & FOB Price Intelligence

**Source:** Pricing-brain strategy (Alex + Hermes, 2026-07). Sibling of PRD-30
(customer-side quote telemetry): PRD-30 learns what customers will pay; PRD-32
learns what supply actually costs. Together they are the margin model.
**Owner:** Alex (CTO) · Damon as vendor-relationship owner
**Status:** draft / proposed
**Depends on:** PRD-18 (XLSX parsing + column mapping — reuse wholesale),
PRD-16 (`compareVendorOffers`), PRD-11 (AI layer — PDF extraction prompts),
PRD-07 (vendor scoring — new vendors from replies enter the approval pipeline),
PRD-15 (trade-data discovery — target list source). Email: Resend (outbound),
Gmail OAuth read (inbound) — both already scaffolded.
**Blocks:** margin optimization (needs both cost + demand sides).

> The core realization: **vendors already email us their offerings — PDFs and
> spreadsheets — because sending price lists to buyers is their job.** There is
> no incentive problem on the supply side. The problems are (1) PDF is not an
> ingestion path today, (2) parsed sheets evaporate after one quote instead of
> compounding into a price database, and (3) we only receive what we happen to
> ask for. This PRD fixes all three and automates the asking.

---

## 1. North star

Every vendor price communication Unite receives — emailed PDF, XLSX, CSV, in
any language — lands automatically in a persistent, effective-dated
**`vendor_offers`** database, with zero change to vendor behavior. On top of
it: cross-vendor spot comparison, FOB trend detection, negotiation receipts,
and instant quote coverage for un-stocked items. An automated RFQ engine keeps
the database fresh without a human remembering to ask.

Success = the FOB price database compounds monthly, and every sourcing/quoting
decision reads from it instead of from someone's inbox memory.

---

## 2. Current state

| Have | Where |
|---|---|
| XLSX/CSV reader (any worksheet, date serials, 10MB guard) | `src/lib/xlsx.js` |
| Column mapping: EN/中文/한국어/Tiếng Việt aliases → fuzzy → Claude | PRD-18, `/quote/new` |
| Line translation preserving originals | `quoting/translate_lines` |
| Multi-currency FOB → USD normalization | PRD-22, `exchangeRates.js` |
| Multi-vendor offer comparison | `compareVendorOffers` (PRD-16) |
| Vendor scoring + approval pipeline | PRD-07, `/admin/vendors` |
| Vendor discovery + AI outreach drafts | `/admin/discovery` (PRD-15) |
| Outbound email chain | `mailer.js` (Resend → Gmail → outbox) |
| Inbound email read (optional OAuth, already coded) | Google connect flow (GO_LIVE Bucket B) |

**Gaps this PRD closes:**
1. **No PDF ingestion** — vendors' default artifact bounces.
2. **No persistence** — vendor sheets are parsed per-quote, then discarded;
   nothing accumulates.
3. **No proactive/automated collection** — we receive only what arrives.

---

## 3. The acquisition engine — how vendor data arrives, automated

The supply side needs no persuasion, only **credible buying signals** and an
inbox that never drops anything. Five channels, ordered by yield:

### 3.1 The vendors@ front door (passive, always on)
`vendors@unitemedical.net` published on the site, in every PO footer
(`purchaseOrders.js` email template), and in every rep/Damon signature:
*"Send price lists and catalogs here — any format, any language."*
Everything with an attachment gets parsed automatically (§5). Vendors change
nothing; this is the zero-friction path and the reason the whole design works.

### 3.2 Automated RFQ campaigns (active; the main pump)
An RFQ from a real buyer gets answered — this is the one email category vendors
never ignore. Automate the loop:

- **Target list:** Damon's existing vendor book + PRD-15 discovery output
  (manufacturers found by keyword/HS code) + every vendor named on any
  historical sheet.
- **Campaign:** for each product category we stock (or want to price), generate
  an RFQ with a **specific SKU/spec list attached** (credibility comes from
  specificity — generic "send catalog" emails read as spam; a 12-line spec
  sheet with quantities reads as money). AI-drafted per vendor language
  (`vendor/outreach_email_intl` prompt already exists), review-gated send.
- **Standard closer on every RFQ:** *"Please include your full current price
  list, not only the items above."* The marginal ask is free and routinely
  doubles the data yield per reply.
- **Cadence:** new-vendor RFQ on discovery; category re-RFQ quarterly.

### 3.3 Staleness-triggered refresh (automated hygiene)
Nightly job: any vendor whose newest offer is > 90 days old gets a refresh
email — *"we're updating our sourcing files for Q3; please send your current
price list"* — drafted in the vendor's language, review-gated (auto-send after
90 days of clean operation). Vendors interpret this as purchase intent; reply
rates on refresh asks to vendors who have sold to you are very high.

### 3.4 Reciprocity: being in the database = getting orders (the flywheel)
Make it structurally rewarding to keep pricing current, and say it out loud in
vendor onboarding:
- The quoting engine and replenishment PO drafting **only source from vendors
  with fresh offers on file** (< 120 days). Fresh data → eligible for POs.
  Stale data → invisible. Vendors learn to push updates unprompted.
- Vendors who maintain current pricing get a **fast-PO lane** (our zero-touch
  PO pipeline genuinely is faster than industry norm — that's a real carrot).
- Optional v2: a lightweight vendor portal page (upload sheet, see PO history)
  — but email-first is the v1 law; a portal no one visits is worse than an
  inbox everyone already uses.

### 3.5 Onboarding requirement (contract-level)
PRD-07 vendor approval adds one required artifact: current price list on file
before first PO. Data completeness becomes a gate, not a favor.

**Honesty about yields:** cold discovery-list RFQs convert modestly (10–30%
reply is normal); existing-relationship refreshes convert near-totally. The
compounding comes from *never losing anything that arrives* (§3.1) plus the
reciprocity loop (§3.4) — not from any single blast.

---

## 4. Data model (`0021_vendor_offers.sql`)

```sql
CREATE TABLE vendor_offers (
  id             BIGSERIAL PRIMARY KEY,
  vendor_id      TEXT REFERENCES vendors(id),
  vendor_name    TEXT NOT NULL,            -- as stated on the document
  source_doc_id  TEXT NOT NULL,            -- ingest_documents.id
  line_no        INT,
  description    TEXT NOT NULL,            -- original language
  description_en TEXT,                     -- translated
  matched_sku    TEXT REFERENCES products(sku),  -- nullable; fuzzy-matched
  category       TEXT,
  hs_code        TEXT,
  fob_price      NUMERIC(12,4) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  fob_usd        NUMERIC(12,4) NOT NULL,   -- normalized at ingest (PRD-22)
  moq            INT,
  unit           TEXT,
  incoterms      TEXT,
  lead_time_days INT,
  effective_date DATE NOT NULL,            -- from doc, else received date
  superseded_by  BIGINT REFERENCES vendor_offers(id),  -- price-history chain
  confidence     NUMERIC(3,2),             -- extraction confidence
  reviewed       BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_vo_vendor_sku ON vendor_offers (vendor_name, matched_sku);
CREATE INDEX idx_vo_sku_date   ON vendor_offers (matched_sku, effective_date DESC);
CREATE INDEX idx_vo_category   ON vendor_offers (category, effective_date DESC);

CREATE TABLE ingest_documents (
  id            TEXT PRIMARY KEY,
  source        TEXT NOT NULL,            -- email|upload|rfq_reply
  from_email    TEXT,
  filename      TEXT,
  mime          TEXT,                     -- pdf|xlsx|csv|image
  vendor_name   TEXT,
  received_at   TIMESTAMPTZ DEFAULT NOW(),
  status        TEXT DEFAULT 'pending',   -- pending|parsed|review|done|failed
  lines_found   INT, lines_accepted INT,
  raw_ref       TEXT                      -- storage pointer to original file
);

CREATE TABLE rfq_campaigns (
  id TEXT PRIMARY KEY, category TEXT, sku_list JSONB, status TEXT,
  sent_count INT DEFAULT 0, reply_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Rule: a newer offer for the same (vendor, matched_sku/description-hash) sets
`superseded_by` on the old row — **history is never deleted**; the time series
is the asset.

---

## 5. Ingestion architecture

```
ARRIVE
  vendors@ inbox (Gmail OAuth poll, existing connect flow)  ─┐
  /quote/new uploads (existing)                              ├─→ ingest_documents
  /admin/vendors manual upload                              ─┘

EXTRACT (new)
  xlsx/csv  → existing PRD-18 pipeline unchanged
  pdf/image → NEW pdf extraction stage:
              1. text layer extraction; if sparse → Claude vision on page images
              2. prompt `vendor/pdf_price_extract` (strict JSON schema:
                 lines[{description, price, currency, moq, unit, ...}])
              3. hands normalized lines to the SAME column-map → translate →
                 currency-normalize chain the XLSX path uses

MATCH + PERSIST
  fuzzy-match lines to catalog SKUs (reuse matching.js engine)
  write vendor_offers (+supersede chain), flag low-confidence lines

REVIEW
  /admin/vendor-offers queue: low-confidence lines, unknown vendors
  (unknown vendor → PRD-07 scoring pipeline), one-click accept/fix
  (reuses the /quote/new mapping-confirmation UI patterns)

CONSUME
  quoting engine: freshest offer per line for un-stocked RFQs
  replenishment PO drafting: cheapest-eligible fresh vendor
  /admin/discovery + /admin/vendors: price history charts, trend alerts
  negotiation brief: "vendor X quoted $4.80; their March sheet said $4.20;
  vendor Y is at $4.35" — auto-drafted into PO/RFQ replies
```

---

## 6. Intelligence surfaces (what the data buys)

1. **Spot comparison** — cheapest fresh offer per SKU/category, MOQ-aware
   (extends `compareVendorOffers` from per-quote to database-wide).
2. **FOB trend alerts** — category-level price creep → CEO digest bullet +
   repricing trigger into margin policy.
3. **Negotiation receipts** — per-vendor price history injected into PO
   negotiation drafts automatically.
4. **Quote coverage expansion** — un-stocked customer RFQ lines price against
   freshest vendor offer + landed-cost engine instead of waiting on email.
5. **Vendor scorecard enrichment** — PRD-07 scoring gains price-competitiveness
   and quote-freshness components.

---

## 7. Phases

### Phase 1 — Persistence + PDF extraction
`0021_vendor_offers.sql`; `vendor/pdf_price_extract` prompt + schema + stub;
wire /quote/new uploads to ALSO persist into vendor_offers (stop discarding).
**Exit:** an emailed-style PDF price list parses to ≥ 90% of its lines; sheets
uploaded for quotes appear in vendor_offers with supersede chains.

### Phase 2 — vendors@ inbox automation
Gmail OAuth poll (or forwarding-webhook alternative) → ingest_documents →
pipeline → review queue at `/admin/vendor-offers`.
**Exit:** email a real vendor PDF to vendors@ → rows in vendor_offers with no
human touch except the review queue.

### Phase 3 — RFQ engine
Campaign builder (category + SKU list + target vendors from discovery/book);
AI-drafted per-language RFQs, review-gated; replies auto-ingest and link back
to the campaign. Staleness-refresh nightly job.
**Exit:** one campaign sent; ≥ 1 reply auto-parsed end-to-end; refresh job green.

### Phase 4 — Intelligence surfaces
Price-history views, trend alerts to digest, negotiation-brief injection,
quoting/replenishment consumption of freshest offers, PRD-07 scorecard fields.
**Exit:** a quote for an un-stocked item prices from the database; digest shows
a real trend bullet.

### Phase 5 — Reciprocity mechanics
Fresh-offer eligibility gate on PO drafting; vendor onboarding requirement;
fast-PO lane messaging in vendor comms.
**Exit:** PO drafting refuses stale-data vendors with a clear admin explanation.

---

## 8. Verifier — `scripts/vendor_offers_check.py`

- Extraction fidelity: frozen fixture set (5 real PDFs + 5 XLSX in 3 languages)
  parses at ≥ 90% line recall, 100% schema validity.
- Supersede-chain integrity: no two un-superseded offers for same
  (vendor, sku); history never deleted.
- Currency: every row has fob_usd; normalization within 1% of rate table.
- Freshness metric: % of active vendors with < 90-day offers (report, not gate).
- Review queue SLA: nothing `pending` > 72h.

---

## 9. Metrics (monthly)

- Offers ingested / month; distinct vendors with fresh (<90d) data.
- % ingested lines auto-accepted vs needing review (extraction quality).
- RFQ campaign reply rate by segment (existing vs discovered vendors).
- Quote lines priced from database vs awaiting vendor email (coverage win).
- Realized FOB savings from cross-vendor switches (the dollars).

---

## 10. Risks & honesty

- **PDF extraction is genuinely hard** — scanned/photographed lists, merged
  cells, price matrices. Mitigate: confidence scoring + review queue; never
  auto-accept below threshold; fixture-set gate in CI.
- **Entity resolution** — "Ningbo Surgical Devices Co" vs "NINGBO SURG. DEV." —
  needs vendor-name normalization (alias table on `vendors`).
- **Cold RFQ yields are modest** (10–30%); the compounding is from
  never-dropping-anything + refresh + reciprocity, not blasts.
- **Don't spam** — review-gated sends, per-vendor contact frequency caps,
  honor unsubscribes; the vendor relationship is Damon's asset, not fuel.
- **Inbound email dependency** — Gmail OAuth is the coded path (optional in
  GO_LIVE); if unavailable at launch, a manual forward-to-upload flow bridges.

---

## 11. Open questions (Damon)

1. Hand over the current vendor book (names + emails) for the seed target list?
2. Approve the RFQ email templates + sending identity (his name vs sourcing@)?
3. Comfort with the §3.4 freshness gate on PO eligibility (it changes vendor
   dynamics deliberately)?
4. Any vendors that must NOT receive automated mail (strategic/sensitive)?

---

## 12. Definition of done

- Any vendor price document — emailed PDF in Chinese included — lands in
  `vendor_offers` with history, untouched except a review click.
- RFQ + refresh loops run on schedule with review-gated sends.
- Quoting, replenishment, and negotiation drafts consume the database.
- The FOB time series is visibly compounding month over month, and at least one
  sourcing decision per month is made (and logged) off cross-vendor data.
