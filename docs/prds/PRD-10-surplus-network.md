# PRD-10 — Surplus Inventory Network

**Source:** CTO Brief §8 (Priority #9)
**Owner:** Alex (CTO) + Damon (relationships)
**Status:** draft
**Depends on:** PRD-01 (Platform), PRD-04 (WMS for intake receiving), PRD-06 (HubSpot surplus pipeline), PRD-11 (Claude for categorization)
**Blocks:** nothing critical; opens a net-new revenue channel

> "Build inbound sourcing from hospital overstock. New revenue channel." — Brief §2

---

## 1. North star

Hospitals, surgery centers, and clinics can submit their excess
inventory to Unite Medical via a clean web form. Submissions are
auto-categorized + valued; Damon's team responds with offers in hours,
not weeks. Over time the surplus network becomes a proprietary
sourcing channel and (eventually) a private marketplace.

---

## 2. Current state

- There is no public API for hospital surplus inventory
- Existing players (WestCMR, XS Supply, Hospital Overstock, MedTrading)
  operate by Excel-list email exchange
- Unite Medical doesn't currently buy surplus
- No code in repo addresses this (greenfield)

---

## 3. Scope

### In scope

- Public landing page: `/surplus` — "Sell your excess medical supplies
  to Unite Medical"
- Authenticated intake form (or anonymous for first contact, then
  account creation) — upload Excel/CSV or enter line items manually
- AI categorization + valuation (Claude + our catalog cross-reference)
- Damon's team workflow: review submissions, send offers, arrange
  pickup
- HubSpot "Surplus Supplier" pipeline (separate from sales)
- Repeat-supplier discount + relationship tier (the moat over time)
- Long-term roadmap section for marketplace (post-launch)

### Out of scope

- Logistics for picking up surplus inventory (3PL/freight handled
  outside this product; we just schedule)
- B2B private marketplace (Phase 5 is a teaser — actual marketplace
  build is a follow-on PRD when relationships exist)

---

## 4. Submission categorization

Each line in a submission gets:

| Field | Source |
|---|---|
| Normalized product name | Claude |
| Category (Orthotics / Diagnostics / PPE / Surgical / Supplements / Other) | Claude + our catalog vocabulary |
| Catalog match (if any) | fuzzy match against `products` table |
| GTIN (if provided) | GS1 lookup (PRD-07) for validation |
| Estimated retail value | Catalog price or Claude best-guess |
| Estimated wholesale buy price | configurable margin policy (default 25-40% of retail depending on category + condition) |
| Condition flag | "new in box" / "opened" / "expired (date)" / "unknown" |
| Want / don't want | rule-based: take all "new in box" Class II with > 6mo shelf life; skip expired |

---

## 5. Data model

```sql
CREATE TABLE surplus_submissions (
  id              UUID PRIMARY KEY,
  hospital_id     UUID REFERENCES customers(id),  -- nullable for first-contact anonymous
  contact_email   TEXT NOT NULL,
  contact_name    TEXT,
  contact_phone   TEXT,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT,  -- 'new' / 'reviewing' / 'offer_sent' / 'accepted' / 'declined' / 'received'
  total_lines     INT,
  estimated_value INT,
  pickup_location TEXT,
  hubspot_deal_id TEXT,
  notes           TEXT
);

CREATE TABLE surplus_lines (
  id                  UUID PRIMARY KEY,
  submission_id       UUID REFERENCES surplus_submissions(id),
  raw_description     TEXT NOT NULL,
  normalized_name     TEXT,
  category            TEXT,
  matched_sku         TEXT,           -- our `products.sku` if matched
  gtin                TEXT,
  qty                 INT,
  expiry_date         DATE,
  condition           TEXT,
  est_retail          NUMERIC(10,2),
  offer_price         NUMERIC(10,2),
  decision            TEXT,           -- 'want' / 'pass'
  decision_reason     TEXT
);
```

---

## 6. Workflows

### 6.1 Submission

```
A) Customer lands on /surplus
B) Form: contact info + drop Excel/CSV (or paste line items)
C) On submit:
   - file parsed
   - each line: Claude categorize + value + match to catalog
   - submission row created
   - HubSpot "Surplus Supplier" lead created in 'Submitted' stage
   - Damon notified via Slack
D) Customer sees confirmation + estimated response time (24-48 hours)
```

### 6.2 Offer

```
A) Damon (or designated buyer) reviews submission in /admin/surplus/{id}
B) Adjusts per-line offers if needed
C) Clicks "Send offer"
D) Customer receives email with offer + accept link
E) On acceptance: pickup logistics workflow opens
F) On receipt: lines move into Cin7 inventory at offer_price as COGS
```

### 6.3 Repeat-supplier tier

- Customers with > 3 accepted submissions in 12 months get tier "B"
- Offer multiplier improves slightly (tunable)
- Tier visible to the supplier as encouragement for ongoing engagement

---

## 7. Phases

### Phase 1 — Landing page + form

- `/surplus` page in the marketing site
- Static intake form (no AI yet); submissions land in DB and Slack
- HubSpot lead creation

**Exit:** A test submission produces a HubSpot lead with attachment.

### Phase 2 — AI categorization + valuation

- Claude pass runs on every submission
- Catalog matching against `products` table
- Estimated values displayed in admin review UI
- Manual per-line override

**Exit:** A 25-line Excel submission produces fully populated
`surplus_lines` rows within 60 seconds. Manual review takes <5 min.

### Phase 3 — Offer workflow

- "Send offer" button generates PDF + email
- Customer acceptance landing page (similar to PRD-08 quote acceptance)
- On accept: pickup scheduling + HubSpot stage progression

**Exit:** End-to-end test: submission → AI valuation → offer → customer
accepts → ready-for-pickup state.

### Phase 4 — Receiving into Cin7 (depends on PRD-04)

- On receipt at GA warehouse: receiving workflow against the surplus
  submission (not a PO)
- Inventory increments at the offer_price as COGS
- QBO Bill posted against the supplier (PRD-02)

**Exit:** Surplus inventory flows into Cin7 + QBO with full cost basis
preserved.

### Phase 5 — Marketplace teaser (data collection only)

- Track aggregate metrics: how much surplus volume per category per
  quarter
- Build a private dashboard for Damon to evaluate when there's enough
  liquidity for a marketplace
- DO NOT build the marketplace until usage justifies it

**Exit:** 12 months of submission data; quarterly assessment report
generated.

---

## 8. Verifier

`scripts/surplus_check.py` (weekly):

- For 10 most recent accepted submissions, assert end-to-end traceability:
  submission → offer → acceptance → receipt → Cin7 inventory → QBO Bill
- Assert response SLA (24-48h) met on > 90% of submissions

---

## 9. Open questions

1. **Pricing policy**: what's the default % of retail we offer for
   "new in box" Class II? Default: 35%. Damon tunes.
2. **Pickup logistics**: do we self-pickup (LTL contracted) or have
   the hospital ship to us? Default: contracted LTL; ImportGenius
   data may help find a good freight broker.
3. **Expired stock policy**: do we ever buy expired stock for resale
   in markets that allow it (e.g., international)? Default: no.
   Expired stock = pass.
4. **Marketing**: how does the surplus landing page get discovered?
   SEO + outbound to hospital supply chain managers (identified via
   ImportGenius — PRD-08). Marketing PRD covers traffic plan.

---

## 10. Out-of-band

- Damon to draft "we buy surplus" outbound email template
- Marketing copy for `/surplus` (long-form, hospital-facing)
- Freight broker contract (LTL inbound from hospitals)
- Damon decides whether to gate the form behind email capture or
  allow fully anonymous first contact

---

## 11. Definition of done

- `/surplus` is live and SEO-indexed
- Submissions come in (target: 5+/month after 6 months)
- AI categorization quality is high enough that Damon's review is
  <5 min per submission
- First surplus inventory has flowed through to Cin7 + QBO + been
  resold at margin
- Repeat-supplier rate > 30% by month 12
