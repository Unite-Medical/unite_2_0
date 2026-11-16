# 6. Staff test scripts

All staff land on `/work` (team home with queues, overdue items, handoffs). The same scenarios also exist as an in-app checklist at **`/admin/testing`** (Admin only, staging only — `src/lib/workflowReview.js`); IDs in brackets match it so results can be logged there.

Rules for every staff test: use only records whose name/notes say **TEST**; prefer **Save draft**; anything marked ⚠️ has a live side effect (QBO, email, label, payment) — only with Damon/Alex sign-off.

## 6.1 Everyone — sign-in & home [daily] [access]

| ID | Test | Expected |
|---|---|---|
| STF-01 | Sign in as each person on their own account; MFA where required | Correct team label (Everyone / Sales & service / Warehouse / Finance / Sourcing), correct sidebar (see [Roles](02-roles-and-permissions.md)) |
| STF-02 | Home queues | Overdue, waiting and "next action" items make sense; opening one shows owner, source record, next step |
| STF-03 | Save a note/next step on a TEST work item, refresh | Persists (server row-store, not just the browser) — verify from a second browser |
| STF-04 | Staff chat `/admin/chat` (admin) | Messages deliver between two staff sessions |
| STF-05 | Role switcher (multi-role user) | Only granted roles listed; MFA role refused without MFA; home + sidebar change |
| STF-06 | Session expiry / sign-out | Protected pages unreachable after sign-out |

## 6.2 Sales — Jacobe (`sales`) [customer] [inquiries] [quote] [delivery]

| ID | Test | Expected |
|---|---|---|
| SAL-01 | Customer workspace `/rep` → open a familiar customer | Company, contacts, addresses, tax-doc status, terms, pricing schedule, holds all correct vs. QBO/Shopify |
| SAL-02 | Customer directory `/rep/customers` | Jacobe sees the read-only staging customer book; a **second** sales user sees only assigned customers |
| SAL-03 | Inquiries `/staff/inquiries` | Open TEST inquiry, set owner + next action + follow-up date, refresh → saved |
| SAL-04 | Quote draft `/admin/quotes` → new | Two catalog items, change qty, save, refresh, totals correct; price authority shown |
| SAL-05 | Margin floor [margin] | Price below sales margin limit → flagged; Sales **cannot** self-approve; Damon approves; changing price after approval forces re-approval |
| SAL-06 | ⚠️ Issue quote | Recipient, total, freight, tax, delivery estimate correct; sends only to approved test mailbox; `/q/:token` link works |
| SAL-07 | Create order `/sales/orders/new` | Pick customer (holds/terms enforced), lines, discounts (item & order), PO#, ship-to. **Save draft** → appears under "Drafts"; navigating away shows "Keep editing" protection |
| SAL-08 | ⚠️ Submit order | Creates order + unpaid invoice; accounting job queued (QBO sync). Do once on a TEST customer with sign-off |
| SAL-09 | Order list `/sales/orders` | Filters (awaiting price check, needs costs, drafts, recent), deep links `/sales/orders/:id` open inside staff shell |
| SAL-10 | Supplier PO draft `/sales/purchase-orders/new` | Draft from order need; "Needs costs" flag when cost missing; Sales **cannot** approve/send/receive POs |
| SAL-11 | Shipments `/staff/shipments` (read) | Sees status/tracking; gets "Tracking update ready" task after warehouse handoff |
| SAL-12 | Forbidden | `/admin/finance`, `/admin/team`, `/admin/settings`, `/warehouse` refused; no cost/margin internals beyond what Sales is allowed |

**Sales manager** (`sales_manager`, MFA): repeat SAL-01…12 + customer directory scope + approval visibility.
**Customer service** (`customer_service`): `/rep` + `/quote/engine` only; confirm **no** order entry, POs, inquiries.

## 6.3 Admin — Damon (`admin`, MFA) [approval] [margin] [access] [history]

| ID | Test | Expected |
|---|---|---|
| ADM-01 | Team & roles `/admin/team` | Grant/revoke a role on a TEST staff profile with reason → audited; target's next request reflects it; Damon cannot edit **his own** roles |
| ADM-02 | High-value approval `/admin/orders` | TEST order > $10,000 shows Damon approval section; approve/reject with note; changing a material detail re-opens approval |
| ADM-03 | Orders admin `/admin/orders`, `/admin/order-operations` | Full order timeline, holds, edits, cancel (on TEST) |
| ADM-04 | Products `/admin/products`, new/edit, onboarding, CMS `/admin/cms` | Edit TEST product → public page updates; required fields validated |
| ADM-05 | Customers `/admin/customers` | Approve pending org (CUS-02), set terms/pricing/credit limit, send activation (CUS-03), merge duplicates |
| ADM-06 | Pricing `/admin/pricing`, margin `/admin/settings/margin` | Schedule changes flow to customer prices |
| ADM-07 | Inventory `/admin/inventory`, lots, counts, transfers, barcodes, replenishment | Stock pools balance; lot trace to receipts/outbound [lots] |
| ADM-08 | Purchase orders `/admin/purchase-orders` | Approve Sales draft; ⚠️ send to supplier (email); print view |
| ADM-09 | Sourcing `/admin/sourcing` [buying] | Review sourcing request, supplier response, linked PO |
| ADM-10 | Integrations `/admin/integrations` + `/api/health` | Status matches [Integrations](07-integrations-and-secrets.md); no secret values displayed |
| ADM-11 | Launch `/admin/launch` [history] | Compare imported customers/orders/inventory/balances with Shopify/QBO; list launch gaps |
| ADM-12 | BI `/admin/analytics`, `/admin/advanced-bi`, digest | Numbers reconcile to a known period |
| ADM-13 | Shopify history, webhooks, CRM/leads, compliance/UDI, discovery | Pages load, data plausible, no errors |
| ADM-14 | ⚠️ Destructive tools `/admin/test-data`, `/admin/workspace-reset` | Require admin + MFA + staging origin; **do not run** without Alex sign-off |
| ADM-15 | Customer journeys [customer-portal] | Review designated customer/distributor accounts' own quotes, orders, documents, shipment status |

## 6.4 Warehouse — Darren (`warehouse_operator`; `warehouse_manager` = MFA) [receive] [ship] [split] [recovery] [lots]

Test on a phone/tablet as well as desktop — `/warehouse` is the mobile app.

| ID | Test | Expected |
|---|---|---|
| WH-01 | Warehouse app `/warehouse` | Today's picks, receipts, counts; big touch targets; works on 390px |
| WH-02 | Receive `/admin/inventory/receive` | Select TEST PO + location; partial receipt, lot/expiry entry; wrong/conflicting barcode rejected; post isolated TEST receipt → stock & PO update |
| WH-03 | Pick & pack `/staff/shipments` | Reserved TEST shipment: product, qty, lot, destination correct; packing slip (blind-ship branding when set) |
| WH-04 | ⚠️ Label & hand-off | Label/tracking evidence separate from physical hand-off; hand-off creates Sales tracking task. **Don't buy real labels** unless approved |
| WH-05 | Split shipment [split] | Order split into two allocations; remaining qty correct; later freight approval goes to Sales/Ashley |
| WH-06 | Recovery [recovery] | Return a not-yet-shipped shipment to planning; labelled shipment requires carrier void evidence; reservations release; Ashley gets review task |
| WH-07 | Lots/quarantine/returns [lots] | Quarantine a TEST lot → not allocatable; return flow |
| WH-08 | Barcode scanning | Camera scan works on iOS Safari + Android Chrome |
| WH-09 | Forbidden | No prices/costs/finance; `/admin/*` except receive refused |

## 6.5 Finance — Ashley (`finance`, MFA) [paid-release] [payment] [credit] [refund] [ap]

| ID | Test | Expected |
|---|---|---|
| FIN-01 | Invoices & payments `/admin/finance` | "Invoices to review", overdue balances, currency display correct; balances match QBO for 5 sample invoices |
| FIN-02 | Record payment evidence | Record approved TEST reference → balance updates; **duplicate reference rejected** |
| FIN-03 | Paid → release `/admin/decisions` | Paid TEST order awaiting accounting review: compare invoice, amount, reference, holds; release only with evidence |
| FIN-04 | Credit / write-off | Ashley requests with reason → Damon independently decides → Ashley records |
| FIN-05 | Refund review `/admin/refund-reviews` | Independent decision + audit trail; ⚠️ provider refund is a separate live step |
| FIN-06 | Vendor bills / AP | Bill vs PO vs receipt match; partial/discrepancy routed; posting kept separate |
| FIN-07 | QBO sync | Accounting job status, retry visibility; no duplicate invoices in QBO |
| FIN-08 | Forbidden | Order entry, products, team, settings refused |

## 6.6 WellLink [welllink] [welllink-close]

| ID | Test | Expected |
|---|---|---|
| WL-01 | `/staff/welllink` (admin, sales, finance, warehouse) | Filter by owner, open task, evidence + follow-up controls |
| WL-02 | Case-pack pricing | Six case packs; multi-case calculation matches the contract sheet |
| WL-03 | Monthly close `?view=reporting` | Sample month + gross purchases → 3% fee and due date correct; template downloads |

## 6.7 Sourcing (`sourcing`, `sourcing_manager`)

| ID | Test | Expected |
|---|---|---|
| SRC-01 | Sign in | Lands `/work`. Today the role has **no dedicated tools** outside Admin (`/admin/sourcing` is admin-only) — record what the sourcing team actually needs |
