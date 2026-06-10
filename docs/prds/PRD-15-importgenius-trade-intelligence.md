# PRD-15 — ImportGenius Trade Intelligence Platform

**Source:** CTO Brief §7 (Priority #7) — "Trade Intelligence & Global Quoting Engine"
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01, PRD-06 (HubSpot for lead push), PRD-07 (vendor approval pipeline), PRD-11 (Claude for enrichment)
**Blocks:** PRD-16 (Quoting Engine v3 vendor/customer discovery)

> "ImportGenius Enterprise API provides daily-updated U.S. customs data queryable by product description, HS code, company name, port, and country." — Brief §7

---

## 1. North star

Unite Medical uses real U.S. customs trade data to (a) discover foreign manufacturers that competitors don't know exist, and (b) identify domestic hospitals importing their own supplies — who should be buying from Unite instead. Every discovered entity flows into the right HubSpot pipeline within minutes, with full trade-data enrichment, ready for outreach.

---

## 2. Current state

- ImportGenius is subscribed to (Enterprise plan, $899/user/mo) but used manually via web interface
- `src/lib/vendorScoring.js` has a placeholder field `importgenius_annual_usd` that contributes +5 points to vendor scoring but is never populated from real data
- No `importgenius.js` API client exists in `src/lib/external/`
- PRD-08 Phase 6 allocates a single phase to "ImportGenius integration" — insufficient for the scope the brief describes
- No admin discovery UI exists
- No automated lead flow from trade data to HubSpot

---

## 3. Scope

### In scope

- **API client** (`src/lib/external/importgenius.js`) wrapping the ImportGenius Enterprise REST API
- **Vendor discovery workflow**: search by HS code + origin country + volume thresholds → display manufacturers shipping medical devices to U.S. importers → one-click "Push to HubSpot" as vendor leads → auto-trigger vendor approval pipeline (PRD-07)
- **Customer prospecting workflow**: search by importer name + product description → identify hospitals/clinics importing their own supplies → push as customer leads to HubSpot (PRD-06)
- **Competitive intelligence**: for a given product category, show which domestic distributors are importing what, from whom, at what volume — Unite Medical's competitive map
- **Enrichment layer**: Claude (PRD-11) reads trade records and generates a one-paragraph vendor/customer profile for each discovered entity
- **Admin UIs**: `/admin/discovery/vendors` and `/admin/discovery/customers` with search, filters, saved searches, batch push
- **Automated weekly batch**: scheduled job runs saved searches, pushes new results to HubSpot, sends summary digest to VP Sales
- **Data feed into vendor scoring**: populate `importgenius_annual_usd` on vendor records automatically

### Out of scope

- Real-time streaming of customs data (ImportGenius updates daily; that's sufficient)
- Building our own customs data pipeline (we use ImportGenius as the data source)
- International trade data beyond U.S. imports (22-country coverage exists; focus on U.S. inbound for v1)
- Price negotiation automation based on trade data

---

## 4. API contract

ImportGenius Enterprise API: `data.importgenius.com/v2`

```
GET /v2/shipments?q=<search>&hs_code=<code>&country=<origin>&date_from=<iso>&date_to=<iso>&limit=50&offset=0

Response:
{
  "total": 12847,
  "shipments": [
    {
      "id": "IG-2026-884921",
      "bill_of_lading": "COSU6284729100",
      "importer_name": "ATLANTA SURGICAL CENTER LLC",
      "importer_address": "...",
      "shipper_name": "GUANGZHOU MEDICAL DEVICES CO LTD",
      "shipper_address": "...",
      "product_description": "KNEE BRACES ORTHOPEDIC SUPPORT DEVICES CLASS II",
      "hs_code": "9021.10.0090",
      "origin_country": "CN",
      "port_of_entry": "SAVANNAH GA",
      "vessel_name": "CMA CGM MARCO POLO",
      "arrival_date": "2026-03-15",
      "quantity": 25000,
      "weight_kg": 3400,
      "value_usd": 187500
    }
  ]
}
```

Auth: API key in header `Authorization: Bearer <IMPORTGENIUS_API_KEY>`

Rate limits: Enterprise tier — 1,000 requests/day, 100 results/request (paginated).

---

## 5. Vendor discovery workflow (detailed)

### Search → Score → Approve → Onboard

1. **Admin enters search criteria** at `/admin/discovery/vendors`:
   - HS codes (e.g., `9021.10` — orthopedic appliances)
   - Origin countries (CN, MY, VN, TW, KR)
   - Minimum annual shipment volume (e.g., > $100K)
   - Date range (default: last 12 months)
   - Exclude known vendors (cross-reference `vendors` table)

2. **System queries ImportGenius API** and returns deduplicated manufacturers

3. **Claude enrichment** (PRD-11 prompt: `importgenius/vendor_profile`):
   - Input: shipper name, product descriptions, volumes, countries, HS codes
   - Output: one-paragraph vendor profile, estimated product categories, risk notes (e.g., "ships only Class I → low regulatory risk")

4. **Admin reviews results** in a sortable table:
   - Columns: manufacturer name, country, product summary, annual volume, # shipments, U.S. importers they serve, Claude profile
   - Filters: by country, volume range, device class (estimated from HS)

5. **One-click actions**:
   - "Push to HubSpot" → creates a HubSpot Company + Contact (if discoverable) tagged `lead_source=importgenius`, `pipeline=vendor_discovery`
   - "Start vendor approval" → creates a `vendors` record and kicks off the PRD-07 scoring pipeline (openFDA registration check, recall history, etc.)
   - "Save search" → persists the query for weekly automated re-runs

---

## 6. Customer prospecting workflow (detailed)

### Find hospitals importing directly → convert to Unite customers

1. **Admin enters search criteria** at `/admin/discovery/customers`:
   - Product descriptions ("diagnostic test kits", "surgical gloves", "orthopedic braces")
   - HS codes
   - Importer type filter: hospitals, surgery centers, clinics (Claude classifies from importer name + address)
   - Minimum import volume

2. **System queries ImportGenius** and returns deduplicated importers

3. **Claude classification** (PRD-11 prompt: `importgenius/customer_classify`):
   - Input: importer name, address, product descriptions
   - Output: entity type (hospital / ASC / clinic / distributor / retailer / other), estimated annual spend, recommended customer tier (A/B/C)

4. **Admin reviews + pushes to HubSpot** as customer leads tagged `lead_source=importgenius`

5. **Automated outreach**: Claude drafts personalized outreach email (PRD-11 prompt: `importgenius/customer_outreach`) explaining how Unite Medical can supply the same products at better pricing with compliance support

---

## 7. Data model additions

```sql
-- Migration: 0015_importgenius.sql

CREATE TABLE IF NOT EXISTS importgenius_searches (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,            -- "Q2 Knee Brace Manufacturers - China"
  search_type   TEXT NOT NULL CHECK (search_type IN ('vendor', 'customer', 'competitive')),
  query_params  JSONB NOT NULL,           -- { hs_codes, countries, min_volume, date_range }
  is_automated  BOOLEAN DEFAULT false,    -- runs weekly if true
  last_run_at   TIMESTAMPTZ,
  result_count  INTEGER DEFAULT 0,
  created_by    TEXT REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS importgenius_results (
  id                  TEXT PRIMARY KEY,
  search_id           TEXT REFERENCES importgenius_searches(id),
  ig_shipment_id      TEXT,               -- ImportGenius record ID
  entity_type         TEXT NOT NULL CHECK (entity_type IN ('manufacturer', 'importer')),
  entity_name         TEXT NOT NULL,
  entity_country      TEXT,
  product_description TEXT,
  hs_code             TEXT,
  annual_volume_usd   NUMERIC,
  shipment_count      INTEGER,
  ai_profile          TEXT,               -- Claude-generated profile paragraph
  ai_classification   JSONB,              -- { type, tier, risk_notes }
  hubspot_push_id     TEXT,               -- HubSpot company/contact ID once pushed
  vendor_id           TEXT REFERENCES vendors(id),  -- linked once vendor approval starts
  status              TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'pushed', 'approved', 'rejected', 'dismissed')),
  discovered_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ig_results_entity ON importgenius_results(entity_name);
CREATE INDEX idx_ig_results_search ON importgenius_results(search_id);
CREATE INDEX idx_ig_results_status ON importgenius_results(status);
```

---

## 8. Phases

### Phase 1 — API client + basic search

- Build `src/lib/external/importgenius.js` with `realOrStub()` pattern
- Endpoints: `searchShipments({ hs_codes, countries, date_range, importer, shipper, limit, offset })`
- Stub returns realistic sample data (10 records)
- Basic `/admin/discovery` page with search form + results table

**Exit:** A search for `hs_code=9021.10, country=CN` returns paginated results in under 3 seconds.

### Phase 2 — Vendor discovery UI + Claude enrichment

- Full `/admin/discovery/vendors` page
- Claude `importgenius/vendor_profile` prompt
- Deduplication logic (same manufacturer, different shipments → single row with aggregates)
- "Save search" functionality

**Exit:** A saved search produces a deduplicated manufacturer list with Claude profiles for 20+ vendors.

### Phase 3 — Customer prospecting UI + classification

- `/admin/discovery/customers` page
- Claude `importgenius/customer_classify` prompt
- Entity type classification + tier recommendation
- Outreach email drafting

**Exit:** A search for "hospitals importing diagnostic kits" returns 10+ classified prospects with tier recommendations.

### Phase 4 — HubSpot push integration

- "Push to HubSpot" creates Company + Contact records via PRD-06
- Tags: `lead_source=importgenius`, enrichment fields populated
- Vendor push triggers PRD-07 approval pipeline
- Customer push creates a Deal in the B2B Wholesale pipeline

**Exit:** 50 entities pushed to HubSpot in a batch; all have correct tags, enrichment, and pipeline assignment.

### Phase 5 — Automated weekly batch + vendor scoring feed

- Saved searches with `is_automated=true` run weekly via scheduled job
- New results (not previously seen) auto-push to HubSpot
- Summary digest email to VP Sales: "15 new vendor leads, 8 new customer prospects this week"
- Populate `importgenius_annual_usd` on vendor records for scoring (PRD-07)

**Exit:** Weekly batch runs unattended for 4 consecutive weeks; VP Sales confirms leads are actionable.

### Phase 6 — Competitive intelligence dashboard

- `/admin/discovery/competitive` page
- For a given HS code: show all domestic importers, their suppliers, volumes, and trends
- "Who else is importing what we import?" view
- Trend charts: volume by quarter, new entrants, supplier shifts

**Exit:** Damon can see the competitive landscape for any product category Unite Medical sells.

---

## 9. AI prompts (new)

| Key | Model | Purpose |
|---|---|---|
| `importgenius/vendor_profile` | claude-sonnet-4-6 | Generate vendor profile from trade data |
| `importgenius/customer_classify` | claude-sonnet-4-6 | Classify importer as hospital/ASC/clinic/distributor |
| `importgenius/customer_outreach` | claude-sonnet-4-6 | Draft personalized outreach email |
| `importgenius/competitive_summary` | claude-sonnet-4-6 | Summarize competitive landscape for a product category |

---

## 10. Verifier

`scripts/importgenius_check.py`:

- Assert API client handles rate limiting (429) gracefully
- Assert deduplication produces unique entities (no duplicates in results table)
- Assert every pushed entity has a valid `hubspot_push_id`
- Assert automated searches ran within the last 8 days

---

## 11. Open questions

1. **Single user vs. multi-user**: ImportGenius charges $899/user/mo. Do we start with one shared API key or do VP Sales + Damon each need access? Recommendation: single shared key for v1.
2. **Data retention**: ImportGenius TOS on storing their data locally? Recommendation: store aggregates + our enrichment, not raw shipment records.
3. **Volume threshold for "interesting"**: what minimum annual import volume makes a vendor or customer worth pursuing? Recommendation: $50K for vendors, $25K for customers.
4. **Outreach automation**: should outreach emails send automatically or require human approval? Recommendation: human approval for v1.

---

## 12. Out-of-band

- Confirm ImportGenius Enterprise subscription is active and API access is enabled
- Obtain API key from ImportGenius developer portal
- New env vars: `IMPORTGENIUS_API_KEY`
- Coordinate with VP Sales on search criteria and lead qualification standards
- Budget: $899/mo minimum (already subscribed)

---

## 13. Definition of done

- ImportGenius API client is live and returning real trade data
- Admin can discover vendors and customers with full enrichment
- Weekly automated batch produces > 50 qualified leads flowing into HubSpot
- Vendor scoring engine uses real ImportGenius volume data
- Competitive intelligence dashboard shows market landscape for Unite Medical's top 5 product categories
