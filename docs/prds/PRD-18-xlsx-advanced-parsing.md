# PRD-18 — XLSX Upload Support & Advanced Sheet Parsing

**Source:** CTO Brief §7 — "Approved foreign vendor uploads product template (Excel/CSV)"
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01 (backend — SheetJS can't run safely in browser at reasonable bundle size)
**Blocks:** PRD-16 (quoting engine v3 requires XLSX support)

> "Approved foreign vendor uploads product template (Excel/CSV) — fields: product name, FDA product code, HTS code, FOB price, MOQ, lead time, country of origin" — Brief §7

---

## 1. North star

A vendor uploads any reasonable spreadsheet — Excel, CSV, even a Google Sheets export — and the system parses it correctly, maps columns intelligently, handles Chinese/multilingual text, validates every row, and feeds clean data into the quoting pipeline. The vendor never sees an error message about file format.

---

## 2. Current state

- `src/lib/vendorSheet.js` has a solid RFC-4180 CSV parser (handles quoted fields, embedded commas, embedded newlines, escaped quotes)
- XLSX upload explicitly returns an error: `"XLSX upload isn't supported in the browser today. Export the sheet as CSV..."`
- Column aliasing exists for 12 fields with multiple aliases each — well designed
- GTIN validation (mod-10) runs on upload
- HTS format validation runs on upload
- No server-side parsing exists (everything runs in browser)
- No support for non-English text in product descriptions
- No template validation (vendor could upload any random spreadsheet)

---

## 3. Scope

### In scope

- **Server-side XLSX/XLS parsing** via SheetJS (`xlsx` npm package) on the Fastify backend
- **Multi-sheet support**: if the workbook has multiple sheets, auto-detect the data sheet (largest row count with matching headers)
- **Intelligent column mapping**: beyond aliases — use fuzzy matching + Claude to map ambiguous headers (e.g., "单价" → `fob_price_usd`, "产品名称" → `product_name`)
- **Multilingual support**: product descriptions in Chinese, Vietnamese, Korean → Claude translates to English for FDA/HTS classification while preserving original
- **Template version validation**: check uploaded sheet against current template version, guide vendor through schema changes
- **Downloadable template**: `/api/quote/template.xlsx` with data validation rules, dropdowns, and instruction sheet
- **Upload size limits**: 10MB max, 500 rows max per sheet
- **Progress feedback**: server-sent events (SSE) for real-time parsing progress on large sheets

### Out of scope

- Google Sheets API integration (vendor exports to XLSX/CSV first)
- PDF parsing (vendors don't upload product lists as PDFs... usually)
- Drag-and-drop folder upload

---

## 4. Server-side parsing endpoint

```
POST /api/quote/parse
Content-Type: multipart/form-data

Body:
  file: <uploaded .xlsx, .xls, or .csv file>
  vendor_hint: "Guangzhou Medical Devices Co" (optional)
  customer_id: "org_12345" (optional, for tier resolution)

Response (SSE stream):
  event: progress
  data: { "step": "parsing", "detail": "Reading sheet 1 of 3..." }

  event: progress
  data: { "step": "columns", "detail": "Mapped 10/12 columns. Unmapped: packaging, notes" }

  event: progress
  data: { "step": "translation", "detail": "Translating 8 Chinese product descriptions..." }

  event: progress
  data: { "step": "validation", "detail": "42/45 rows valid. 3 warnings." }

  event: complete
  data: {
    "ok": true,
    "vendor": "Guangzhou Medical Devices Co",
    "lines": [...],
    "warnings": ["Row 12: GTIN check-digit invalid", ...],
    "errors": [],
    "totals": { "rows": 45, "accepted": 42, "skipped": 3 },
    "column_map": { "product_name": 0, "fob_price_usd": 3, ... },
    "translations": [{ "row": 5, "original": "膝关节支具", "english": "Knee joint brace" }]
  }
```

---

## 5. Intelligent column mapping

Current alias system in `vendorSheet.js` handles standard English headers well. For v3 we add:

### Layer 1 — Exact alias match (existing)
```js
COLUMN_ALIASES = {
  product_name: ['product_name', 'product', 'name', 'item', 'sku description'],
  fob_price_usd: ['fob_price_usd', 'fob price', 'fob', 'unit cost', 'cost', 'price'],
  // ...
}
```

### Layer 2 — Chinese/multilingual aliases (new)
```js
COLUMN_ALIASES_INTL = {
  product_name:     ['产品名称', '品名', '商品名', '제품명', 'tên sản phẩm'],
  fob_price_usd:    ['单价', 'FOB价格', '出厂价', '단가', 'giá FOB'],
  hts_code:         ['海关编码', 'HS编码', '관세코드'],
  moq:              ['最小起订量', '최소주문수량'],
  country_of_origin:['原产国', '원산지'],
}
```

### Layer 3 — Claude fallback (new)
If > 2 required columns are unmapped after Layer 1+2, send the header row to Claude:
```
Prompt: Given these spreadsheet column headers: ["品名", "型号", "单价(美元)", "起订量", "交期"]
Map each to one of: product_name, fda_product_code, hts_code, fob_price_usd, moq, lead_time_days, country_of_origin, description, gtin, packaging, target_quantity, notes
Return a JSON mapping.
```

---

## 6. Template generator

`/api/quote/template.xlsx` — downloadable Excel template with:

**Sheet 1: "Product Data"**
- All 12 columns with headers
- Data validation:
  - `country_of_origin`: dropdown of ISO-2 codes
  - `fob_price_usd`: number format, > 0
  - `moq`: integer, > 0
  - `hts_code`: text format (preserves leading zeros)
  - `fda_product_code`: 3 uppercase letters
- One sample row filled in
- Conditional formatting: required fields highlighted

**Sheet 2: "Instructions"**
- Field-by-field guide
- HTS code lookup instructions
- FDA product code lookup instructions
- Contact info for help

**Sheet 3: "Reference"**
- Common FDA product codes for Unite Medical's categories
- Common HTS codes for medical supplies
- Country code reference

---

## 7. Phases

### Phase 1 — Server-side XLSX parsing

- Add `xlsx` (SheetJS Community Edition) to backend dependencies
- Build `/api/quote/parse` endpoint accepting multipart file upload
- Parse XLSX + XLS + CSV (unified pipeline)
- Multi-sheet detection: pick the sheet with most data rows that have matching headers
- Return parsed data in same shape as `parseVendorSheetText()` output

**Exit:** A 50-row XLSX file uploads, parses, and returns structured data in under 2 seconds.

### Phase 2 — Multilingual column mapping

- Add international alias table (Chinese, Vietnamese, Korean)
- Claude fallback for unmapped columns
- Return `column_map` in response showing how each column was mapped (and confidence)
- UI shows mapping confirmation step: "We mapped your columns like this — correct?"

**Exit:** A Chinese-header XLSX file maps all required columns correctly (or with Claude assist) and surfaces a confirmation UI.

### Phase 3 — Translation + validation

- Claude translates non-English product descriptions to English
- Store both original and translated text
- Translated text feeds into FDA/HTS classification
- Original text preserved for vendor communication
- Validation: all existing checks from `vendorSheet.js` plus new checks (duplicate GTINs, suspicious FOB prices, etc.)

**Exit:** A 30-row sheet with Chinese product descriptions translates and validates in under 10 seconds.

### Phase 4 — Template generator + version management

- Build `/api/quote/template.xlsx` endpoint using SheetJS to generate the template
- Template includes data validation, instructions, and reference sheets
- Version number embedded in template (Sheet 1, cell A1: `v3.0`)
- Upload parser checks version and warns if outdated

**Exit:** Vendor downloads template, fills it in, uploads — zero column mapping issues.

### Phase 5 — SSE progress + large file handling

- Server-sent events for real-time progress on large files
- Chunked processing for 500-row sheets
- Memory-efficient streaming (don't load entire workbook into memory)
- Upload size validation (reject > 10MB before parsing)

**Exit:** A 500-row XLSX file shows real-time progress and completes parsing in under 15 seconds.

---

## 8. Verifier

`scripts/xlsx_check.py`:

- Upload a test XLSX with known data → assert parsed output matches expected
- Upload a CSV with the same data → assert identical parsed output
- Upload a Chinese-header XLSX → assert column mapping succeeds
- Upload an oversized file → assert rejection with helpful error
- Upload a corrupt file → assert graceful error (not a crash)

---

## 9. Open questions

1. **SheetJS license**: Community Edition is Apache 2.0 but has limitations. Pro is $500/yr with better features. Start with Community? Recommendation: yes, Community is sufficient.
2. **Template versioning**: how aggressive on requiring the latest template? Recommendation: warn on old versions, don't block — flexibility matters more than strictness.
3. **Translation accuracy**: for HTS classification, how much do we trust Claude's translation of Chinese medical device descriptions? Recommendation: flag as "AI-translated" with lower confidence score, require human review for HTS > 10% duty rate.

---

## 10. Out-of-band

- None — all dependencies are npm packages

---

## 11. Definition of done

- Vendors can upload XLSX or CSV — both work identically
- Chinese/multilingual headers are mapped correctly
- Non-English product descriptions are translated and preserved
- Downloadable template eliminates column mapping issues for new vendors
- 500-row sheets parse in under 15 seconds with real-time progress
