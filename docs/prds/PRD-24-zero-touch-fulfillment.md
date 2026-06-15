# PRD-24 — Zero-Touch Order Fulfillment Pipeline

**Source:** CTO Brief §1 — "A customer places an order → inventory updates, invoice auto-creates in QBO, ShipStation generates label, tracking number returns to customer portal — zero human touchpoints"
**Owner:** Alex (CTO)
**Status:** shipped (client-side) 2026-06-15 — orchestrator (`src/lib/fulfillment.js`) runs validate→reserve→payment→invoice→shipping→packing slip→notify→delivered with retry + per-integration circuit breakers, backorders, auto-fulfill on restock, and returns/RMAs. Observable at `/admin/fulfillment`. Server worker + true async retry queue deferred to PRD-01/20.
**Depends on:** PRD-01, PRD-02 (QBO), PRD-03 (Flexport), PRD-04 (Cin7/WMS), PRD-09 (Stripe), PRD-14 (B2B portal), PRD-17 (PDF pipeline), PRD-20 (webhook event bus)
**Blocks:** the north star — "enter data once, sync everywhere"

> "A customer places an order → inventory updates, invoice auto-creates in QBO, ShipStation generates label, tracking number returns to customer portal — zero human touchpoints" — Brief §1

---

## 1. North star

From the moment a customer clicks "Place Order" to the moment they receive a tracking number, zero humans intervene. Inventory decrements in Cin7, an invoice auto-creates in QBO, ShipStation rate-shops across carriers and prints a label, a packing slip generates, the tracking number flows back to the customer portal and triggers a shipping notification email. The CFO sees reconciled books. The warehouse sees a pick list. The customer sees a tracking number. Nobody manually entered anything.

---

## 2. Current state

- Order flow exists in the SPA: catalog → cart → checkout → order confirmation
- But it's entirely client-side — localStorage DB, no backend
- `src/lib/external/qbo.js` has `createInvoice()` — stubbed
- `src/lib/external/shipstation.js` has `getRates()` and `createLabel()` — stubbed
- `src/lib/external/cin7.js` has `syncInventory()` — stubbed
- `src/lib/external/stripe.js` has `createPaymentIntent()` — stubbed
- No orchestration layer ties these together
- Each integration was built independently — no "order placed → do all of this" pipeline
- PRD-20 (webhook event bus) provides the event handling, but no orchestrator exists

---

## 3. Scope

### In scope

- **Order orchestrator**: a server-side pipeline that triggers all downstream actions when an order is placed
- **Inventory reservation**: Cin7 reserves stock on order placement, decrements on shipment
- **Payment processing**: Stripe creates payment intent (or net-30 invoice per customer terms)
- **Invoice generation**: QBO invoice auto-creates with correct line items, pricing, and payment terms
- **Shipping automation**: ShipStation rate-shops, creates label, returns tracking number
- **Packing slip generation**: PDF packing slip with lot numbers and item checklist (PRD-17)
- **Customer notifications**: order confirmation, shipping confirmation + tracking, delivery confirmation
- **Backorder handling**: if inventory insufficient, partial ship + backorder for remainder
- **Return/refund flow**: customer initiates return → RMA created → inventory restocked → refund issued

### Out of scope

- Autonomous procurement (auto-reorder from vendors) — that's PRD-12 (demand forecasting)
- Real-time warehouse robotics
- Drop-shipping from vendor directly to customer (all orders ship from Unite warehouse)
- International shipping (domestic U.S. only for v1)

---

## 4. The zero-touch pipeline

```
CUSTOMER CLICKS "PLACE ORDER"
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: VALIDATE                                            │
│  → Verify customer account is active + approved (PRD-14)     │
│  → Verify all items still in stock (query Cin7)              │
│  → Verify pricing matches customer tier (no tampering)       │
│  → Verify payment method is valid                            │
│  → If validation fails: return error to customer, don't      │
│    proceed (no partial state)                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STEP 2: RESERVE INVENTORY                                   │
│  → Cin7 API: reserve qty per line item per warehouse         │
│  → If insufficient stock: flag backorder items               │
│  → Reservation has 30-minute TTL (released if payment fails) │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STEP 3: PROCESS PAYMENT                                     │
│  → Customer payment terms from HubSpot/customer record       │
│  → Credit card: Stripe PaymentIntent → charge immediately    │
│  → Net-30/60: Stripe Invoice → schedule per terms            │
│  → ACH: Stripe ACH PaymentIntent → initiate bank transfer    │
│  → If payment fails: release inventory reservation, notify   │
│    customer, log failure                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STEP 4: CREATE QBO INVOICE                                  │
│  → QBO API: create invoice with line items, pricing, tax     │
│  → Link Stripe payment to QBO invoice for reconciliation     │
│  → Post COGS per item (landed cost from product record)      │
│  → If QBO fails: order still proceeds — invoice queued for   │
│    retry (don't block fulfillment on accounting)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STEP 5: CREATE SHIPSTATION ORDER                            │
│  → ShipStation API: create order with items, weights, dims   │
│  → Rate shop: FedEx Ground, UPS Ground, USPS Priority        │
│  → For pallet/LTL: FreightQuote API for LTL rates            │
│  → Select cheapest option meeting customer's delivery window  │
│  → Generate label                                            │
│  → Return tracking number                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STEP 6: GENERATE PACKING SLIP                               │
│  → PDF pipeline (PRD-17): packing slip with                  │
│    - Order items + quantities                                │
│    - Lot numbers per item (from Cin7 lot tracking)           │
│    - Barcode for warehouse scanning                          │
│    - Customer shipping address                               │
│    - Carrier + tracking number                               │
│  → Store PDF in R2                                           │
│  → Print signal sent to warehouse printer                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STEP 7: NOTIFY CUSTOMER                                     │
│  → Email via Resend:                                         │
│    - Order confirmation (immediately)                        │
│    - Shipping confirmation + tracking link (when shipped)    │
│  → Customer portal: order status updates in real-time        │
│  → HubSpot: deal stage → "Shipped"                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  STEP 8: DELIVERY CONFIRMATION                               │
│  → ShipStation webhook: SHIP_NOTIFY → tracking active        │
│  → Carrier tracking webhook or polling: delivered             │
│  → Cin7: decrement reserved → shipped                        │
│  → Email: delivery confirmation                              │
│  → HubSpot: deal stage → "Delivered"                         │
│  → 7 days later: satisfaction survey email (optional)        │
└──────────────────────────────────────────────────────────────┘

TOTAL HUMAN TOUCHPOINTS: 0 (warehouse picks and packs per packing slip, but no data entry)
```

---

## 5. Error handling & circuit breakers

The pipeline must be resilient. Any single integration can fail without killing the order:

| Step fails | Impact | Recovery |
|---|---|---|
| Cin7 down | Can't verify stock | Queue order, process when Cin7 recovers. Accept if last-known stock > order qty. |
| Stripe down | Can't process payment | Hold order in "payment_pending" state. Retry every 5 minutes for 1 hour. |
| QBO down | Can't create invoice | Order proceeds. Invoice queued for retry. CFO sees backlog in admin. |
| ShipStation down | Can't create label | Order proceeds to "ready_to_ship" state. Label created on recovery. |
| Resend down | Can't send email | Email queued in `gmail_outbox`. Retry every 15 minutes. |
| PDF generation fails | No packing slip | Log error. Warehouse can still pick from the order screen. |

**Circuit breaker pattern**: if any integration fails 5× in 10 minutes, trip the circuit — stop calling it, alert admin, process orders in degraded mode.

---

## 6. Backorder handling

When inventory is insufficient for the full order:

1. **Partial ship**: ship available items, create backorder for remainder
2. **Customer notification**: "3 of 5 items shipped. 2 items backordered — estimated restock: June 28."
3. **Backorder auto-fulfills**: when Cin7 stock replenishes (via Flexport delivery or manual receiving), backorder items automatically ship
4. **QBO handling**: partial invoice for shipped items, amended invoice when backorder ships
5. **Customer choice**: at checkout, customer can choose "Ship what's available" or "Wait for full order"

---

## 7. LTL / Pallet shipping

For large orders (> 150 lbs or > 2 pallets):

- ShipStation handles parcel. For LTL: integrate FreightQuote or Freightview API
- Rate shop: compare FedEx Freight, UPS Freight, ODFL, XPO
- BOL (Bill of Lading) generation
- Delivery appointment scheduling for hospital/retailer receiving docks
- POD (Proof of Delivery) capture

This is critical for large retailers (CVS, Publix, GoPuff) and hospital systems.

---

## 8. Data model additions

```sql
-- Migration: 0020_fulfillment.sql

CREATE TABLE IF NOT EXISTS fulfillment_pipeline (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id),
  step            TEXT NOT NULL CHECK (step IN ('validate', 'reserve', 'payment', 'invoice', 'shipping', 'packing_slip', 'notify', 'delivered')),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempt_count   INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at   TIMESTAMPTZ,
  result          JSONB,                   -- { success: true, tracking: "1Z...", ... }
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS backorders (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id),
  order_item_id   TEXT NOT NULL REFERENCES order_items(id),
  product_id      TEXT NOT NULL REFERENCES products(id),
  variant_id      TEXT REFERENCES product_variants(id),
  quantity         INTEGER NOT NULL,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'restocked', 'shipped', 'cancelled')),
  estimated_restock TIMESTAMPTZ,
  restocked_at    TIMESTAMPTZ,
  shipped_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_fulfillment_order ON fulfillment_pipeline(order_id);
CREATE INDEX idx_fulfillment_status ON fulfillment_pipeline(status) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_backorders_status ON backorders(status) WHERE status = 'pending';
CREATE INDEX idx_backorders_product ON backorders(product_id) WHERE status = 'pending';
```

---

## 9. Phases

### Phase 1 — Order orchestrator skeleton

- Build the pipeline runner: receives an order ID, executes steps sequentially
- Each step: attempt → log result → proceed or retry
- Circuit breaker per integration
- Admin view: `/admin/orders/{id}/pipeline` shows step-by-step status

**Exit:** An order triggers all 8 steps. Simulated failures at step 4 (QBO) don't block step 5 (shipping).

### Phase 2 — Inventory reservation + payment

- Cin7 API: `reserveStock()` on order placement, `releaseStock()` on failure
- Stripe: `createPaymentIntent()` for card, `createInvoice()` for net-30/60
- Reservation TTL: 30 minutes, auto-release on payment failure
- Handle partial stock (backorder creation)

**Exit:** An order with 3 items, 1 out of stock: 2 items reserved + payment processed + 1 backorder created.

### Phase 3 — QBO invoice + ShipStation label

- QBO: auto-create invoice with correct items, pricing, and payment terms
- ShipStation: create order, rate shop, select carrier, generate label
- Tracking number flows back to order record
- For LTL orders: separate freight rate shopping flow

**Exit:** Order → QBO invoice + ShipStation label with tracking number. Admin sees both in order detail view.

### Phase 4 — Packing slip + customer notifications

- PDF packing slip with lot numbers (PRD-17)
- Email: order confirmation, shipping confirmation with tracking link
- Customer portal: real-time order status
- HubSpot deal stage updates

**Exit:** Customer receives order confirmation email within 60 seconds of placing order. Shipping email with tracking within 60 seconds of label creation.

### Phase 5 — Delivery tracking + backorder auto-fulfillment

- ShipStation webhook: `SHIP_NOTIFY` → tracking active
- Carrier tracking polling (or webhook): delivery confirmed
- Backorder auto-fulfillment: Cin7 stock replenished → backorder items auto-ship
- Delivery confirmation email
- Post-delivery satisfaction prompt (optional)

**Exit:** Full lifecycle: order → payment → ship → deliver → confirm. Backorder auto-ships when stock arrives. Zero human data entry.

### Phase 6 — Returns / refunds

- Customer initiates return from portal
- RMA number generated
- Return shipping label created (prepaid or customer-paid per policy)
- Item received at warehouse → Cin7 restock → QBO credit memo → Stripe refund
- Customer notified of refund

**Exit:** End-to-end return: customer requests → label generated → item returned → restocked → refunded. All automated.

---

## 10. Performance requirements

| Metric | Target |
|---|---|
| Order validation + reservation | < 3 seconds |
| Payment processing (card) | < 5 seconds |
| QBO invoice creation | < 3 seconds |
| ShipStation label creation | < 10 seconds |
| Packing slip PDF | < 5 seconds |
| Customer notification email | < 5 seconds |
| **Total: order → tracking number** | **< 30 seconds** |

---

## 11. Verifier

`scripts/fulfillment_check.py`:

- Assert every order with status ≥ 'confirmed' has a `fulfillment_pipeline` record for all 8 steps
- Assert no step has been in 'failed' status for > 1 hour without retry or dead-letter
- Assert every shipped order has a tracking number
- Assert every shipped order has a QBO invoice
- Assert inventory in Cin7 matches `orders.quantity_shipped` count
- Run a synthetic order through the full pipeline — assert completion in < 30 seconds

---

## 12. Open questions

1. **Warehouse printer integration**: how does the packing slip PDF reach the warehouse printer? Options: (a) warehouse staff downloads from admin, (b) auto-print via network printer API, (c) Zebra scanner/printer combo. Recommendation: (a) for v1, (b) for v2.
2. **Sales tax**: brief doesn't mention sales tax. Shopify currently handles it. New platform needs TaxJar or Avalara integration. Recommendation: add as Phase 7 or separate PRD.
3. **LTL carrier selection**: which LTL carriers does Unite Medical use? Need to set up accounts with FreightQuote or Freightview.
4. **Backorder policy**: do we allow backorders for all products or only certain categories? Recommendation: allow for all; customer can opt out at checkout.

---

## 13. Out-of-band

- ShipStation carrier accounts (FedEx, UPS, USPS) confirmed active
- FreightQuote/Freightview account for LTL (if pallet shipments needed)
- Resend transactional email templates (order confirmation, shipping, delivery)
- Warehouse printer setup (if auto-print desired)
- Sales tax service evaluation (TaxJar vs. Avalara)
- New env vars: `FREIGHTQUOTE_API_KEY` (if LTL enabled)

---

## 14. Definition of done

- Customer places an order → tracking number returned in under 30 seconds
- Zero human data entry in the entire pipeline
- QBO invoice auto-creates and reconciles with Stripe payment
- Inventory updates in real time across Cin7 and customer portal
- Backorders auto-fulfill when stock replenishes
- CFO opens QBO and sees reconciled books without manual intervention
- The pipeline has run 100+ orders without a missed step
