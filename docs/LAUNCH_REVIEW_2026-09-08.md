# Unite launch review — September 8, 2026

## Outcome

Simplified the daily admin and customer workflows in the isolated `review/launch-simplification` branch. This checkout preserves the latest launch branch and its 17 changed/untracked files recovered from `/Users/alex-s-nt-16/Projects/Unite/unite_damon_launch`. The original worktree remains untouched. This is a local preview, not a staging deployment or launch certification.

## Changes delivered

- Seven primary admin links; warehouse, purchasing and settings grouped into expandable sections. Keyboard dismissal, focus return, mobile drawer and active-page indication.
- An operations home organized around orders, inventory and customer reviews. Removed invented charts and misleading totals.
- Searchable orders with a single details panel and clear links to payment/fulfillment workflows. Removed direct local “paid/shipped/refunded” status setters that bypassed those workflows.
- A three-step launch workspace: Shopify CSV review, customer activation links, and live legacy-order preview/staging. CSV checks stay local, survive launch-tab switching and can be saved as a summary. They do not import files or certify completeness.
- Customer search and collapsed advanced panels; a straightforward customer dashboard, sign-in page and tax-document upload/status page. Removed unsupported testimonials, availability claims and fixed sample statistics from these screens.
- Routed the previously disconnected activation page and added missing client screens for existing activation, document and legacy-order services.
- Imported Shopify history now has import/type filters, search, pagination and expandable source evidence.
- Historical customer orders include blank-email continuation lines within the authorized import/order group; repeated imports select the newest copy. Empty-email sessions and mixed-customer groups are rejected. Large results fail explicitly rather than presenting silently truncated history.
- Tax-document status retrieval is organization-scoped. Document-version identifiers now include organization identity, avoiding cross-organization collisions for identical uploaded content.

## Validation and limits

- Recovered baseline: 278 unit tests passed. Updated checkout: **288 tests passed**, including CSV edge cases, previous-year date handling, customer history scoping/refresh and document identity isolation.
- ESLint passed. Production build passed, with 122 prerendered routes. Existing oversized bundle warnings remain.
- Browser checked operations, launch steps, order filtering, sign-in, customer dashboard and activation entry. At 390px, launch content fits without horizontal page overflow; Escape closes the drawer and returns focus to its trigger.
- Verified the legacy preview error state with the API proxy deliberately disconnected. Browser demo uses sample data; no live payments, imports, emails, stock changes or shipments were performed.
- August source CSV compatibility: 556 customers, 1,982 orders / 3,252 order rows, and 1,380 inventory rows parsed. Simple email flags are not the full migration reconciliation; the historical 162-account hold count uses broader rules.
- **Broader orchestration verifier fails in both the original and review worktrees:** `node scripts/verify_orchestration.mjs` reaches fulfillment, reports missing pipeline steps/shipment, then crashes on the missing shipment at line 123. Cause has not been established. This must be resolved and the full workflow rerun before launch.
- Customer-history SQL and document GET require authenticated staging integration tests. Pure projection tests do not prove database deployment, storage configuration or authorization end to end.
- Existing screens outside this focused pass retain older UI. This is not an exhaustive security or transaction audit.

## Tonight's Shopify download

Create a dated snapshot folder and retain the original files unchanged:

1. **All products**, with variants, SKUs, prices, media references and status. [Shopify product export guide](https://help.shopify.com/en/manual/products/import-export/export-products).
2. **All customers**, including consent, tax status and identifiers where supplied. Keep the API customer/address supplement for complete reconciliation. [Customer export guide](https://help.shopify.com/en/manual/customers/import-export-customers).
3. **All orders** for history, plus a clearly identified open-order export. Remaining transferable quantities must be refreshed live at cutover. [Order export guide](https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders).
4. **Inventory: All locations, All states, All variants**, including on-hand, committed and incoming quantities. “Not stocked” is distinct from zero or missing data. [Inventory export guide](https://help.shopify.com/en/manual/products/inventory/setup/inventory-csv).
5. Retain transaction/payout exports for finance reconciliation, and the API supplements for collections, customers/addresses, locations, menus and redirects, matching the August snapshot.
6. Obtain customer-specific pricing separately. Neither selecting four CSVs nor the existing supplemental API exporter delivers a complete migration. Existing API export code also needs pagination/completeness verification before it is relied upon for cutover.

Open `/admin/launch` in the local preview to review the four core CSV types. Only one file per type is supported; split exports require separate review and an aggregate reconciliation. Download the review summary before leaving/reloading the page. Files are not uploaded or imported by this UI.

## Launch gates, in priority order

| Gate | Evidence still required |
|---|---|
| Customer pricing | Approved per-account pricing or explicitly approved fallback. The recovered migration holds all 556 accounts from commerce pending this evidence. Do not release accounts based only on public catalog prices. |
| Opening stock | Reconcile physical stock, committed legacy quantities and incoming POs; preserve provisional/ambiguous holds and warehouse ownership. |
| Legacy orders | Close six undecided orders and two holds, refresh live quantities, and validate held-transfer / Shopify-acknowledgment behavior. Avoid double fulfillment. |
| Staging workflow | Resolve the failing orchestration check. Run real authenticated customer activation, account access/isolation, quote/order approval, payment, PO receiving, multi-lot picking, carrier handoff and refund/return acceptance on staging. |
| Customer activation | Reconcile missing/placeholder emails; review activation message with Damon; validate expiry/replay and account pricing restrictions. Link generation does not send email. |
| Documents | Validate private upload, malware-scan evidence and admin review. The new upload/status screen does not implement a scanner or full admin review UI. Missing documents alone must not overwrite an existing Shopify exemption or become a new checkout block. |
| Cutover | Agree owner/time, final delta, staging readback counts, rollback plan and first-48-hour monitoring. No production deployment was performed in this pass. |

The recovered decision log also leaves recall simulation, scope of the over-$10,000 approval policy and operating simulations open. Confirm these against Damon’s latest decisions. Barcode completion and the MegaPre duplicate case SKU were explicitly deferred; do not turn them into blanket launch blockers.

## Suggested sequence for this week

Tonight: save the complete snapshot and pricing evidence; run the local file review. Next: import into staging, reconcile counts/holds and fix the failed fulfillment check. Then: Damon completes the customer/warehouse/payment acceptance walkthrough. Cut over only after the gates above have evidence, with a final Shopify delta and a named rollback owner.

## Local preview

Checkout: `/Users/alex-s-nt-16/Documents/ChatGPT/Unite Medical/unite_launch_review`

Run `VITE_DEV_API_TARGET=http://127.0.0.1:4399 npm run dev -- --host 127.0.0.1 --port 4173 --strictPort` for an isolated UI preview at `http://127.0.0.1:4173`. The unavailable API target intentionally prevents contacting the default production proxy. Local demo access is in the sign-in page's expandable section. Use a separately configured staging target for authenticated service acceptance.
