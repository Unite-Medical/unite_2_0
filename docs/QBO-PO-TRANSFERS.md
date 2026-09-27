# Purchase order transfers

The Purchase orders page provides an admin-only server endpoint for browsing QBO purchase orders, loading one for review, saving a reviewed Unite draft, and creating or updating a QBO PO after a separate preview and confirmation.

The existing OAuth flow requests `com.intuit.quickbooks.accounting`; no additional PO scope is needed. Production credentials and company authorization must be configured before live API calls work.

File imports accept CSV and XLSX line tables with `sku,description,quantity,unit_cost,qbo_item_id` columns. One file represents one PO. Header fields are reviewed separately. Searchable PDFs are extracted locally as reference text; the operator enters and reviews the lines. Scanned PDFs require OCR outside this flow. Original files are not stored; reviewed fields and extracted text are retained in the draft. Imports do not receive stock, post bills, or send supplier emails.

Current transfer scope is USD item-based POs. Existing QBO orders must be open, unlinked, and without tax adjustments. Updates preserve line metadata, require the current SyncToken, and keep the same item mapping and line count. More complex changes remain in QuickBooks. Vendor and item IDs must be mapped to active records in the connected company; items need an expense account. Never default those references to ID 1.

Preview snapshots are stored in `qbo_po_transfers`. An immutable posting claim and a separate company/target lock prevent repeated or concurrent submissions. Create locks use the document number; update locks use QBO ID and SyncToken. QBO receives a deterministic requestid as an additional deduplication measure. A request with an ambiguous outcome remains blocked for operator reconciliation; do not delete its lock or recreate it without checking QuickBooks. Completed operations replay their saved result. Previews expire after 30 minutes.

Validation: unit tests cover amount/date/reference checks, unsupported/linked QBO transactions, preservation of line metadata, request routes and IDs, provider errors, and CSV quoting/numeric validation. Live sandbox authorization, provider contract checks, and accounting reconciliation remain required before enabling production use. No live POs were written during implementation.
