# PRD-02 — QuickBooks Online Integration

**Source:** CTO Brief §4 (Priority #1)
**Owner:** Alex (CTO) + CFO as product partner
**Status:** draft
**Repo:** `unite-api` (server) · `unite_2_0` (admin UI)
**Depends on:** PRD-01 (Platform Foundation)
**Blocks:** PRD-03 (Flexport → COGS posts to QBO), PRD-09 (Stripe → QBO reconciliation)

> "Stop double-entry. CFO relief day one." — Brief §2

---

## 1. North star

Every order, refund, Flexport landing, and Stripe payment posts to QBO
automatically. The CFO opens QBO and sees the books reconciled without
having read a single Shopify email.

---

## 2. Current state

- CFO receives Shopify order notification emails, manually re-enters
  billing data into **QuickBooks Desktop**
- QBO Desktop is not connected to Shopify or anything else
- PO entry is duplicate work
- Landed cost from Flexport never enters COGS
- The codebase has a *simulator* in `src/lib/services.js` (`qbo` object)
  that mirrors the real API contract — useful as a reference

---

## 3. Scope

### In scope

- Migrate from **QuickBooks Desktop → QuickBooks Online**
- OAuth 2.0 app registration with Intuit, prod + sandbox
- Bidirectional sync for: `Invoice`, `Bill`, `PurchaseOrder`,
  `Payment`, `Item`, `Account`, `Customer`, `Vendor`
- Webhook receiver for: `Invoice.update`, `Payment.update`
- Admin UI: a "QBO Ledger" view that mirrors the audit log of what we
  pushed to QBO (already partially scaffolded — `db.list('qbo_invoices')`)
- COGS posting (depends on PRD-03 for landed cost)

### Out of scope

- Multi-entity / consolidations (Unite Pharma, Clyne Health) — single
  Unite Medical company file for v1
- Bank feed reconciliation (CFO continues that workflow in QBO directly)
- Payroll, time tracking (QBO has these — out of our integration scope)

---

## 4. Sync flows

| Trigger | What happens |
|---|---|
| New order placed (B2B portal or Shopify) | `customers` upsert in QBO → `Invoice` created with line items + terms (Net-30 / card / ACH) → invoice ID stored on our `orders.qbo_invoice_id` |
| Order cancelled | `Invoice.Void` in QBO; audit log retains both states |
| Flexport shipment cleared customs (PRD-03) | Landed cost per SKU written to `Bill` against the freight vendor; COGS account credited; `flexport_shipments.qbo_bill_id` populated |
| Stripe payment succeeded (PRD-09 webhook) | `Payment` created in QBO against the matching `Invoice`; `Invoice.Balance` recomputed |
| PO issued (PRD-04) | `PurchaseOrder` created in QBO; receiving event later closes it |
| Product added in Cin7 (PRD-04) | `Item` upserted in QBO with COGS + income accounts mapped |
| Invoice paid via ACH outside our portal | QBO webhook → mark our `invoices.status='paid'`, run reconciliation job |

---

## 5. Data contract sketch

We don't store QBO objects verbatim — we keep our shape and a pointer:

```ts
// orders table (already exists)
{
  ...,
  qbo_customer_id: string | null,
  qbo_invoice_id:  string | null,
  qbo_synced_at:   Date | null,
}

// flexport_shipments table
{
  ...,
  qbo_bill_id:    string | null,
  qbo_synced_at:  Date | null,
  landed_cost:    number,
  cogs_per_sku:   Record<string, number>,
}

// qbo_oauth (new table)
{
  realm_id:       string,   // QBO company ID
  access_token:   string,   // encrypted at rest
  refresh_token:  string,   // encrypted at rest
  expires_at:     Date,
  last_refreshed: Date,
}
```

All inbound webhooks pass through a queue (BullMQ) for replay safety.

---

## 6. Phases

### Phase 1 — OAuth + sandbox

- Intuit Developer app created, scopes: `com.intuit.quickbooks.accounting`
- OAuth flow lives at `/admin/integrations/qbo/connect`
- Refresh-token job runs every 50 minutes
- All API calls go through one typed `qboClient` (replaces the
  `services.js` mock body, keeps the signature)

**Exit:** A staff user can authorize the QBO sandbox from `/admin/integrations`.
`qboClient.ping()` returns 200 against sandbox.

### Phase 2 — Customers + Items + Vendors mirror

- Background sync (every 30 min) imports QBO `Customer`, `Item`, `Vendor`
  into our DB tables (read-only mirror)
- Conflict resolution: QBO is source of truth for accounting fields,
  Unite is source of truth for catalog fields (handle, images, etc.)
  — explicit allowlist of which fields each side owns
- Admin UI: `/admin/integrations/qbo` shows last sync time + counts

**Exit:** All QBO customers/items/vendors appear in our `customers`,
`products`, `vendors` tables. No accounting fields drift after a force-sync.

### Phase 3 — Invoice creation on order placement

- New order in our portal → server creates QBO `Customer` if absent,
  posts `Invoice`
- Line items map: our `order_items.sku` → QBO `Item.Id`
- Payment terms map: `net30` → `1` (QBO standard), `card` → `Due on receipt`
- Idempotency: a placed order has at most one QBO invoice (key:
  `orders.id`)
- Failure mode: if QBO is down, the order is still placed, the QBO
  push goes to a retry queue, alert fires after 3 failed attempts

**Exit:** 7 consecutive days of orders placed in production reconcile
to QBO with zero manual entry. CFO confirms.

### Phase 4 — Webhooks (inbound)

- Subscribe to `Invoice.update`, `Payment.update`
- Receiver: `/hooks/qbo` validates the Intuit signature, enqueues a job
- Reconciliation: on `Payment.update` find our `invoice` by
  `qbo_invoice_id`, update status, fire customer notification email

**Exit:** Marking an invoice "paid" in QBO updates our portal within
60 seconds. CFO can do this from QBO directly.

### Phase 5 — COGS from Flexport (depends on PRD-03 Phase 3)

- When Flexport "Shipment cleared customs" event fires (PRD-03), the
  landed cost per SKU posts to QBO as a `Bill` against the freight
  vendor + a `JournalEntry` debiting COGS / crediting inventory
- "Run rate dashboard" in `/admin/analytics` now shows real margin per
  SKU (landed cost subtracted)

**Exit:** Margin reports per SKU in `/admin/analytics` match what
QBO's P&L shows for the same period, within $1 (rounding).

### Phase 6 — Cutover & decommission

- CFO works in parallel for 30 days (QBO Desktop + QBO Online)
- After 30 days of zero discrepancies, QBO Desktop is archived
- Old Shopify→email→manual entry pipeline is killed
- Update `docs/runbooks/cfo.md` with the new workflow

**Exit:** QBO Desktop is in read-only archive. CFO has a written
runbook for the new flow.

---

## 7. Verifier

`scripts/qbo_check.py`:

- Random-sample 20 invoices from the past 7 days
- For each, fetch QBO `Invoice` by ID and assert: `TotalAmt` matches
  our `orders.total` (±$0.01), `Balance` matches our paid status
- Alert if > 1 mismatch
- Runs nightly in CI

---

## 8. Open questions

1. **Chart of accounts mapping**: who owns the canonical mapping of our
   `products.category` → QBO income/COGS accounts? Default: CFO writes
   it down once, we store it in `qbo_account_mapping` table.
2. **Refunds / credit memos**: do we issue from our side or always
   from QBO? Default: from our side; we post `CreditMemo` to QBO.
3. **Multi-currency**: brief is US-only; defer until needed.
4. **Sales tax**: QBO calculates via Avalara or its built-in. Defer
   choice to PRD-09 (Stripe) since tax + billing usually decide together.

---

## 9. Out-of-band

- Intuit Developer account (free) for app registration
- QuickBooks Online subscription — Essentials or Plus depending on
  user count
- One-time data migration from QBO Desktop → QBO Online (Intuit's
  conversion tool or accountant-led)
- CFO availability for Phase 6 parallel run
- New env vars: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`,
  `QBO_WEBHOOK_VERIFIER`, `QBO_ENVIRONMENT` (`sandbox` | `production`)

---

## 10. Definition of done

- 30 consecutive days where every order, payment, and Flexport landing
  reconciles to QBO with zero manual CFO entry
- The `qbo_check.py` verifier runs nightly with zero failures
- QBO Desktop is archived
- CFO has a written runbook and has signed off
