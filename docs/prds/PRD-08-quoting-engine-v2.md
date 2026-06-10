# PRD-08 — Global Quoting Engine v2

**Source:** CTO Brief §7 (Priority #7) — "Unite Medical's Core IP"
**Owner:** Alex (CTO) — this is the differentiator
**Status:** draft
**Depends on:** PRD-01, PRD-03 (real Flexport quotes), PRD-07 (vendor approval), PRD-11 (Claude)
**Blocks:** customer-facing launch of the proprietary quoting product

> "Proprietary real-time global quoting. Unite Medical's core IP." — Brief §2

---

## 1. North star

A foreign vendor uploads a spreadsheet → in seconds the system
validates FDA codes, pulls live duty rates, generates a freight quote,
calculates true landed cost, applies margin policy, and outputs a
customer-facing PDF quote. No other distributor at Unite Medical's
scale offers this as a customer-facing tool.

---

## 2. Current state

- `src/lib/quoting.js` orchestrates the pipeline correctly but every
  call is **simulated**:
  - openFDA: hardcoded lookup table of 4 product codes
  - USITC HTS: hardcoded rates for 9 codes
  - Flexport: synthetic freight rate calculation
  - Claude: template-based cover letter
- `src/pages/Quote.jsx` UI is functional but:
  - Runs only a hardcoded `SAMPLE_VENDOR_SHEET`
  - No file upload
  - No PDF export
  - "Send PDF to customer" button is disabled
- ImportGenius is **not** integrated at all
- USITC HTS API is **not** integrated (we have a hardcoded table)

---

## 3. Scope

### In scope

- File upload: vendor uploads Excel / CSV with the agreed template
- Server-side parsing + validation per row
- Real integrations:
  - openFDA classification (via PRD-07 mirror)
  - USITC HTS REST API (live)
  - Flexport freight quotes (via PRD-03)
  - Claude for HTS classification assist + cover letter (PRD-11)
- Landed cost calculation per the brief §7 formula
- Margin policy enforcement per customer tier
- PDF generation (professional, branded)
- Quote sending: PDF email + landing-page link the customer can click
  to accept / counter
- Quote acceptance → draft QBO invoice (PRD-02)
- ImportGenius vendor & customer discovery (read-side; writes to
  HubSpot via PRD-06)
- Customer-facing UI: a sanitized version of `/quote` becomes a
  self-serve sourcing wizard for approved customers (was internal-only
  in v1)

### Out of scope

- Quote negotiation chat / inline counter-offer
- Multi-currency vendor pricing (USD only for v1)
- Insurance quote add-on (Flexport offers it; defer)

---

## 4. Vendor template

CSV with the following columns (order strict):

```
product_name,fda_product_code,hts_code,fob_price_usd,moq,lead_time_days,country_of_origin,description,gtin,packaging
```

Optional columns: `target_quantity`, `notes`.

A vendor that doesn't know their HTS code can leave it blank — Claude
will propose, USITC will validate.

---

## 5. Landed cost formula (locked)

```
landed_per_unit  =  fob_price
                  + ocean_freight_per_unit        # from Flexport
                  + customs_brokerage_per_unit    # from Flexport
                  + duty_per_unit                 # fob * duty_pct from USITC
                  + drayage_per_unit              # from Flexport
                  + warehouse_receiving_per_unit  # configurable, default $0.25/unit

sell_per_unit   =  landed_per_unit / (1 - target_margin)
                                                  # default 0.60 (60%)

ext_sell_total  =  sell_per_unit * target_quantity
```

Target margin is configurable per customer tier in
`/admin/settings/margin-policy`:

| Tier | Default margin |
|---|---|
| A (large hospitals, gov, retail) | 30% |
| B (mid-tier ASCs, dealers) | 50% |
| C (small clinics, one-offs) | 60% |
| Distributor | 25% (volume) |

Per the brief, the *default* is 60% but real customer-tier pricing
sits below that for big accounts.

---

## 6. Compliance verification panel

Per ALEX_THINGS.md item #10, the quoting engine should show 4-category
compliance status per quote line:

- **FDA Status** — registration verified, device class, recall history
- **Quality System** — ISO/QMS status of the vendor (manual flag for now)
- **Product Testing** — testing standards compliance (vendor-attested)
- **Certifications** — PDAC, Berry, TAA, etc.

Source data: `product_compliance` table (PRD-07) + `vendors` table.

---

## 7. ImportGenius use cases

### Vendor discovery

- Search by HS code + origin country: "show me Class II diagnostic
  manufacturers shipping from Malaysia to US importers over the last
  12 months with volume > $X"
- Results auto-create HubSpot vendor leads (PRD-06 Phase 5)

### Customer prospecting

- Search by importer name + product description: "hospitals importing
  Class II diagnostic kits themselves" — these are direct
  customer leads
- Results auto-create HubSpot customer leads tagged `lead_source=importgenius`

---

## 8. PDF output

- Branded, multi-page PDF
- Header: quote ID, date, valid-until
- Lines: SKU, qty, sell, ext
- Landed cost breakdown (only shown if internal-flagged, NOT shown to
  customer)
- Delivery window + ETA + port of arrival
- Compliance summary block (the 4-category panel above)
- Cover letter (Claude-drafted, Damon-tunable)
- Acceptance instructions: click link OR sign-and-return

Generation: `@react-pdf/renderer` server-side or `Puppeteer` if richer.
Stored in R2 with a 90-day signed URL for customer access.

---

## 9. Phases

### Phase 1 — File upload + parsing

- `/quote/new` page with drag-drop (vendor or rep)
- Server parses CSV/XLSX; row-level validation feedback
- Saves to `quotes` (header) + `quote_items` (rows) in `draft` state
- No external APIs called yet

**Exit:** A 50-line vendor sheet uploads, parses, and renders as
editable rows in under 3 seconds.

### Phase 2 — Real openFDA + USITC HTS calls

- Replace simulator bodies with real calls
- Claude-assist for missing HTS codes; USITC validates the proposal
- Failed lookups produce inline errors per row (not a full failure)

**Exit:** A vendor sheet with 50 rows resolves FDA + HTS in under 10
seconds (with caching) and surfaces typos.

### Phase 3 — Real Flexport freight quote (depends on PRD-03 Phase 6)

- LCL + FCL + air options
- Quote-specific freight ID stored; expires per Flexport rate validity

**Exit:** Returned rates match what an ops user sees in the Flexport
portal for the same shipment shape.

### Phase 4 — Margin policy + sell-price calculation

- Customer tier resolves from selected customer record (HubSpot via
  PRD-06)
- Margin policy applied; user can override per-line in the rep view
  (audit-logged)

**Exit:** Switching a quote between two customer tiers re-prices the
entire quote correctly without re-running freight.

### Phase 5 — PDF generation + sending

- `@react-pdf/renderer` template
- Cover letter via Claude (PRD-11)
- Email send via Resend with the PDF attached + acceptance link
- Customer acceptance landing page: `/q/{token}` shows the quote,
  has "Accept" / "Counter" / "Decline" buttons

**Exit:** Quote sent, customer accepts via link, our system marks the
quote `accepted` and creates a draft QBO invoice (PRD-02).

### Phase 6 — ImportGenius integration

- API client + cached search
- `/admin/discovery/vendors` and `/admin/discovery/customers` search
  UIs
- "Push to HubSpot" button on results

**Exit:** A weekly batch of ImportGenius leads (target: 50/week) flows
into the right HubSpot pipelines with all fields populated.

### Phase 7 — Customer self-serve

- `/quote` becomes a customer-facing form: "I need X — give me a
  landed price"
- Only authenticated approved customers can submit (PRD-14 auth)
- Vendor selection happens automatically (best landed cost from
  approved vendors)
- Same engine; just a friendlier UI

**Exit:** A real customer uses the self-serve quote without rep
intervention; the quote PDF is accurate and the customer pays.

---

## 10. Verifier

`scripts/quoting_check.py` (nightly):

- For 20 most recent quotes, recompute landed cost from raw inputs;
  assert match within $0.01
- Assert every quote line has `fda_status`, `hts_validated`,
  `freight_id`, `gtin_validated` set
- Assert no quote has been generated without a `vendor.approved_at`
  vendor

---

## 11. Open questions

1. **Customer tier visibility**: do we show the customer which tier
   they're in? Default: no.
2. **Margin disclosure**: brief mentions enforcing 60% margin —
   customers see only sell price; landed-cost breakdown is
   rep-only. Confirm.
3. **Quote expiry**: default 14 days; configurable per vendor terms
   (Flexport rates often have 7-day validity).
4. **Counter-offer flow**: brief is silent. Default: rep sees counter
   notification, manually adjusts, re-sends.
5. **Self-serve gating**: which customer segments get self-serve quote
   access? Default: A-tier + approved distributors only.

---

## 12. Out-of-band

- ImportGenius Enterprise subscription ($899/user/mo) — confirm
  budget; consider a single shared user for v1
- USITC HTS account (free)
- Anthropic API budget — covered in PRD-11
- Customer-facing accepted-quote landing page domain (`unitemedical.net/q/*`
  is fine; preserves trust)
- New env vars: `IMPORTGENIUS_API_KEY`, `USITC_HTS_API_KEY`,
  `R2_QUOTES_BUCKET`

---

## 13. Definition of done

- A 50-line vendor sheet runs the full pipeline in under 30 seconds
  (with all caches cold)
- Customer-facing self-serve quoting is live for A-tier customers
- ImportGenius produces > 50 qualified leads/week, mixed
  vendor + customer
- Every quote has full compliance evidence attached
- The product is sufficiently differentiated that we can name it (e.g.
  "Unite Source") and feature it in marketing
