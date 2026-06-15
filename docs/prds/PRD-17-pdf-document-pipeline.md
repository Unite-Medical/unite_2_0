# PRD-17 — PDF Generation & Document Pipeline

**Source:** CTO Brief §7 (quoting PDF), §4 (invoices, POs, packing slips)
**Owner:** Alex (CTO)
**Status:** shipped (client-side) 2026-06-15 — zero-dep PDF engine (`src/lib/pdf.js`, validated with pypdf), branded templates for quote/invoice/PO/packing slip/compliance cert (`src/lib/documents.js`), versioned `documents` table, "Download PDF" on the quote print view. Server-side render + R2 storage/signed URLs deferred to PRD-01.
**Depends on:** PRD-01 (backend for server-side rendering)
**Blocks:** PRD-16 (quoting engine v3 needs branded PDFs), PRD-24 (zero-touch fulfillment needs auto-generated packing slips)

> "Customer quote generated as a professional PDF with line items, delivery timeline, and compliance notes — in seconds." — Brief §7

---

## 1. North star

Every document Unite Medical produces — quotes, invoices, purchase orders, packing slips, compliance certificates, shipping labels — is generated programmatically from a single branded template system, stored in cloud storage with signed URLs, and delivered to the right recipient automatically. No human opens Word or Excel to create a document.

---

## 2. Current state

- `src/pages/QuotePrint.jsx` exists — a browser-rendered print view of a quote. Not a real PDF. No download, no email attachment, no storage.
- Shopify app "Order Printer Pro" (usage fees) currently handles Shopify-side documents — this gets replaced
- No server-side PDF generation capability exists
- No template system for branded documents
- No cloud storage for generated documents
- No signed-URL delivery mechanism

---

## 3. Scope

### In scope

- **PDF generation engine** — server-side, produces branded PDFs from structured data
- **Template system** — reusable templates for each document type with Unite Medical branding
- **Document types** (6):
  1. **Quote PDF** — multi-page: cover letter, line items, delivery timeline, compliance panel, terms
  2. **Invoice PDF** — mirrors QBO invoice format, auto-generated on order/quote acceptance
  3. **Purchase Order PDF** — generated when reorder triggered, sent to vendor
  4. **Packing Slip PDF** — generated at pick/pack, includes lot numbers and item checklist
  5. **Compliance Certificate** — per-product: FDA registration, device class, GUDID reference
  6. **Shipping Label** — coordinates with ShipStation; this is the packing slip insert, not the carrier label
- **Cloud storage** — R2 (or S3) with organized bucket structure
- **Signed URL delivery** — time-limited URLs for customer/vendor access
- **Email attachment** — PDFs attached to outbound emails via Resend
- **Audit trail** — every generated document logged with who, when, what data

### Out of scope

- Carrier shipping labels (ShipStation handles these)
- Marketing collateral (brochures, sell sheets — design team handles)
- Editable document formats (Word, Excel export)
- E-signature integration (DocuSign, etc. — defer)

---

## 4. Technology choice

**Recommended: `@react-pdf/renderer`** for primary generation + **Puppeteer** as fallback for complex layouts.

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| `@react-pdf/renderer` | React components → PDF. Same stack as frontend. Fast. | Limited CSS support. Complex tables are harder. | **Primary** — covers 90% of cases |
| Puppeteer / Playwright | Full HTML/CSS → PDF. Pixel-perfect. | Heavier. Needs headless Chrome. Slower (~2-5s). | **Fallback** — for complex compliance certificates |
| WeasyPrint (Python) | Good CSS support. | Different stack. Adds Python dependency. | Skip — forecasting sidecar is enough Python |
| Third-party (PDFMonkey, DocRaptor) | Zero infrastructure. | Cost per document. Vendor lock-in. | Skip |

---

## 5. Template design system

Every PDF template follows the Unite Medical brand:

- **Header**: Unite Medical logo (left), document type + ID (right), date
- **Colors**: `--ink` (#1a1a2e), `--plum` (#6b21a8), `--cream` (#faf7f2), `--amber` (#d97706)
- **Typography**: system sans-serif (Helvetica in PDF), consistent with web tokens
- **Footer**: Unite Medical address, FDA registration number, veteran-owned badge, page numbers
- **Watermark**: "DRAFT" on draft documents, "CONFIDENTIAL" on internal-only

### Quote PDF template (detailed)

Page 1 — Cover Letter:
- Unite Medical header
- Customer name, contact, address
- Quote ID, date, valid-until date
- Claude-drafted cover letter (editable before send)
- Key metrics: total value, line count, estimated delivery

Page 2+ — Line Items:
- Table: #, Product, FDA Code, HTS, Qty, Unit Price, Extended
- Subtotal, shipping estimate, total
- Note: landed-cost breakdown is NEVER shown to customer (internal only)

Page N-1 — Delivery & Compliance:
- Estimated delivery timeline (departure → customs → arrival)
- Port of arrival
- 4-category compliance status per product line (FDA, Quality, Testing, Certs)

Page N — Terms:
- Payment terms (net-30/60 per customer agreement)
- Quote validity period
- Acceptance instructions (link or sign-and-return)
- Standard T&C

---

## 6. Storage architecture

```
R2 bucket: unite-medical-documents/
├── quotes/
│   ├── Q-26-00284/
│   │   ├── Q-26-00284-v1.pdf          # version 1
│   │   ├── Q-26-00284-v2.pdf          # revised version
│   │   └── metadata.json              # { created_at, created_by, customer, versions }
├── invoices/
│   ├── INV-26-01234.pdf
├── purchase-orders/
│   ├── PO-26-00056.pdf
├── packing-slips/
│   ├── PS-26-00789.pdf
├── compliance/
│   ├── CERT-SKU-UM-KNB-001.pdf
└── templates/
    ├── vendor-sheet-template.xlsx      # downloadable vendor template
    └── vendor-sheet-template.csv
```

Signed URLs: 90-day expiry for customer-facing documents, 365-day for internal.

---

## 7. Data model additions

```sql
-- Migration: 0016_documents.sql

CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,       -- "DOC-Q-26-00284-v1"
  document_type   TEXT NOT NULL CHECK (document_type IN ('quote', 'invoice', 'purchase_order', 'packing_slip', 'compliance_cert', 'shipping_insert')),
  ref_type        TEXT NOT NULL,          -- 'quote', 'order', 'product', 'vendor'
  ref_id          TEXT NOT NULL,          -- the quote/order/product ID
  version         INTEGER DEFAULT 1,
  storage_key     TEXT NOT NULL,          -- R2 object key
  storage_url     TEXT,                   -- signed URL (refreshable)
  url_expires_at  TIMESTAMPTZ,
  file_size_bytes INTEGER,
  page_count      INTEGER,
  created_by      TEXT REFERENCES profiles(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  metadata        JSONB                   -- { customer_name, total, line_count, etc. }
);

CREATE INDEX idx_documents_ref ON documents(ref_type, ref_id);
CREATE INDEX idx_documents_type ON documents(document_type);
```

---

## 8. Phases

### Phase 1 — PDF engine + quote template

- Install `@react-pdf/renderer` on backend
- Build quote PDF template matching the design spec above
- API endpoint: `POST /api/documents/generate` → returns document ID + signed URL
- Test with existing quote data from localStorage DB

**Exit:** A quote with 10 line items generates a 3-page branded PDF in under 3 seconds. PDF opens correctly in all viewers.

### Phase 2 — R2 storage + signed URLs

- Configure Cloudflare R2 bucket with the directory structure above
- Upload generated PDFs to R2
- Generate signed URLs with configurable expiry
- Store document records in `documents` table
- Version tracking: re-generating a quote creates v2, preserves v1

**Exit:** Generated PDFs are accessible via signed URL for 90 days. Expired URLs return 403.

### Phase 3 — Invoice + PO templates

- Invoice PDF template (mirrors QBO invoice format)
- Purchase Order PDF template (sent to vendors)
- Auto-generation triggers: order created → invoice PDF; reorder triggered → PO PDF

**Exit:** Every order automatically has an invoice PDF. Every draft PO has a PO PDF.

### Phase 4 — Packing slip + compliance certificate

- Packing slip template with lot numbers, item checklist, shipping insert
- Compliance certificate template per product (FDA registration, device class, GUDID, GS1)
- Packing slip auto-generates at pick/pack stage (PRD-04 Cin7 integration)

**Exit:** Warehouse staff print a packing slip with barcode-scannable lot numbers for every shipment.

### Phase 5 — Email integration + delivery

- Attach PDFs to outbound emails via Resend (PRD-05)
- Quote emails include the PDF + an "Accept" button linking to `/q/{token}`
- Invoice emails include the PDF + a "Pay Now" button linking to Stripe (PRD-09)
- PO emails to vendors include the PDF + template for their response

**Exit:** Quote email sent to customer with PDF attached. Customer opens, reviews, clicks accept — all without downloading.

---

## 9. Verifier

`scripts/document_check.py`:

- For every quote with status ≥ 'sent', assert a PDF exists in R2
- Assert PDF file size > 10KB (not empty/corrupt)
- Assert signed URL is valid (HTTP 200)
- Assert document record exists in `documents` table with correct ref_id

---

## 10. Open questions

1. **Puppeteer on Fly.io**: headless Chrome in a container works but adds memory. Do we need it for v1 or can `@react-pdf/renderer` handle all templates? Recommendation: start with react-pdf only.
2. **Customer white-labeling**: should quotes show "Unite Medical" or can they be white-labeled for distributor customers who resell? Recommendation: Unite Medical branding only for v1.
3. **Digital signature**: should quotes have a digital signature or stamp? Recommendation: defer to v2.

---

## 11. Out-of-band

- R2 bucket provisioned (`R2_DOCUMENTS_BUCKET` + R2 access keys)
- Unite Medical logo in PDF-compatible format (vector, embedded)
- Legal review of terms & conditions text for quote footer
- New env vars: `R2_DOCUMENTS_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`

---

## 12. Definition of done

- Every document type has a branded PDF template
- PDFs generate in under 5 seconds
- Documents are stored in R2 with signed URLs
- Quote PDFs are attached to outbound emails
- No human manually creates a document that this system covers
