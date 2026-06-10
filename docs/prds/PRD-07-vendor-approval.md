# PRD-07 — Vendor Approval Automation (openFDA + GUDID + GS1)

**Source:** CTO Brief §6 (Priority #6)
**Owner:** Alex (CTO) + Damon (signs off on each vendor)
**Status:** draft
**Depends on:** PRD-01 (Platform), PRD-06 (HubSpot — vendor leads land in HubSpot vendor pipeline)
**Blocks:** PRD-08 (Quoting engine pulls only from approved vendors)

> "Vendor approval automation. Compliance-first product onboarding." — Brief §2

---

## 1. North star

A new foreign or domestic vendor is submitted → the system auto-queries
openFDA + GUDID + GS1 → returns FDA registration status, device
classes, recall history, GTIN validity → scores the vendor → either
auto-approves (Class 1, no recalls, registered) or flags for human
review. Damon never has to log into accessdata.fda.gov again.

---

## 2. Current state

- FDA verification done manually via `accessdata.fda.gov`
- GUDID entries done manually by Damon (error-prone, single-person
  bottleneck)
- GS1 barcodes used but not connected to internal system — printed
  manually, no registry cross-check
- `src/lib/services.js` simulators (`openfda`, `gs1`) and the existing
  `/admin/vendors` page are scaffolded — easy to wire to real APIs

---

## 3. Scope

### In scope

- Real integrations with openFDA (free), GUDID (free read; portal
  write), GS1 US Data Hub (paid)
- Vendor onboarding workflow: submit → auto-verify → score →
  approve/flag
- Product onboarding workflow: GS1 GTIN scan → openFDA UDI lookup →
  pre-validation form → submission to AccessGUDID portal
- "Approved Vendor Database" — our proprietary table; the moat
- ISO 13485-ready traceability: every product creation produces a
  GS1 + GUDID + FDA audit trail row

### Out of scope

- Direct write API to AccessGUDID (FDA doesn't offer one). We build
  the pre-validation form; submission goes through their portal with
  a one-click handoff.
- ISO 13485 certification itself (engineering supports it; the cert is
  an external audit)

---

## 4. Vendor scoring

A new vendor `application` is scored against:

```
score_components = {
  fda_registered:        +30   if registration is active
  fda_recall_history:    -10   per recall in last 24 months
  device_classes:        -5    per Class III device in their listing
                          0    Class I and II are neutral
  country_of_origin:     -5    if country is on a high-watch list
                                (e.g., requires additional review)
  business_age:          +5    if business is > 5 years
  prior_recall_class:    -20   if any Class I recall in last 5 years
  importgenius_volume:   +5    if importing to US > $100k/year
}

total = sum(components)

AUTO_APPROVE       if total >= 35 and no Class III, no Class I recalls
MANUAL_REVIEW      otherwise
AUTO_REJECT        if FDA registration is inactive OR
                      Class I recall in last 12 months
```

Tunable via `/admin/settings/vendor-scoring`.

---

## 5. API integrations

### 5.1 openFDA (free, no auth)

Endpoints used:

- `device/registrationlisting.json` — establishment status, device
  classes, country, owner/operator
- `device/classification.json` — FDA product code → device class, panel
- `device/recall.json` — recall history by manufacturer
- `device/udi.json` — GUDID UDI lookup
- `device/510k.json`, `device/pma.json` — premarket submissions
  (optional, useful for class III)

Rate limit: 1000 records/query; free API key for higher limits.

### 5.2 GUDID (read free, write via portal)

- READ: `api.fda.gov/device/udi.json` — full UDI record
- WRITE: build a pre-validation form that checks GUDID-required fields
  before a one-click portal submission. Fields validated:
  - Primary DI (GTIN)
  - Brand name, device description, version/model number
  - Labeler DUNS
  - Device GMDN term
  - Sterilization status
  - Lot/serial tracking flag
  - MRI compatibility
  - Single-use vs. reusable

### 5.3 GS1 US Data Hub (paid ~$500/yr+)

- `Verified by GS1` lookup: scan GTIN → company name, brand,
  package hierarchy
- Batch GTIN validation (up to 1000/call) — used at receiving in Cin7
  (PRD-04)
- GLN lookup for trading partner locations

---

## 6. Workflows

### 6.1 Vendor onboarding

```
A) Vendor self-service form submission OR rep enters in HubSpot
B) Auto-queries fire in parallel:
   - openFDA establishment registration (by FEI or company name)
   - openFDA recall history
   - ImportGenius (PRD-08) for volume signal
   - Optional: ZoomInfo for firmographics (open question)
C) Score computed (§4)
D) Decision:
   - AUTO_APPROVE → vendor moves to "Approved" status; Damon notified
     for visibility but no action required
   - MANUAL_REVIEW → "Pending" status; full evidence pack rendered in
     /admin/vendors/{id} for Damon's review
   - AUTO_REJECT → "Rejected" status; templated email sent to vendor
     explaining why; rep notified
E) Approved vendors are now eligible to upload product templates
   (quoting engine, PRD-08)
```

### 6.2 Product onboarding

```
A) Approved vendor uploads product spreadsheet (template provided)
B) System validates each row:
   - FDA product code: must be in our internal openFDA mirror
   - HTS code: validate via USITC API (PRD-08)
   - GTIN: validate via GS1 + check if it's a duplicate
   - Country of origin
   - GUDID required fields: completeness check
C) Auto-fill from openFDA UDI lookup wherever GTIN is already in GUDID
D) Generate pre-submission report → vendor reviews → submits to
   AccessGUDID via the FDA portal in one step
E) Product appears in Cin7 (PRD-04) as a draft; Damon approves
   activation
```

### 6.3 Recall monitoring (continuous)

- Cron job hourly hits openFDA `device/recall.json` for all our
  manufacturers
- New recall detected → flag in `/admin/compliance/recalls`
- Cross-reference with `lot_tracking` (PRD-04) → which customers got
  affected lot? Customer email auto-drafted (Damon approves before
  send)

---

## 7. Data model additions

```sql
-- vendors table extended (current shape stays, fields added)
ALTER TABLE vendors ADD COLUMN fda_fei TEXT;
ALTER TABLE vendors ADD COLUMN device_classes TEXT[];
ALTER TABLE vendors ADD COLUMN recall_count_24mo INT DEFAULT 0;
ALTER TABLE vendors ADD COLUMN approval_score INT;
ALTER TABLE vendors ADD COLUMN approval_decision TEXT; -- AUTO_APPROVE / MANUAL_REVIEW / AUTO_REJECT
ALTER TABLE vendors ADD COLUMN approved_by TEXT;
ALTER TABLE vendors ADD COLUMN approved_at TIMESTAMPTZ;

CREATE TABLE vendor_evidence (
  id           UUID PRIMARY KEY,
  vendor_id    TEXT REFERENCES vendors(id),
  kind         TEXT, -- 'openfda_registration', 'openfda_recall', 'importgenius'
  payload      JSONB,
  fetched_at   TIMESTAMPTZ
);

CREATE TABLE product_compliance (
  product_sku           TEXT PRIMARY KEY,
  fda_product_code      TEXT,
  fda_device_class      TEXT,
  hts_code              TEXT,
  gtin                  TEXT,
  gs1_verified_at       TIMESTAMPTZ,
  gudid_submitted_at    TIMESTAMPTZ,
  gudid_status          TEXT, -- pending / accepted / rejected
  country_of_origin     TEXT,
  last_compliance_check TIMESTAMPTZ
);
```

---

## 8. Phases

### Phase 1 — openFDA mirror

- Cron job pulls all relevant openFDA product codes + classifications
  into our local `fda_product_codes` table (rare changes; weekly is fine)
- Recall sweeps run hourly for our active vendors
- `services.js` `openfda` stub replaced with real calls

**Exit:** Querying our DB for "FRO" (Exam Gloves) returns the same
data as openFDA. A new recall posted by FDA appears in our admin within
2 hours.

### Phase 2 — Vendor scoring engine

- `vendorScoring.evaluate(application)` (extends existing
  `src/lib/accountApproval.js` pattern)
- `/admin/vendors/new` form posts to API → score → decision rendered
- Auto-approve / reject paths execute; Manual flagged for Damon's
  inbox

**Exit:** Score 5 known vendors manually; system arrives at the same
decision in 4/5 cases. Tune weights for the disagreement.

### Phase 3 — GS1 + GUDID pre-validation

- GS1 Data Hub credentials provisioned
- Batch GTIN check endpoint live at `POST /api/products/validate-gtin`
- GUDID pre-submission UI in `/admin/products/new` shows: missing
  fields, format errors, suggested values from openFDA
- One-click "Open in AccessGUDID" deep link with values pre-filled
  in a downloaded CSV

**Exit:** Damon submits a real product to AccessGUDID with all
required fields validated *before* portal entry, zero errors on
submission.

### Phase 4 — Continuous recall monitoring

- Job runs hourly, writes to `compliance_events` table
- `/admin/compliance/recalls` lists open issues with affected
  customers (via `lot_tracking`)
- Customer outreach drafted by Claude; Damon approves & sends

**Exit:** A test recall (we inject one in a test environment)
surfaces the correct customer list within 5 minutes.

### Phase 5 — HubSpot vendor pipeline

- New vendor pipeline in HubSpot (separate from sales)
- Stages: `Identified` → `Verified` → `Sample Ordered` → `First PO` →
  `Active`
- ImportGenius (PRD-08) auto-creates `Identified` leads from foreign
  manufacturer signals

**Exit:** End-to-end test: a new manufacturer appears in ImportGenius
data, HubSpot vendor lead created, openFDA evidence attached, Damon
clicks through to approve.

---

## 9. Verifier

`scripts/compliance_check.py` (daily):

- Random-sample 20 active products; for each assert: `fda_product_code`
  in openFDA mirror, `gtin` exists in our GS1 cache, `country_of_origin`
  set
- Assert no vendor in "Approved" status has an active Class I recall
  in last 12 months
- Alert on any policy violation

---

## 10. Open questions

1. **Class III devices**: brief is silent. Default: AUTO_REJECT
   Class III for v1; revisit when/if Unite scales into that segment.
2. **High-watch country list**: ops + Damon need to commit a list
   (likely starts with a "manual review" gate for first-time vendors
   from any country we haven't shipped from before).
3. **GUDID write automation**: FDA doesn't offer an API. Is there a
   semi-automated tool (Selenium, etc.) that's compliant? Probably not
   acceptable for compliance reasons. Keep portal-handoff approach.
4. **Recall outreach SLA**: brief says "within one business day". With
   sub-second `lot_tracking` queries from PRD-04, we can do 4 hours
   for routine, 1 hour for Class I.

---

## 11. Out-of-band

- openFDA API key (optional, free, for higher rate limits)
- GS1 US Data Hub subscription (~$500/yr+)
- ImportGenius access (covered in PRD-08)
- New env vars: `OPENFDA_API_KEY`, `GS1_USER_ID`, `GS1_API_KEY`

---

## 12. Definition of done

- Vendor onboarding workflow runs end-to-end with auto-approve and
  manual-review paths both demonstrated
- Damon hasn't manually logged into accessdata.fda.gov for a vendor
  check in 30 days
- All active products have a `product_compliance` row with no missing
  required fields
- Recall sweep has caught at least one real recall and surfaced the
  affected customer list correctly
- ISO 13485 readiness assessment passes (auditor's checklist of
  traceability evidence)
