# 2. Roles & permissions

Source of truth: `src/App.jsx` (route guards), `src/lib/staffWorkspace.js` (sidebar), `src/lib/operationalAccess.js`, `src/lib/accessPolicy.js`, `api/_lib/mfa.js`, `api/admin/roles.js`, `api/auth/role.js`. The API enforces the same boundaries server-side — **QA must check both the UI (link hidden/denied) and the API (direct URL / request refused).**

## Role catalogue

### External

| Role | Who | Lands on | Summary |
|---|---|---|---|
| **Public visitor** | Anyone | `/` | Marketing pages, catalog (no prices), product pages, quick quote (`/quote`), WellLink, RegeniCool, surplus, contact/inquiry, register. |
| **Customer — pending/manual review** | Self-registered buyer not yet approved | `/dashboard` | Can sign in, cannot see prices, use cart or order (`approvedAccount` gate). |
| **Customer — approved** (org role `owner` / `buyer` / `viewer`) | Hospital, ASC, pharmacy, EMS, gov buyer | `/dashboard` | Contract pricing, cart, checkout, quick order, reorder, invoices, quotes, documents, team. `owner` manages team/terms; `buyer` orders/accepts quotes; `viewer` read-only. |
| **Distributor** | 3PL / consignment partner | `/distributor` | Everything a customer has plus own consigned inventory, PO upload, shipping comparison, settlement, documents, blind ship. |
| **Quote recipient** (no login) | Anyone holding a quote link | `/q/:token` | View/accept an issued quote (signed token, OTP). |
| **Supplier** (no login) | Vendor holding a PO link | `/vendor/purchase-orders/:id` | Review/acknowledge a purchase order (signed token). |
| **Account activator** (no login) | Invited/migrated customer or staff | `/activate?token=` | Set password from a single-use activation link. |

### Staff (all land on `/work`)

| Role | Team label | Named person | MFA? | Core tools |
|---|---|---|---|---|
| `admin` | Everyone | Damon | **Yes** | Everything: orders, products, inventory, customers, pricing, quotes, inquiries, CRM/leads, warehouse, finance, approvals, BI, WellLink, settings, integrations, team/roles, test-data, workspace reset, launch, testing |
| `sales` | Sales & service | Jacobe | No | Customer orders (`/sales/orders`), Create order, Supplier POs (`/sales/purchase-orders`), Customer workspace (`/rep`), Quotes, Inquiries, Shipments (read) — **assignment-scoped** |
| `sales_manager` | Sales & service | — | **Yes** | Sales + customer directory (`/rep/customers`) |
| `customer_service` | Sales & service | — | No | Customer workspace (`/rep`), quote engine, Home. **No** order entry or POs |
| `warehouse_operator` | Warehouse | Darren | No | Warehouse app (`/warehouse`), Receive a delivery, Split shipments, WellLink |
| `warehouse_manager` | Warehouse | — | **Yes** | Operator + manager actions in warehouse app |
| `finance` | Finance | Ashley (`accounting@`) | **Yes** | Approvals & release (`/admin/decisions`), Invoices & payments (`/admin/finance`), Refund reviews, Shipments, WellLink |
| `sourcing` | Sourcing | "Sourcing team" | No | Home (`/work`) only in the UI today — `/admin/sourcing` is Admin-only |
| `sourcing_manager` | Sourcing | — | **Yes** | Same as sourcing |

**MFA rule** (`requiresMfa`): any session whose role *or any secondary role* is `admin`, `finance`, `warehouse_manager`, `sales_manager`, or `sourcing_manager` must complete authenticator (TOTP) MFA. First sign-in enrolls and shows 8 one-time recovery codes.

**Multi-role accounts**: a profile has a primary `role` plus `roles[]`. The user switches role in the account menu (`POST /api/auth/role`); it is refused if the role isn't granted or MFA wasn't completed. Admins grant roles at `/admin/team` (`POST /api/admin/roles`, reason required, audited). **An admin cannot change their own roles** — a second admin must.

**What Sales explicitly does *not* get** (from the 10-27 role guide): accounting mapping/retry, catalog-cost writes, credit/payment/refund decisions, security admin, user/role changes, label purchasing, destructive admin tools, PO approval/sending/receiving, AP bill posting.

## Route × role matrix

✅ allowed · ❌ must be refused (redirect to login / "not authorized" / API 401-403) · — n/a

| Route | Public | Cust (pending) | Cust (approved) | Distributor | sales | sales_mgr | cust_svc | wh_op / wh_mgr | finance | sourcing* | admin |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Public pages, `/catalog`, `/products/:id`, `/quote`, `/welllink` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/cart`, `/checkout`, `/account/order`, `/account/reorder` (`approvedAccount` gate) | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/dashboard`, `/account/settings|invoices|quotes|team|documents` | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/distributor/*` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/work` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/rep` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `/rep/customers` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/quote/engine`, `/quotes/:id/print` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `/admin/quotes`, `/staff/inquiries`, `/admin/surplus` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/sales/orders[/new|/:id]`, `/sales/purchase-orders[/new|/:id]` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/warehouse`, `/admin/inventory/receive` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `/staff/shipments` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| `/staff/welllink` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| `/admin/finance`, `/admin/decisions`, `/admin/refund-reviews` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Every other `/admin/*` (orders, products, inventory, customers, pricing, team, settings, integrations, test-data, workspace-reset, launch, testing, sourcing, BI, chat, CRM, webhooks…) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

\* `sourcing` / `sourcing_manager` currently have no sourcing tools outside Admin — confirm with Damon whether that is intended (see [Go-live gates](08-go-live-gates.md)).

Route guards are strict role lists (`src/components/layout/RequireSession.jsx`): **admin has no bypass** — admin is refused at `/dashboard`, `/account/*` and `/distributor/*`, so customer/distributor UX must be tested with real customer/distributor accounts.

Special case: Jacobe has a named read-only exception to the staging customer book (`src/lib/uniteCustomerReadIdentity.js`, matched on `jacobe@unitemedical.net`), and several shipment/approval tasks are hard-routed to his email (`api/orders/shipments.js`). Ordinary `sales` users are assignment-scoped. QA must confirm a second, non-Jacobe sales account does **not** see the whole customer book.

## Role-boundary test checklist

For each staff role and each customer type:

1. Sign in; confirm landing page and sidebar match the tables above.
2. Paste 3 forbidden URLs from the matrix directly into the address bar → refused, no data flashes.
3. In DevTools, re-run one forbidden API call (e.g. `GET /api/admin/roles`, `GET /api/admin/order-detail?...`) → 401/403, no data.
4. Confirm price visibility: anonymous and pending customers see no contract prices; approved customers see only their own contract prices.
5. Confirm no internal cost / margin / supplier cost fields appear for roles outside `owner/admin/finance/procurement` (`COST_VISIBLE_ROLES`).
6. MFA roles: confirm you cannot reach `/work` before completing MFA; confirm role switch into an MFA role without MFA is refused.
7. Sign out → back button does not reveal protected pages.
