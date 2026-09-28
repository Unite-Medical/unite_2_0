# Business data pipeline and agent reports

Advanced BI at `/admin/advanced-bi` now includes data readiness and server-backed reports. New Unite chats can read the same datasets with `read_bi_data`, advance a requested refresh with `refresh_bi_data`, and use the existing branded document tool to create downloadable reports. `read_business_report` continues to generate live QuickBooks statements and Shopify date-cohort reports.

## Coverage

- QuickBooks: all accessible purchase orders, items (including inactive), bills, expenses, vendor credits, invoices, payments, customers and vendors. Deleted records are not reconstructed. QuickBooks statements remain the accounting authority.
- Shopify: all accessible orders through refresh start and current inventory/location balances. Historical access and nested line/location limits are checked and surfaced. Orders use their current values at collection, not period-recognized revenue.
- ShipStation: the configured Unite store only; orders modified and labels created in the last 60 days, plus all awaiting-payment, awaiting-shipment and on-hold orders. Other stores are excluded. This is not complete historical shipment coverage.
- Stripe: invoices, charges, payouts and balance transactions accessible to the dedicated read key, created through refresh start. Permission failures are reported per dataset. Minor currency units are preserved. These datasets overlap and must not be added together as sales.
- Unite: warehouse inventory, POs, receipts, movements, lots, reservations, counts and transfers. Provisional imports are not independent physical evidence.

## Refresh and failure handling

`/api/internal/bi-refresh` runs every five minutes using the existing server cron secret. Each completed source becomes due again after 24 hours. Work is paged, bounded to a short invocation and resumed from its saved cursor. Source failures retry with backoff, stop after three attempts on the same page, and remain visible. Manual Refresh data advances an active cycle; when no cycle is running it starts a fresh one.

The worker uses a fenced two-minute database lease. Source records, page provenance, progress and the publication pointer commit in one SQL statement. A page is never published as a complete dataset until its final page has been persisted. The last published version remains readable during subsequent refreshes or failures. Source identity changes and stalled cursors stop that source. Readers deduplicate by source record ID within the published generation. Collection is not a transactionally consistent snapshot across providers, and upstream changes during collection remain a limitation. Data older than 30 hours is marked stale.

The initial implementation stores immutable snapshot generations in the existing Postgres row store (`bi_sources`, `bi_records`, `bi_pages`, `bi_control`). They are excluded from browser raw sync at both query and projection boundaries, preventing large reporting datasets from entering the SPA cache. Only current live admin sessions can access report endpoints or tools. This does not add provider write permissions. At higher volume, move snapshots to dedicated indexed analytical tables/object storage with an approved retention policy; no historical snapshots are automatically deleted by this change.

## Report definitions

- Purchasing: dated PO lines, open commitments, vendor/currency totals and item mapping candidates. No assumption that a closed PO was received.
- Inventory: published item/location balances, negative/missing/duplicate SKU exceptions, candidate QuickBooks mappings and internal receipt/count evidence. Quantities across different SKUs are not totaled.
- Sales: eligible order cohorts, monthly/customer summaries and current values; test/cancelled orders excluded and currencies separated. Refunds are not subtracted twice.
- Receivables/payables: current invoice/bill balances for the selected document-date cohort. These are not historical aging; use the live QuickBooks statements for as-of balances.
- Stripe activity: balance transactions by type and currency, with source minor units. Payouts are not revenue and net balance activity is not profit.
- Fulfillment: deduplicated recent/active orders and Shopify ID/line-ID reconciliation. Split active lines are summed before comparison; similar order numbers alone are not matched.

All report responses include collection times, generation references, coverage, warnings and pagination. Record detail is limited to 200 rows per call. Large summary arrays disclose a 100-row presentation limit. The UI CSV explicitly exports the displayed page. Agents must read additional pages where required and label partial data. Current warehouse data cannot be reconstructed for arbitrary historical dates.

## Known remaining dependencies

Verified SKU margins, landed inventory valuation and reorder forecasts require approved item/pack-size mappings, costs and physical opening counts. Provider transaction IDs still need an approved cross-system sales/payment mapping before automated bookkeeping reconciliation is safe. Payout history depends on Stripe read-key permissions. Forecasts, configurable report scheduling, a historical event warehouse and direct financial posting are not claimed by this implementation.

## Verification

`tests/biPipeline.test.js` covers publication boundaries, lease exclusion, resumable errors, source identity/cursor guards, private data boundaries, currency/unit handling and split-order matching. The initial report calculations were also checked against the saved historical evidence: 1,083 POs, 16 open POs, 492 Shopify location rows and 52 negative Unite balances. An opt-in staging build check (`UNITE_INITIALIZE_BI_PIPELINE=1`) loads live source pages and exercises each report topic while logging only source status and counts.
