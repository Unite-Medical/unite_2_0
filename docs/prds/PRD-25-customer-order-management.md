# PRD-25 — Customer Order Management & Self-Service Ordering

**Source:** CTO Brief §1 / §6 — "enter data once, sync everywhere"; founder directive (Damon, 2026-06-19): "Customer needs a way to process their orders via the website, once they are logged in. Each customer will have their own pricing, per product, volume discounts, and will be able to pay for their orders via a pre-approved (by Unite) manner."
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01 (platform/auth), PRD-02 (QBO), PRD-09 (Stripe B2B billing), PRD-14 (B2B portal + role-based pricing), PRD-04 (Cin7/WMS — inventory + ShipStation), PRD-24 (zero-touch fulfillment orchestrator), PRD-05 (Resend email)
**Blocks:** PRD-26 (distributor / 3PL ordering builds on this ordering core)

> "Ideally, the customers receive invoices automatically once an order is placed, for all order types, inventory is tracked, and order notifications are sent to customers." — Damon, 2026-06-19

---

## 1. North star

A logged-in customer logs into unitemedical.net, sees **their own contracted pricing** on every product, builds an order (new, quick, or reorder), pays through a **payment method Unite pre-approved for their account**, and receives an invoice, order confirmation, and tracking — automatically, with the accounting team tied in and zero double-entry. A Unite rep can place that same order on the customer's behalf, but only within the **authority an admin granted them**.

This PRD owns the **front of the order**: who can order, at what price, paid how, and who gets told. The downstream execution (reserve → invoice → label → notify) is PRD-24's orchestrator; this PRD feeds it a validated, priced, paid-or-termed order.

---

## 2. Current state

- `src/lib/orders.js` — `placeOrder()` runs an inline chain (DB → inventory → ShipStation → QBO → Stripe → HubSpot). Functional but: flat pricing inputs, freight is a hard-coded `$42 / free-over-$500`, no per-customer payment-method gating, no rep authority checks.
- `src/lib/selfServeQuote.js` — customers can build a *quote* from the catalog priced via `priceFor()` at their tier, then accept it (`quoteAcceptance.js`) to create an order. There is **no direct "buy now" order path** — everything routes through quote → accept.
- `src/lib/pricing.js` — `priceFor({ sku, qty, basePrice, org })` resolves tier + volume breaks. Per-customer *contract* pricing exists in shape but is not yet authored per account.
- `src/lib/fulfillment.js` (PRD-24) — the resilient orchestrator already exists and is the correct downstream. `placeOrder` does **not** yet route through it.
- `0004_orders.sql` — `orders` / `order_items` / `shipments` exist. No `payment_methods`, no `reorder`, no rep-authority tables.
- Email is now Resend-primary (PRD-05, shipped `b3ebca2`).

---

## 3. Scope

### In scope

- **Per-customer pricing** surfaced everywhere the customer sees a product: contract price per SKU, volume/quantity breaks, tier fallback. One resolver, used by catalog, cart, quick order, reorder, and rep order entry.
- **Direct logged-in ordering**: catalog → cart → checkout → order, in addition to the existing quote-accept path.
- **Quick order**: type/paste SKU + qty rows (or scan), skip browsing — for buyers who already know their part numbers.
- **Reorder**: one click from any past order or a saved "order list", re-priced at *current* contract pricing.
- **Pre-approved payment methods**: per-account allowlist of methods Unite has approved (card, ACH, wire, net-terms). Customer can only choose from their allowlist at checkout. Admin grants/revokes per account.
- **Automatic invoicing for all order types** — every placed order produces a QBO invoice + canonical AR row + (for terms/ACH) a Stripe collection invoice, with no manual step. Accounting sees it immediately.
- **Order notifications**: order confirmation, shipping + tracking, delivery — to **multiple CC recipients** per account (AP, buyer, ops).
- **Rep order entry with admin-granted authority (RBAC)**: a rep places orders for a customer, but price/discount/shipping/payment-method overrides are gated by the permission level admin assigned.
- **Inventory tracking** is consumed from the WMS surface (PRD-04 / PRD-26), not reimplemented here.

### Out of scope

- Distributor / 3PL consignment inventory, blind shipping, custom packing slips, PO ingestion, third-party-account billing, carrier-rate markup — **all PRD-26**.
- The fulfillment execution pipeline itself — **PRD-24**.
- Tax calculation engine (TaxJar/Avalara) — tracked in PRD-24 §12 open questions.
- Lot/expiration capture mechanics (scan in/out) — **PRD-26**.

---

## 4. The order pipeline (front half)

```
LOGGED-IN CUSTOMER (or REP acting for customer)
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  ENTRY — one of:                                             │
│   • Catalog → Cart → Checkout                                │
│   • Quick Order (SKU + qty grid / paste / scan)              │
│   • Reorder (clone a past order or saved order list)         │
│   • Quote acceptance (existing /q/:token path)               │
└──────────────────────┬──────────────────────────────────────┘
                       │  every line priced by ONE resolver
┌──────────────────────▼──────────────────────────────────────┐
│  PRICE — resolveCustomerPrice(org, sku, qty)                 │
│   1. contract price for (org, sku)         ← if present      │
│   2. else volume break for qty             ← tiered table    │
│   3. else org tier price (priceFor)        ← fallback        │
│   Returns { unit_price, basis, contract_id?, break? }        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  PAYMENT GATE — only methods on the account's allowlist      │
│   approved_payment_methods(org) → [card, ach, wire, net30…]  │
│   Customer/rep picks one. Anything off-list is rejected.     │
│   Net-terms requires an active terms grant (credit approved).│
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  REP AUTHORITY (only when source = rep) — check grants:      │
│   price_override? discount up to X%? shipping_override?       │
│   add_payment_method? place_on_terms? → else 403, log attempt│
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  PLACE — create order + line items + chosen payment intent    │
│   → hand off to PRD-24 runFulfillment(orderId)               │
│   → automatic QBO invoice + Stripe collection rail            │
│   → notify all CC recipients on the account                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Per-customer pricing

A single resolver is the law. **Everything** that shows or charges a price calls it — no component does its own math.

```
resolveCustomerPrice({ org, sku, qty }) →
  { unit_price, list_price, basis, contract_id?, break_min_qty?, tier, source }

  basis ∈ { 'contract', 'volume_break', 'tier', 'list' }
```

Precedence (first match wins):

1. **Contract** — an explicit per-(org, sku) negotiated price (optionally qty-banded). Highest authority.
2. **Volume break** — quantity ≥ a break threshold for that SKU/category.
3. **Tier** — the org's tier (A/B/C/distributor/gov) via the existing `priceFor()` margin policy.
4. **List** — catalog default if nothing else applies.

The customer always sees *their* number on the PDP, in cart, in quick order, in reorder. Reorder **re-prices at current** contract terms (never the stale historical price) and flags any line whose price changed since last time.

---

## 6. Pre-approved payment methods

Unite controls, per account, which payment rails a customer may use. A customer cannot self-select wire or net-30 unless Unite enabled it for them.

- `account_payment_methods` — allowlist rows per org: `method ∈ {card, ach, wire, net15, net30, net60}`, `status ∈ {active, suspended}`, optional stored token (Stripe payment method id for saved card/ACH), `credit_limit` for terms.
- Checkout renders **only `active` methods** for the org. Selecting an off-list method is a server-side reject (defense in depth — never trust the client).
- **Net-terms** requires an active terms grant; orders that would exceed `credit_limit` route to a hold/approval queue instead of auto-placing.
- Card / ACH → Stripe PaymentIntent (up front). Net-terms → Stripe hosted invoice (collection rail) + QBO terms invoice. Wire → QBO invoice with wire instructions, collected out-of-band. This mirrors `orders.js` today but **enforced against the allowlist**.

---

## 7. Automatic invoicing — accounting tied in

Every order, regardless of type or payment method, produces accounting artifacts with **zero manual entry** — this is the non-negotiable from Damon's brief.

| On order placed | System | Artifact |
|---|---|---|
| Always | QBO | Invoice with correct customer, line items, contract pricing, terms, COGS |
| Always | Canonical AR | `invoices` row the portal + finance dashboard read |
| Card / ACH | Stripe | PaymentIntent → on success, QBO payment recorded + invoice marked paid |
| Net-terms / ACH-invoice | Stripe | Hosted invoice (collection rail), due date per terms |
| Wire | QBO | Invoice w/ wire instructions; reconciled on receipt |

QBO customer ids are cached on the org (as `orders.js` already does via `resolveQboCustomerId`) so no duplicate customers are created. A QBO failure **never blocks the order** (PRD-24 circuit breaker) — it queues for retry and the CFO sees the backlog in `/admin/finance`.

---

## 8. Order notifications (multi-recipient)

- Per account: a list of **notification recipients**, each tagged with which events they want (`order_placed`, `shipped`, `delivered`, `invoice`, `backorder`).
- Order confirmation, shipping + tracking, and delivery emails go to **all matching recipients** (CC), not just the placing user — so AP gets the invoice, the buyer gets tracking, ops gets the confirmation.
- Sent through the Resend-primary mailer chain (PRD-05) → outbox fallback, so a mail outage never loses a notification.

---

## 9. Rep order entry — admin-granted authority (RBAC)

A Unite rep can place an order for any customer they're assigned, but **what they may change is gated by permissions an admin grants** (extends PRD-14 team roles).

Permission grants (per rep, assignable by admin):

| Grant | Allows the rep to… |
|---|---|
| `place_order` | Create an order for an assigned customer |
| `price_override` | Override unit price (within optional floor/cap) |
| `discount` | Apply a discount up to `max_discount_pct` |
| `shipping_override` | Change ship method / waive or adjust freight |
| `add_payment_method` | Add a payment method to the order (still must be account-approved unless `override_payment_gate`) |
| `place_on_terms` | Place on net-terms / bill later |
| `override_credit_hold` | Place even when over credit limit (senior reps) |

- Every override **writes an audit_log entry** with rep id, old/new value, and reason. Attempts beyond a rep's grant are **rejected (403) and logged** — visible to admin.
- Admin manages grants at `/admin/team` (per-rep matrix). Default new-rep profile: `place_order` only.

---

## 10. Data model additions

```sql
-- Migration: 0019_customer_ordering.sql
-- (0020 reserved by PRD-24 fulfillment; this is the next free slot.)

-- Per-customer contract pricing (highest precedence in the resolver).
CREATE TABLE IF NOT EXISTS customer_contract_prices (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_sku     TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  unit_price      NUMERIC(10,2) NOT NULL,
  min_qty         INT DEFAULT 1,            -- price applies at/above this qty (qty banding)
  effective_from  DATE,
  effective_to    DATE,
  created_by      TEXT,                     -- profile.id of the admin/rep who set it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, product_sku, min_qty)
);
CREATE INDEX IF NOT EXISTS idx_contract_prices_org ON customer_contract_prices (org_id, product_sku);

-- Volume breaks (SKU-level, org-tier-independent ladder).
CREATE TABLE IF NOT EXISTS volume_breaks (
  id              TEXT PRIMARY KEY,
  product_sku     TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  min_qty         INT NOT NULL,
  unit_price      NUMERIC(10,2),            -- absolute price, OR
  discount_pct    NUMERIC(5,2),             -- percent off list (one of the two)
  UNIQUE (product_sku, min_qty)
);

-- Per-account allowlist of payment rails Unite pre-approved.
CREATE TABLE IF NOT EXISTS account_payment_methods (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  method          TEXT NOT NULL CHECK (method IN ('card','ach','wire','net15','net30','net60')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  stripe_pm_id    TEXT,                     -- saved card / ACH token, if any
  credit_limit    NUMERIC(12,2),            -- for net-terms methods
  approved_by     TEXT,                     -- profile.id of approving admin
  approved_at     TIMESTAMPTZ,
  UNIQUE (org_id, method)
);

-- Multi-recipient order notifications per account.
CREATE TABLE IF NOT EXISTS account_notification_recipients (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  events          TEXT[] NOT NULL DEFAULT '{order_placed,shipped,delivered,invoice,backorder}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);

-- Saved reorder lists (named SKU+qty sets a buyer reuses).
CREATE TABLE IF NOT EXISTS reorder_lists (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reorder_list_items (
  id              TEXT PRIMARY KEY,
  list_id         TEXT NOT NULL REFERENCES reorder_lists(id) ON DELETE CASCADE,
  product_sku     TEXT NOT NULL REFERENCES products(sku),
  qty             INT NOT NULL
);

-- Rep order-entry authority grants (extends PRD-14 team roles).
CREATE TABLE IF NOT EXISTS rep_order_grants (
  id                TEXT PRIMARY KEY,
  rep_id            TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  grant             TEXT NOT NULL CHECK (grant IN
                      ('place_order','price_override','discount','shipping_override',
                       'add_payment_method','place_on_terms','override_credit_hold','override_payment_gate')),
  max_discount_pct  NUMERIC(5,2),           -- bound for the 'discount' grant
  price_floor_pct   NUMERIC(5,2),           -- bound for 'price_override' (min margin)
  granted_by        TEXT,
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rep_id, grant)
);

-- Order provenance + reorder lineage (additive columns on orders).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT
  CHECK (order_source IN ('catalog','quick_order','reorder','quote_acceptance','rep_entry'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS placed_by_rep_id TEXT REFERENCES profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reordered_from TEXT REFERENCES orders(id);
```

---

## 11. API / module contract sketch

```
src/lib/customerPricing.js
  resolveCustomerPrice({ org, sku, qty })        → priced line (contract→break→tier→list)
  priceCart(org, lines)                          → fully priced cart + basis flags

src/lib/paymentMethods.js
  approvedMethodsFor(org)                         → active allowlist
  assertMethodAllowed(org, method)               → throws if off-list / over credit limit

src/lib/orders.js  (extended)
  placeOrder({ ..., order_source, payment_method, rep_id? })
    → assertMethodAllowed(...)
    → if rep_id: assertRepAuthority(rep_id, requestedOverrides)
    → create order (order_source, placed_by_rep_id, reordered_from)
    → runFulfillment(orderId)        ← route through PRD-24, stop the inline copy drifting
    → notifyRecipients(org, 'order_placed', order)

src/lib/reorder.js
  buildReorder(orderId | listId, org)            → re-priced cart at CURRENT contract terms
  savedLists(org) / saveList(org, name, lines)

src/lib/repAuthority.js
  grantsFor(repId) / assertRepAuthority(repId, overrides)   → 403 + audit on violation

src/lib/notifications.js
  notifyRecipients(org, event, payload)          → fan out to all CC recipients via mailer
```

Admin/portal surfaces:
- `/account/order` — catalog + quick order grid
- `/account/reorder` — past orders + saved lists, one-click reorder
- `/admin/customers/:id/pricing` — author contract prices + volume breaks
- `/admin/customers/:id/payment-methods` — manage the allowlist + credit limits
- `/admin/customers/:id/notifications` — manage CC recipients
- `/admin/team` — rep authority matrix (extends PRD-14)

---

## 12. Phases

### Phase 1 — Per-customer pricing resolver
- Build `customerPricing.js` with the 4-level precedence; back it with `customer_contract_prices` + `volume_breaks`.
- Surface the customer's price on PDP, cart, quick order.
- Admin pricing editor at `/admin/customers/:id/pricing`.

**Exit:** Two orgs see two different prices for the same SKU; a qty crossing a volume break re-prices live; contract price overrides both.

### Phase 2 — Direct ordering + quick order + reorder
- Add the direct catalog→cart→checkout order path (not only quote-accept).
- Quick order grid (SKU+qty paste/scan); reorder from past order + saved lists, re-priced at current terms with changed-price flags.

**Exit:** A buyer places a 12-line quick order and a 1-click reorder; both produce identical downstream artifacts to a catalog order.

### Phase 3 — Pre-approved payment methods
- `account_payment_methods` allowlist; checkout renders only active methods; server rejects off-list.
- Net-terms credit-limit gate → hold queue when exceeded.

**Exit:** A customer with only `ach` + `net30` cannot select wire or card; an over-limit terms order routes to approval instead of placing.

### Phase 4 — Automatic invoicing + accounting hooks
- Route `placeOrder` through `runFulfillment` (PRD-24) so invoice/label/notify are orchestrated, resilient, idempotent.
- Confirm every order type yields a QBO invoice + canonical AR row + correct Stripe rail.

**Exit:** Card, ACH, wire, and net-30 orders each auto-produce the correct invoice set; a simulated QBO outage queues + retries without blocking shipping.

### Phase 5 — Multi-recipient notifications
- `account_notification_recipients`; fan-out on order/ship/deliver/invoice/backorder via Resend chain.

**Exit:** One order emails 3 distinct recipients (buyer, AP, ops) per their event subscriptions; mail outage falls back to outbox and retries.

### Phase 6 — Rep order entry + RBAC
- `rep_order_grants`; enforce on every override; audit all changes + rejected attempts.
- Admin grant matrix at `/admin/team`.

**Exit:** A rep with `discount ≤ 10%` cannot apply 15%; the attempt is rejected and logged; a rep without `place_on_terms` cannot bill-later.

---

## 13. Verifier

`scripts/ordering_check.py` (to be added once Phase 1 lands — not wired into CI before the code exists):

- Assert `customerPricing.resolveCustomerPrice` is the only price source used by cart/checkout/quick-order/reorder (no inline price math in those components).
- Assert checkout server-rejects any payment method not in the org allowlist.
- Assert every placed order (any source) has a QBO invoice + canonical AR row.
- Assert every rep override has a matching `audit_log` entry.
- Assert reorder re-prices at current contract terms (not historical).
- Run a synthetic order per source (catalog/quick/reorder/rep) through to a tracking number.

---

## 14. Open questions

1. **Credit-limit source of truth** — does the net-terms credit limit live in Unite's DB (`account_payment_methods.credit_limit`) or sync from QBO customer credit? Recommendation: Unite DB authoritative, optionally seeded from QBO.
2. **Contract price authoring** — bulk upload (xlsx, reuse PRD-18 parser) vs. per-line admin UI vs. both? Recommendation: both; xlsx import for onboarding, UI for edits.
3. **Reorder price-change behavior** — auto-accept the new price, or require the buyer to acknowledge changed lines before placing? Recommendation: surface + require acknowledge on any increase.
4. **Saved cards / ACH tokens** — store Stripe payment-method ids per account, or tokenize per-checkout? Recommendation: store per account (faster reorder), customer-managed in portal.
5. **Tax** — still unresolved (shared with PRD-24 §12). Blocks "all order types invoiced correctly" if Shopify tax is removed.

---

## 15. Out-of-band

- Stripe customer + saved-payment-method setup confirmed against live keys (now set per `.env`).
- QBO OAuth connection live (still stubbed at `b3ebca2` — needs the QBO grant).
- Resend templates: order confirmation, shipping, delivery, invoice (extend PRD-05 set).
- Initial per-customer contract price + volume-break data from Damon / sales (seed set for top accounts).
- Initial rep authority matrix from Damon (who can discount, how much, who can place on terms).

---

## 16. Definition of done

- A logged-in customer sees their contracted pricing everywhere and places catalog, quick, and reorder orders.
- The customer can only pay via a method Unite pre-approved for their account.
- Every order — every type — auto-creates a QBO invoice + AR row + the correct Stripe rail, with accounting needing zero manual entry.
- Order/ship/deliver/invoice notifications reach all CC recipients on the account.
- A rep can place orders within admin-granted authority; every override is bounded and audited.
- `placeOrder` runs through the PRD-24 orchestrator (no drifting inline duplicate).
