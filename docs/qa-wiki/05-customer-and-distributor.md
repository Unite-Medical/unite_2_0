# 5. Customer & distributor test script

Needs: at least **one pending customer, one approved customer org with an `owner` and a `buyer` and a `viewer`, and one distributor** — all on test mailboxes, flagged as TEST (see [Accounts](03-accounts-and-sign-in.md)). Admin cannot impersonate these routes (no admin bypass), so real accounts are required.

⚠️ Before any checkout: confirm with Alex whether staging Stripe is in **test mode**. If live, stop at the payment step.

## Onboarding

| ID | Test | Steps | Expected |
|---|---|---|---|
| CUS-01 | Pending account | Register (PUB-11), sign in | Lands `/dashboard`; banner says account under review; catalog shows no contract price; `/cart`, `/checkout`, `/account/order`, `/account/reorder` refused |
| CUS-02 | Approval | Admin approves the org in `/admin/customers` (terms, pricing schedule, tax status) | Customer refreshes → prices + ordering unlock; approval audited |
| CUS-03 | Migrated-customer activation | Admin sends activation from `/admin/customers` (customer activations) | Email with `/activate?token=` link; set password; link single-use, expires; reuse shows friendly error |
| CUS-04 | Remember me / session | Sign in with and without "remember me"; close browser | Remembered session persists (≤ 30 days); otherwise ends |

## Ordering (approved `buyer`)

| ID | Test | Expected |
|---|---|---|
| CUS-10 | Contract pricing | Prices match the org's pricing schedule set by admin (compare 5 SKUs against `/admin/pricing`) |
| CUS-11 | Add to cart / update qty / remove | Totals, pack-size multiples, min-order rules correct; cart survives refresh |
| CUS-12 | Checkout | Ship-to selection, PO number, payment method allowed by terms (card / net terms / credit limit), tax & freight shown; order confirmation `/orders/:id/confirmed` |
| CUS-13 | Over-credit-limit / on-hold account | Checkout blocked or routed to review with clear message |
| CUS-14 | Quick order | `/account/order` — paste SKU+qty list, invalid SKU handling |
| CUS-15 | Reorder | `/account/reorder` — reorder a past order; discontinued item handling |
| CUS-16 | Order tracking | `/orders/:id/track` — status, split shipments, tracking links |
| CUS-17 | Invoices | `/account/invoices` — open/paid balances match Finance; PDF download |
| CUS-18 | Quotes | `/account/quotes` — view a staff-issued quote; accept via `/q/:token` (OTP) → becomes order |
| CUS-19 | Documents | `/account/documents` — tax-exemption/resale certificates upload, compliance docs |
| CUS-20 | Settings | `/account/settings` — addresses, contacts, password change |

## Team (org roles)

| ID | Test | Expected |
|---|---|---|
| CUS-30 | Owner invites buyer + viewer | `/account/team` invite emails arrive; roles shown |
| CUS-31 | Viewer is read-only | Viewer can see orders/invoices/tracking but cannot add to cart, check out, or accept quotes (UI **and** API) |
| CUS-32 | Buyer cannot manage team/terms | Team management hidden/refused for buyer |
| CUS-33 | Cross-org isolation | Customer A cannot load customer B's order/invoice by editing the ID in the URL |

## Distributor / 3PL portal (`/distributor`)

| ID | Test | Expected |
|---|---|---|
| DIS-01 | Portal home | Consigned stock summary, open orders, settlement balance |
| DIS-02 | Consigned inventory | `/distributor/inventory` — only own consigned pools; quantities match `/admin/consignment` |
| DIS-03 | Distributor order | `/distributor/order` — order from consigned stock; reservations update |
| DIS-04 | Customer PO upload | `/distributor/po-upload` — upload PDF/CSV PO, parsed lines editable, bad file rejected |
| DIS-05 | Shipping comparison | `/distributor/shipping` — rate options shown (ShipStation); ⚠️ do **not** buy labels |
| DIS-06 | Blind ship | Order with blind-ship → packing slip carries distributor branding, no Unite pricing; tracking goes to distributor contact only |
| DIS-07 | Settlement | `/distributor/settlement` — usage-based settlement lines reconcile with consumed stock |
| DIS-08 | Documents | `/distributor/documents` — branded packing slips, agreements |
| DIS-09 | Isolation | Distributor A cannot see Distributor B stock/orders |

## Non-login links

| ID | Test | Expected |
|---|---|---|
| LNK-01 | Quote link `/q/:token` | Opens without login, requires OTP to accept, tampered token refused, expired token friendly |
| LNK-02 | Supplier PO link `/vendor/purchase-orders/:id` | Supplier can view/acknowledge only that PO; tampered signature refused |
