# PRD-16 — Global Quoting Engine v3: The Formidable System

**Source:** CTO Brief §7 — "This is the system that no competitor at Unite Medical's scale offers as a customer-facing tool. It transforms Unite Medical from a distributor into an intelligent sourcing platform."
**Owner:** Alex (CTO) — this is the company
**Status:** mostly shipped (client-side) 2026-06-15 — 6-component landed cost, tier margins + floor, freight-mode comparison (PRD-08/16), branded PDF (PRD-17), FDA auto-classification of un-coded lines (`classifyMissingFdaCodes`), tokenized acceptance (`/q/:token` → order), and multi-vendor compare (`compareVendorOffers`). Live USITC/Flexport/ImportGenius feeds deferred to their integration PRDs.
**Depends on:** PRD-01, PRD-03 (Flexport live), PRD-07 (vendor approval live), PRD-08 (v2 foundation), PRD-11 (Claude), PRD-15 (ImportGenius), PRD-17 (PDF pipeline), PRD-18 (XLSX support)
**Blocks:** "Unite Source" product launch — the thing that makes Unite Medical a technology company, not just a distributor

> "It transforms Unite Medical from a distributor into an intelligent sourcing platform." — Brief §7

---

## 1. North star

An approved foreign vendor uploads a product template → in seconds the system validates every FDA code, pulls live duty rates from USITC, generates real freight quotes from Flexport (LCL + FCL + air), calculates true landed cost per unit, applies tier-based margin policy, generates a professional branded PDF with a Claude-drafted cover letter, and emails it to the customer — all without a human touching a single field. The customer clicks "Accept" and a QBO invoice auto-creates. This is Unite Medical's core IP. This is "Unite Source."

---

## 2. Why v3 exists (what v2 doesn't cover)

PRD-08 laid the architectural foundation. But Damon's vision in the brief is a **fully autonomous, end-to-end system** that PRD-08 only partially addresses. The gaps:

| What the brief demands | PRD-08 status | This PRD fills |
|---|---|---|
| Vendor uploads Excel/CSV template | CSV only; XLSX errors out | Full XLSX + CSV + template generation (PRD-18) |
| Platform validates FDA codes via openFDA | Hardcoded fallback table of 8 codes | Live openFDA with full coverage + classification assist |
| Pulls current duty rate for each HTS code | Hardcoded table of 15 codes | Live USITC HTS API via backend proxy (PRD-01) |
| Calls Flexport API to generate freight quotes — LCL AND FCL | Synthetic rates; no mode selection | Real Flexport booking_quotes with LCL/FCL/air comparison |
| Landed cost calculated with ALL components | Missing: customs brokerage, drayage, warehouse receiving | Full 6-component landed cost formula |
| Markup applied based on customer tier | Hardcoded 60% — margin policy exists but not wired to customer records | Auto-resolves tier from HubSpot/customer record |
| Customer quote generated as a professional PDF | No PDF generation exists | Branded multi-page PDF (PRD-17) |
| With delivery timeline and compliance notes | No ETA calculation from real Flexport data; no compliance panel | Full ETA + compliance evidence panel |
| In seconds | Current pipeline: ~2 seconds (all stubs) | Target: < 30 seconds for 50-line sheet with all caches cold |
| Vendor approved before quoting allowed | No gate — anyone can quote | Vendor must be `approved` in PRD-07 pipeline |
| Customer self-serve | Not implemented | Authenticated approved customers get `/quote` access |
| Multi-vendor comparison | Not implemented | Best-price sourcing across approved vendor network |
| Quote acceptance → QBO invoice | Not implemented | One-click acceptance creates draft invoice |

---

## 3. The complete pipeline (what "formidable" means)

This is the full, no-shortcuts, production pipeline — every step real:

```
┌─────────────────────────────────────────────────────────────────┐
│                     INTAKE                                       │
│  Vendor/rep uploads Excel or CSV template                       │
│  → Server parses via SheetJS (XLSX) or RFC-4180 (CSV)           │
│  → Row-level validation: required fields, format checks         │
│  → Saves to quotes + quote_items in 'parsing' status            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     VENDOR GATE                                  │
│  Is vendor in approved_vendors table with status='approved'?     │
│  → NO: reject quote, redirect to vendor approval (PRD-07)       │
│  → YES: attach vendor compliance evidence to quote               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     FDA VALIDATION                               │
│  For each line item:                                             │
│  → If FDA product code provided: validate via openFDA            │
│    classification API (LIVE, CORS-enabled)                       │
│  → If missing: Claude (PRD-11) suggests from product             │
│    description → openFDA validates the suggestion                │
│  → Store: device_class, regulation_number, recall_check          │
│  → Flag lines with unrecognized codes (don't kill the quote)     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     HTS DUTY RATES                               │
│  For each line item:                                             │
│  → If HTS code provided: query USITC HTS REST API (via          │
│    backend proxy — USITC has no CORS)                            │
│  → If missing: Claude suggests from product description          │
│    (in English or Chinese) → USITC validates                     │
│  → Store: hts_code, description, mfn_rate, special_rates         │
│  → Handle tariff schedule changes automatically                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     FREIGHT QUOTING                              │
│  Call Flexport Public API /booking_quotes:                       │
│  → Input: origin port, destination port, total CBM, weight       │
│  → Returns: LCL rate, FCL rate (if volume justifies), air rate   │
│  → Each rate includes: ocean freight, customs brokerage,         │
│    drayage, transit time, valid-until date                       │
│  → User selects preferred mode (default: cheapest)               │
│  → Store freight_quote_id + selected rate                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     LANDED COST CALCULATION                      │
│  Per unit:                                                       │
│    landed = fob_price                                            │
│           + (fob_price × duty_pct)           # from USITC        │
│           + ocean_freight_per_unit            # from Flexport     │
│           + customs_brokerage_per_unit        # from Flexport     │
│           + drayage_per_unit                  # from Flexport     │
│           + warehouse_receiving_per_unit      # configurable      │
│                                                                  │
│  Current code uses: fob * (1 + duty) + $0.42 flat               │
│  v3 uses: all 6 real components from Flexport invoice data       │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     MARGIN + PRICING                             │
│  → Resolve customer tier from HubSpot/customer record            │
│    (A: 30%, B: 50%, C: 60%, Distributor: 25%, Gov: 20%)         │
│  → sell_per_unit = landed / (1 - margin)                         │
│  → Rep can override per-line (audit-logged, manager-visible)     │
│  → Floor enforcement: no line sells below landed + 10%           │
│  → ext_sell = sell_per_unit × target_quantity                    │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     COMPLIANCE PANEL                             │
│  Per line item, 4-category compliance status:                    │
│  → FDA Status: registration verified, device class, recalls     │
│  → Quality System: ISO/QMS status of vendor (PRD-07)            │
│  → Product Testing: testing standards (vendor-attested)          │
│  → Certifications: PDAC, Berry, TAA, etc.                       │
│  Source: product_compliance + vendors tables                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     GS1 VALIDATION                               │
│  For lines with GTINs:                                           │
│  → Local mod-10 check-digit validation                           │
│  → If GS1 API configured: registry verification                 │
│  → Flag invalid GTINs (warning, not blocking)                    │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     AI COVER LETTER                              │
│  Claude (PRD-11) drafts:                                         │
│  → Executive summary: what's in the quote, total value, ETA     │
│  → Compliance confidence statement                               │
│  → Delivery timeline with port of arrival                        │
│  → Acceptance instructions                                       │
│  → Damon can edit before sending                                 │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     PDF GENERATION (PRD-17)                      │
│  Branded, multi-page PDF:                                        │
│  → Cover letter page                                             │
│  → Line items table (SKU, qty, unit price, ext price)            │
│  → Delivery timeline + ETA + port                                │
│  → Compliance summary block                                      │
│  → Terms & conditions                                            │
│  → Stored in R2 with 90-day signed URL                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│                     DELIVERY                                     │
│  → Email via Resend: PDF attached + acceptance link              │
│  → Customer acceptance page: /q/{token}                          │
│  → Accept → draft QBO invoice (PRD-02) + deal stage update       │
│  → Counter → notification to rep + inline counter UI             │
│  → Decline → notification + reason capture                       │
│  → Quote expires per validity window (default 14 days)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Multi-vendor comparison (new capability)

When a customer requests a quote for a product category (not a specific vendor), the system:

1. Identifies all approved vendors in that product category (PRD-07 approved vendor database)
2. Pulls each vendor's FOB pricing from their most recent template
3. Runs the full pipeline for each vendor in parallel
4. Presents a comparison table: vendor A vs. vendor B vs. vendor C — landed cost, ETA, compliance score
5. Rep or customer selects preferred vendor
6. Quote generated from the winning vendor

This is the "intelligent sourcing platform" — Unite Medical doesn't just distribute, it finds the best global source for every product.

---

## 5. Customer self-serve quoting

Authenticated approved customers (PRD-14, tier A + approved distributors) access a simplified `/quote` UI:

1. Customer selects product category or enters product description
2. System matches against approved vendor catalog
3. Customer specifies quantity + delivery timeline
4. Full pipeline runs automatically (vendor already approved, no gate needed)
5. Quote PDF presented in-browser with "Accept" button
6. Acceptance creates order + QBO invoice → fulfillment begins

**Key difference from rep-initiated quotes**: no margin override, no landed-cost visibility, no vendor selection. The system picks the best vendor automatically. Customer sees only: product, quantity, unit price, total, ETA.

---

## 6. Quote template generator

For vendor onboarding, Unite Medical provides a downloadable template:

- `/api/quote/template.xlsx` — pre-formatted Excel with all column headers, data validation rules (dropdown for country codes, format mask for HTS codes), and a sample row
- `/api/quote/template.csv` — same as CSV
- Template includes instructions sheet explaining each field
- Template is versioned — vendor's uploaded sheet must match the current template version or the system guides them through changes

---

## 7. Performance requirements

| Metric | Target |
|---|---|
| 10-line vendor sheet, all caches cold | < 15 seconds |
| 50-line vendor sheet, all caches cold | < 30 seconds |
| 50-line sheet, warm caches (FDA + HTS) | < 10 seconds |
| PDF generation | < 5 seconds |
| Email delivery (send to Resend) | < 2 seconds |
| Customer acceptance → QBO invoice | < 3 seconds |

To achieve this:
- openFDA + HTS results cached in Redis (PRD-01) with 24-hour TTL
- Flexport quotes cached with their `valid_until` as TTL
- FDA + HTS lookups run in parallel (Promise.all), not sequential
- PDF generation runs server-side (not browser)

---

## 8. Phases

### Phase 1 — Live USITC HTS via backend proxy

- Build `/proxy/hts` route in Fastify backend (PRD-01)
- `hts.js` client switches from embedded fallback to real API when proxy available
- Cache responses in Redis with 24-hour TTL
- Handle USITC API errors gracefully (fall back to embedded table)
- Claude HTS classification assist for missing codes

**Exit:** 50 HTS lookups against real USITC API complete in < 5 seconds via proxy. Results match manual lookup at hts.usitc.gov.

### Phase 2 — Full openFDA coverage + classification assist

- Expand `FALLBACK_PRODUCT_CODES` to cover all FDA product codes in Unite Medical's catalog (87+ products)
- Add Claude `quoting/fda_classify` prompt for unknown product descriptions
- Chain: Claude suggests → openFDA validates → store classification
- Surface classification confidence score per line

**Exit:** A vendor sheet with 10 products that have no FDA codes gets Claude-suggested codes that openFDA validates for 80%+ of lines.

### Phase 3 — Real Flexport freight quotes with mode comparison

- Replace synthetic rates with real Flexport `/booking_quotes` API
- Return LCL + FCL + air options with transit times
- Show comparison table in UI: cost vs. speed tradeoff
- Default selection: cheapest that meets delivery timeline
- Store `freight_quote_id` and `valid_until` on quote record

**Exit:** Freight quotes match what Flexport portal shows (within 5%) for the same shipment parameters.

### Phase 4 — Full 6-component landed cost

- Replace the flat `$0.42 FREIGHT_PER_UNIT_USD` with real components from Flexport:
  - Ocean freight per unit (total freight / total units)
  - Customs brokerage per unit (from Flexport invoice data)
  - Drayage per unit (from Flexport)
  - Warehouse receiving per unit (configurable in admin, default $0.25)
- Landed cost formula is auditable — every component stored and visible to internal users
- Admin can adjust warehouse receiving rate at `/admin/settings/margin`

**Exit:** Landed cost for a 10-line quote matches a manual Excel calculation within $0.01/unit.

### Phase 5 — Customer tier auto-resolution + margin enforcement

- When a quote is created for a customer, resolve their tier from HubSpot/customer record
- Apply tier margin automatically
- Rep override with audit log (who, when, what margin, why)
- Floor enforcement: system rejects any line where sell < landed × 1.10 (10% minimum margin)
- Manager approval required for margins below tier default

**Exit:** Switching a quote's customer from tier C to tier A reprices all lines correctly. A rep override below 10% margin is rejected.

### Phase 6 — Multi-vendor comparison engine

- For a product category, query all approved vendors with FOB data
- Run parallel quoting pipelines (each vendor gets their own landed cost)
- Comparison view: side-by-side vendor comparison with landed cost, ETA, compliance score
- "Select vendor" → quote generated with that vendor's pricing
- Store comparison data for analytics (which vendors win, why)

**Exit:** A quote request for "knee braces" compares 3 approved vendors and selects the lowest landed cost option automatically.

### Phase 7 — Quote acceptance workflow

- Customer acceptance landing page: `/q/{token}`
- Accept: creates draft QBO invoice (PRD-02), updates deal stage in HubSpot (PRD-06), notifies rep
- Counter: customer enters counter-price per line → notification to rep → rep reviews + responds
- Decline: reason capture → HubSpot deal marked lost with reason
- Expiry: quotes past `valid_until` show "expired" status with "Request refresh" button
- All actions audit-logged

**Exit:** End-to-end: quote sent → customer accepts → QBO invoice created → rep notified. Under 5 minutes total.

### Phase 8 — Customer self-serve portal

- Authenticated `/quote` page for approved customers
- Simplified UI: product search/select → quantity → "Get quote"
- Full pipeline runs in background
- PDF presented in-browser with "Accept" button
- No landed-cost visibility, no vendor selection, no margin override
- Rate limiting: 10 quotes/day per customer

**Exit:** An A-tier customer creates a self-serve quote and accepts it without any rep intervention. QBO invoice is correct.

---

## 9. Verifier

`scripts/quoting_v3_check.py` (nightly):

- For the 20 most recent quotes, recompute landed cost from raw inputs — assert match within $0.01
- Assert every quote line has: `fda_status`, `hts_validated`, `freight_quote_id`, `gtin_validated`, `vendor.approved_at`
- Assert no quote uses a vendor that isn't in the approved vendor database
- Assert no quote line has margin below 10%
- Assert PDF exists in R2 for every quote with status ≥ 'sent'
- Assert all Flexport freight quotes are within their `valid_until` window at time of send
- Run a synthetic 10-line quote through the full pipeline — assert completion in < 15 seconds

---

## 10. Open questions

1. **"Unite Source" branding**: do we name this product? The brief hints at it. Recommendation: yes — "Unite Source: Real-Time Global Quoting" — and feature it on the website.
2. **Self-serve customer segments**: which tiers get self-serve? Brief says the system is "customer-facing." Recommendation: A-tier + approved distributors for v1, expand to B-tier in v2.
3. **Chinese product descriptions**: vendors may submit sheets in Chinese. Claude can translate, but do we guarantee accuracy for HTS classification from translated descriptions? Recommendation: flag as "AI-translated" with lower confidence; require human review for HTS on translated products.
4. **Freight quote validity**: Flexport rates are typically valid 7 days. If a customer accepts a quote on day 12, do we honor the original price or re-quote? Recommendation: re-quote freight, hold margin, notify customer if total changes.
5. **Minimum order value**: should there be a minimum quote value to prevent abuse of the self-serve system? Recommendation: $5,000 minimum for self-serve; no minimum for rep-initiated.

---

## 11. Out-of-band

- USITC HTS API account (free — register at usitc.gov)
- Flexport API credentials with booking_quotes access (confirm with Flexport account manager)
- R2 bucket for PDF storage (`R2_QUOTES_BUCKET`)
- Resend account for quote delivery emails
- Domain for customer acceptance page (`unitemedical.com/q/*`)
- New env vars: `USITC_HTS_API_KEY`, `R2_QUOTES_BUCKET`, `RESEND_API_KEY`

---

## 12. Definition of done

- A 50-line vendor sheet runs the COMPLETE pipeline — FDA, HTS, freight, landed cost, margin, PDF, email — in under 30 seconds
- Every component of landed cost is real (no hardcoded values)
- Multi-vendor comparison works for at least 3 approved vendors
- Customer self-serve quoting is live for A-tier customers
- Quote acceptance creates a QBO invoice automatically
- The system can be demoed to a prospective customer and they say "nobody else does this"
- The product has a name and a page on the website
