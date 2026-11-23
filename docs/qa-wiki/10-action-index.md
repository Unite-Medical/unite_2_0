# 10. Action index: what each person does, where, and how hard it is

Each role's job actions, where they start, and the click cost. Clicks count control activations (not typing) from that role's home (`/work`, `/dashboard` or `/distributor`) to the last step **before** any write. **Measured** = counted in a recorded QA run. **Est.** = read from the code; replace it with a measured count after the next video run. Write steps marked ⚠️ reach QuickBooks, email, payments or shipping labels and are not run on staging (it is connected to the real QuickBooks company).

Status: ✅ works up to the write step · ⛔ blocked (missing data or access) · ⚠️ real-world side effect · ❓ not yet exercised

Friction: **H** = too many steps, a dead end or confusing · **M** = workable but slow · **L** = fine

## Admin: Damon (`admin`, MFA)

Sidebar: Home, Chat, Orders, Products, Inventory, Customers, Pricing schedules, Quotes, Inquiries, Lead search, CRM, Warehouse app, Pick & ship, Receiving, Split shipments, Advanced BI, Finance, Approvals, WellLink. A further ~40 tools sit in the "Tools" menu (`AdminShell` `TOOLS`).

| # | Action | Start | Clicks | Status | Friction / notes |
|---|---|---|---|---|---|
| A1 | Review today's queues / needs attention | `/work`, `/admin/desk` | 0–1 | ✅ | L. Two separate "attention" surfaces (Home and Needs attention) |
| A2 | Find an order | Orders → search/tab | 1 + type | ✅ | L after [#15](https://github.com/Unite-Medical/unite_2_0/pull/15) (tabs, search, mobile cards) |
| A3 | Create an order | Orders → Create order | ~11 before [#15](https://github.com/Unite-Medical/unite_2_0/pull/15) / ~9 after (est.) | ✅ up to ⚠️ Create | M. Shipping and tax are still separate dialogs |
| A4 | Approve a high-value order (>$10k) | Approvals `/admin/decisions` | 2–3 (est.) | ⛔ no pending approvals | ❓ |
| A5 | Approve a refund | Tools → Refund approvals | 2 + menu (est.) | ⛔ empty | M. Not in sidebar, only in Tools |
| A6 | Edit a product / price | Products → product → edit | 3 (est.) | ❓ | |
| A7 | Change a customer's terms, pricing or credit | Customers → customer | 2–3 (est.) | ❓ | |
| A8 | Pricing schedule change | Pricing schedules | 2 (est.) | ❓ | |
| A9 | Approve or send a supplier PO | Tools → Purchase orders | 3 + menu (est.) | ⛔ no POs; ⚠️ send emails supplier | M. Not in sidebar |
| A10 | Grant or revoke staff roles | Tools → Team & permissions | 3 (est.) | ❓; can't edit own roles | |
| A11 | Check integrations / health | Tools → Integrations | 1 + menu | ✅ | |
| A12 | Business numbers | Advanced BI / Analytics | 1 | ⚠️ Analytics shows $0 (wrong source) | **H.** Two BI pages that disagree |
| A13 | Global search (Ctrl+K) | top bar | 1 | broken on staging, fix in [#13](https://github.com/Unite-Medical/unite_2_0/pull/13) | **H** until #13 ships |
| A14 | UDI / barcode prefixes | Tools → UDI / GUDID | 1 + menu | ⚠️ expired Medava prefix; fix in [#14](https://github.com/Unite-Medical/unite_2_0/pull/14) | Opening the page writes seed rows |

## Sales: Jacobe (`sales`; `sales_manager` = MFA)

Sidebar: Home, Customer orders, Create order, Supplier POs, Customers*, Quotes*, New quote†, Customer workspace, Inquiries†. (*customer-directory flag, †inquiries flag)

| # | Action | Start | Clicks | Status | Friction / notes |
|---|---|---|---|---|---|
| S1 | Look up a customer | Customer workspace `/rep` or Customers `/rep/customers` | 1–2 + type | ✅ (measured) | **H.** Two customer lists with unclear names |
| S2 | Quote from a customer | `/rep` → customer → Prepare quote → Add product | ~4 + SKU typing (measured) | ✅ up to ⚠️ send | **H.** Discard leaves the page dirty and blocks navigation until reload (JD-01). Products by raw SKU |
| S3 | Create an order | Create order | ~13, 5 dialogs (measured) → ~11 after #15 | ✅ up to ⚠️ Create | **H.** No "Create order" from customer context; address, shipping and tax each need a dialog |
| S4 | Track an order | Customer orders → order | 2 | ✅ | L |
| S5 | Draft a supplier PO | Supplier POs → Create → supplier → products → warehouse → Review | ~9 (measured) | ⛔ no suppliers | **H.** Supplier picker dead-ends inside a modal |
| S6 | Work an inquiry | Inquiries → inquiry → owner/next step | 2–3 (est.) | ❓ | |
| S7 | Shipment status for a customer | `/staff/shipments` | 1 | ✅ empty | M. Empty state gives no next step |
| S8 | Global search | none visible | n/a | ⛔ | **H.** No search trigger. Ctrl+K opens Chrome's omnibox |

**Customer service** (`customer_service`): Home, Customer workspace and quote engine only. No orders, POs or inquiries.

## Warehouse: Darren (`warehouse_operator`; `warehouse_manager` = MFA)

Sidebar: Home, WellLink, Split shipments, Warehouse app, Receive a delivery.

| # | Action | Start | Clicks | Status | Friction / notes |
|---|---|---|---|---|---|
| W1 | Look up stock / location | Warehouse app → search → item | ~2 + type (measured) | ✅ desktop and 390px | M. Long count/pick form |
| W2 | Pick for an order | Warehouse app → Table → filter → item → Start physical count → Pick out | ~5 (measured) | ⛔ no pickable orders | **H.** Picking sits behind a "count" button, and the copy describes counts (JD-03) |
| W3 | Receive a delivery | Home → Receive a delivery → PO → lines | 1 + (measured) | ⛔ no approved POs | **H.** Empty state doesn't say what to wait for or whom to ask |
| W4 | Pack / split a shipment | Split shipments | 1 (measured) | ⛔ empty | **H.** Empty-state copy points to a Sales-only action |
| W5 | Label and hand-off | shipment → label → hand-off | ❓ | ⚠️ buys real labels | |
| W6 | Stock count | Warehouse app → item → Start physical count | ~3 (est.) | ❓ | Posting needs a manager |
| W7 | Quarantine / lot recall | Admin-only Lots page | n/a | ⛔ operators have no access | Confirm intended |

## Finance: Ashley (`finance`, MFA)

Sidebar: Home, WellLink, Split shipments, Approvals & release, Invoices & payments, Refund reviews.

| # | Action | Start | Clicks | Status | Friction / notes |
|---|---|---|---|---|---|
| F1 | Invoices to review / overdue | Invoices & payments | 1 | ❓ needs MFA sign-in | |
| F2 | Record payment evidence | invoice → Record payment | 2–3 (est.) | ⚠️ real books | Duplicate reference must be rejected |
| F3 | Release a paid order | Approvals & release → order | 2 (est.) | ⛔ list empty | |
| F4 | Refund review | Refund reviews → refund | 2 (est.) | ⛔ empty | |
| F5 | QuickBooks sync status | Integrations is admin-only | n/a | ❓ | Finance may need read access |

## Sourcing (`sourcing`, `sourcing_manager`)

Sidebar: Home only. `/admin/sourcing` is admin-only, **so the role has no tools.** Needs a product decision before launch.

## Customer (org `owner` / `buyer` / `viewer`)

| # | Action | Start | Clicks | Status |
|---|---|---|---|---|
| C1 | Reorder | `/dashboard` → Reorder `/account/reorder` | 2–3 (est.) | ❓ no customer account |
| C2 | Place an order | `/account/order` → cart → checkout | ~5 (est.) | ⚠️ payment |
| C3 | Quotes / accept a quote | Your quotes `/account/quotes` or `/q/:token` | 1–2 | ❓ |
| C4 | Invoices / documents | `/account/invoices`, `/account/documents` | 1 | ❓ |
| C5 | Team access | Team access `/account/team` | 1–3 | ❓ owner only |

## Distributor

| # | Action | Start | Clicks | Status |
|---|---|---|---|---|
| D1 | Stock on hand | `/distributor/inventory` | 1 | ❓ no account |
| D2 | Order / PO upload | `/distributor/order`, `/distributor/po-upload` | 2–4 (est.) | ⚠️ creates orders |
| D3 | Shipping / settlement / documents | `/distributor/shipping`, `/settlement`, `/documents` | 1 | ❓ |

## Top flow fixes (ranked)

1. **S3/A3 Create order:** combine shipping and tax into one inline panel, prefill a verified saved address, and add "Create order" from the customer page. (Customer and product search are already inline in [#15](https://github.com/Unite-Medical/unite_2_0/pull/15).)
2. **S2 Quote Discard trap (P2):** reset the dirty baseline on Discard; add "Discard and leave".
3. **W2 Pick:** add a "Pick this item" action and a ready-to-pick queue, with pick-specific copy.
4. **S1 Two customer lists:** merge them or rename to "My customers" / "All customers".
5. **S8/A13 Search:** visible search button for every staff role; ship [#13](https://github.com/Unite-Medical/unite_2_0/pull/13).
6. **Empty states (W3, W4, S7, F3, F4):** say what the person is waiting for and who owns the next step.
7. **A5/A9:** put Refund approvals and Purchase orders in Damon's sidebar (both are Tools-menu only today).
8. **A12:** remove or reconnect the $0 Analytics page.
9. **Sourcing:** decide what tools the role gets.
