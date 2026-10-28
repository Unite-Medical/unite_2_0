# Operational workflows and role guide — October 28, 2026

Status: local candidate on `codex/operational-role-workflows-2026-10-27`, based on deployed `84c93b3`. Publication and deployed acceptance are recorded separately in the release evidence. No live role records, credentials, orders, purchase orders or accounting records were changed. The reused no-cost policy patch is `d2501a8`.

## Approved operational permissions

Sales and Sales manager may read their scoped customer/order workspace, prepare/save/reopen customer order drafts and create customer orders. Ordinary Sales stays assignment scoped. Jacobe's existing exact-ID customer-book exception remains restricted to the verified staging project/host/database; the literal ID is not normalized. Authentication, active-profile/revision checks and staff MFA rules remain in the existing live authorizer.

Sales may prepare manual supplier PO drafts and pending supplier business records. That does not create a supplier login, approve/send a PO, receive inventory or post an AP bill. Historical imported POs remain outside the Sales draft editor. Admin retains existing operational and management tools.

Sales does not gain accounting mapping/retry controls, catalog-cost writes, credit/payment/refund decisions, security administration, user/role changes, label purchasing or destructive admin tools. Named pricing authority and known-cost margin safeguards remain. A missing catalog cost no longer blocks Damon/Jacobe entering a valid order selling price. Quote pricing retains its separate existing policy.

Darren and Ashley retain their existing Warehouse operator and Finance authorities. Warehouse Home links now lead to authorized warehouse/shipment tools instead of dead ends. No manager/Admin promotion is included. Jarrod's role remains an owner decision.

## Important side effects

Customer order **Save draft** only stores the commerce draft. Final **Create order** creates the operational order, items, address, unpaid Finance invoice, accounting job and audit, then attempts the existing QuickBooks invoice sync. This staging connection is live accounting. It creates/matches an invoice; it does not collect payment, send customer email, purchase a label or ship stock. The review dialog discloses this. Duplicate submit returns the existing order before another sync.

Supplier PO **Save draft** writes only the manual PO and audit. Inline supplier creation writes pending supplier business metadata and audit. Supplier approval, PO sending, receiving and accounting are separate. Sending a PO can email the supplier and is not granted by this candidate. Issuing a quote can email the customer and remains a separate existing authorized action.

Shopify historical paid labels do not establish settlement. Verified QuickBooks evidence remains authoritative for paid/owed status. No imports or balance refreshes were performed in this pass.

## First-use walkthrough

All staff start at https://staging.unitemedical.net/login?next=%2Fwork using their own existing account. No password belongs in this guide. Damon: `damon@unitemedical.net`; Jacobe: `jacobe@unitemedical.net`; Darren: `darren@unitemedical.net`; Ashley: `accounting@unitemedical.net`. These are historical verified identities; today's fresh profile/session acceptance remains pending. Privileged roles require MFA, including Admin and Finance; ordinary Sales/Warehouse operator do not by themselves, but secondary privileged grants do. Do not enroll someone else's authenticator. The older password-reset screen is visible, but delivery and current staff recovery acceptance are unverified; the separate recovery release remains paused.

### Jacobe — customer orders

After this candidate is approved and deployed: open Customer orders, then Create order; or select a customer in Customers and choose Create order. Select exact products/variants, quantities and selling prices. Missing internal cost is informational; only Admin may save catalog cost. Item discounts precede the order-wide discount. Review the latest prior-order shipping address and edit it as needed; billing stays separate. Select the agreed manual shipping amount or pickup, review tax and terms, then Save draft. Reopen it from Customer orders. Stop at final Create order until the actual QuickBooks invoice effect for that order is approved.

### Jacobe — quotes

Prepare quote from the selected customer. An exact mapped quote account and email carry forward. The quote list stays filtered to that account. An imported contact without an explicit stable quote-account mapping shows the missing/ambiguous mapping; it does not guess by email/name or silently choose a different customer. The order fallback retains that same customer. Saving a quote draft does not send it. Existing quote pricing and issue authority remain separate.

### Jacobe — supplier POs

Open Supplier POs, Create purchase order. Choose/create the supplier inline, select receiving warehouse and exact catalog products, then enter quantity, supplier SKU, quoted unit cost, reference, notes and terms. A blank supplier cost means unknown; explicit zero means zero. Review and Save draft. Reopen the same draft. Changing supplier clears supplier-specific costs/terms/reference only after confirmation; changing warehouse offers to preserve a manually edited delivery address. Approval/sending/receipt are later actions owned by the appropriate role.

### Damon

Use existing Orders/Customers/Quotes/Approvals/Inventory tools. Create an order with a valid selling price without leaving the form for missing-cost reconciliation. Keep real margin exceptions, shipping/tax/credit holds, historical-order and duplicate safeguards. Review operational access and the financial side effect above before release. Then verify his own session and one agreed controlled order; local synthetic tests are not his acceptance.

### Darren

Use Home, Warehouse app, Receive a delivery and Split shipments. Home count/outgoing/delivery links now open tools the role can access. Receiving records only arrived quantities; use correct lots/expiry, shortages and location. Picking/shipping still require allocation, payment/credit release and existing handoff evidence. A label is not carrier collection. Receipt/count/pick/ship actions were not executed live in this pass.

### Ashley

Use Invoices & payments, Approvals & release and Refund reviews. Confirm the customer order's real QuickBooks invoice identity, current balance and provenance. Do not infer paid from Shopify or shipping. Verify shipped/backordered and received/missing quantities through linked records before accounting decisions. No Finance authority or real accounting records changed in this pass. Her credential delivery and MFA ownership remain unverified.

## Leave useful feedback

Use the existing Unite feedback channel Alex provides. Include your role, page URL, record/reference (minimum necessary), intended action, actual result/error, time, and a screenshot with customer/payment details hidden. State whether it happened on staging or a local preview. Never share passwords, authentication QR/setup keys or recovery codes. Missing channel/invitation is an onboarding blocker to report to Alex; this candidate does not create or guess channels or send invitations.

## Validation and remaining gates

Final local evidence: 750 tests passed, 3 existing skips. Twenty synthetic sales/PO workflow checks, fifteen queue/navigation/interruption/layout checks, five dark-mode maximum-size checks, and six desktop layout checks passed. Lint/build/prerender and connection checks are recorded with the release. No live providers were called or orders submitted by the browser harness. Backend tests inject an isolated accounting stub to verify unpaid order/job behavior and idempotency.

Fresh live roster request to `/api/admin/roles` returned `authentication_required`. No new login was attempted; the temporary tab was closed and the prior Dia page restored. Required next step: normal owner/Admin sign-in and own-session acceptance for each staff member. Current assignments, missing quote mappings, Ashley MFA owner, Jarrod's intended role, credential delivery, real provider/reconciliation acceptance and deployment remain separate unresolved gates. Source tests and synthetic screenshots do not prove them.


## Cleaner operational pages

Home provides three task shortcuts for the current role. Sales can open orders or supplier POs even when the assigned activity list is empty. Warehouse links open receiving, warehouse tasks and split shipments. Finance links open invoices, decisions and shipment context. Empty activity is not described as proof that all work is complete.

Customer orders has server-filtered All orders, Drafts, Ready, Waiting on stock and Needs review views. Search is retained when opening a record and returning to the list. Payment, fulfillment and next step have separate columns. Refresh/retry and clear-filter actions remain available when a query returns no records or fails.

The order form has four clickable preparation steps: Customer, Products, Shipping and Tax. They open the existing contextual editors. Shipping and tax readiness still use the authoritative preview. Internal notes, customer PO number and tags are grouped. Save draft leaves the financial submission for later. Cancel offers Keep editing or Discard unsaved changes; sidebar navigation and role changes cannot silently discard unsaved edits.

Supplier POs provides search and status views over the most recent 100 manually prepared POs, with unknown costs shown as Needs costs. It uses the PO API's actual response contract. No new approval, sending or receiving authority is implied by a readable queue.

The dark theme and 18px maximum appearance setting were exercised on the order queue, PO queue, both composers and quote context. Wide tables scroll inside their panel when the available width is smaller than their columns. Synthetic screenshots are illustrations, not evidence of live staff login or current business records.
