# PRD-03 — Flexport Integration

**Source:** CTO Brief §4 (Priority #2)
**Owner:** Alex (CTO) + Ops Lead as product partner
**Status:** draft
**Depends on:** PRD-01 (Platform), PRD-02 (QBO for COGS posting)
**Blocks:** PRD-04 (WMS needs inbound shipment events to trigger receiving), PRD-08 (Quoting engine needs real freight quotes)

> "Real-time landed cost, customs status, inventory trigger." — Brief §2

---

## 1. North star

Every Flexport shipment milestone is observed by our system within
5 minutes of happening, drives inventory + COGS automatically, and the
landed cost per SKU is queryable instantly.

---

## 2. Current state

- Flexport handles freight forwarding, customs, delivery to GA warehouse
- Used **manually** via the Flexport portal
- FOB, fees, and landed cost are visible there but nothing flows out
- `src/lib/services.js` `flexport` object simulates: `getFreightQuote`,
  `createShipment` — useful as the target interface

---

## 3. Scope

### In scope

- Flexport Public API (REST) for: Booking, Shipment Status, POs,
  Documents, Customs Entries, Invoices, Carbon Calculator, Products,
  Network
- Webhook receiver for milestone events
- Bidirectional SKU sync (so customs docs always have the latest
  product data)
- Quoting engine integration (PRD-08 calls `flexport.getFreightQuote`)
- Inventory receiving workflow trigger on `customs_cleared` event
- Freight invoice → QBO Bill (PRD-02 Phase 5)

### Out of scope

- Flexport EDI (315/214, 310/110, 850, 856) — defer until a customer
  contractually requires it (e.g., CVS, Publix)
- Bespoke (Flexport's custom integrations tier)
- Replacing Flexport as a vendor — pure integration scope

---

## 4. Webhook event flow

```
Flexport: Booking created
    └→ our `flexport_shipments` row inserted (status: 'booked')

Flexport: Departed origin port
    └→ status update + ETA recalc + customer email if customer-tied
       (rare; usually internal POs)

Flexport: Arrived destination port
    └→ status update; ops dashboard surfaces

Flexport: Customs cleared
    └→ trigger 1: Cin7 receiving workflow opens (PRD-04)
       trigger 2: landed-cost line items pulled from Flexport `Invoice`
                  → QBO Bill against freight vendor (PRD-02 Phase 5)
                  → COGS posted per SKU
                  → our `products.landed_cost` updated
       trigger 3: demand-forecast model (PRD-12) refreshes reorder
                  points for the affected SKUs

Flexport: Delivered to warehouse
    └→ Cin7 receiving auto-closes if quantities match; ops alert if
       discrepancy
```

---

## 5. Data contract

```ts
// flexport_shipments (extends current shape)
{
  id:                  string,           // flx_shp_*
  flexport_shipment_id:string,            // upstream ID
  vendor_id:           string,
  origin_port:         string,            // e.g. "CNSHA"
  destination_port:    string,            // "USATL"
  mode:                'LCL' | 'FCL' | 'AIR' | 'TRUCK',
  status:              'booked' | 'departed' | 'arrived' | 'cleared' | 'delivered',
  eta:                 Date | null,
  cbm:                 number | null,
  weight_kg:           number | null,
  freight_total_usd:   number | null,    // from Flexport Invoice
  customs_total_usd:   number | null,
  landed_cost_per_sku: Record<string, number> | null,
  qbo_bill_id:         string | null,
  cin7_receipt_id:     string | null,
  customer_facing:     boolean,          // mostly false; true when a customer ordered a non-stock item
  customer_id:         string | null,
  raw_events:          jsonb[],          // full upstream event payloads, append-only
}
```

---

## 6. Phases

### Phase 1 — Auth + read-only mirror

- Register Flexport API client; obtain OAuth credentials
- `GET /shipments`, `/purchase_orders`, `/invoices` polled hourly into
  our `flexport_shipments` mirror
- Admin UI: `/admin/integrations/flexport` shows status + last sync

**Exit:** Every active Flexport shipment appears in our DB with
correct ETA.

### Phase 2 — Outbound: create booking / PO

- "New PO" button in `/admin/inventory` posts to Flexport via the API
- Once Cin7 (PRD-04) is in, PO creation becomes a chained workflow:
  Cin7 PO → Flexport Booking → our `flexport_shipments` row
- Idempotency: PO has at most one Flexport booking

**Exit:** A new PO created from our admin shows up in Flexport's portal
within 60 seconds.

### Phase 3 — Webhooks (inbound)

- Receiver: `/hooks/flexport` validates signature, queues job
- All five milestone events handled (see §4)
- Replay test: a failed handler can be re-driven from `raw_events`

**Exit:** Manually toggling a status in Flexport's UI updates our
`flexport_shipments` row within 60 seconds.

### Phase 4 — Landed cost → COGS (depends on PRD-02 Phase 5)

- On `customs_cleared`, fetch the Flexport `Invoice` → compute
  per-SKU landed cost using line-item allocation (freight + duties +
  brokerage / units)
- Post QBO Bill + JournalEntry
- Update `products.landed_cost` and trigger re-pricing job (custom
  margin policy in `src/lib/quoting.js` reads from here)

**Exit:** A Flexport invoice posted in production today appears as a
QBO Bill + per-SKU COGS within an hour, with reconciliation verifier
passing.

### Phase 5 — Bidirectional SKU sync

- Whenever a product is created/updated in our DB, push to Flexport
  `/products` endpoint (so customs paperwork always has the latest
  description, HTS code, country of origin)
- Useful when we onboard a new vendor via the quoting engine (PRD-08)

**Exit:** A SKU added in our admin appears in Flexport `/products` API
within 60 seconds.

### Phase 6 — Quoting engine integration

- `src/lib/quoting.js` replaces its mocked `flexport.getFreightQuote`
  call with the real Flexport `Booking` quote endpoint
- Quotes get real LCL/FCL rates for ocean, plus air + trucking options
- The quoting engine compliance section displays the real Flexport
  shipment ID once a quote is accepted

**Exit:** A quote run against the real Flexport API returns rates that
match what an ops user sees in the Flexport portal.

---

## 7. Verifier

`scripts/flexport_check.py` (nightly):

- For the last 50 closed shipments, assert our
  `landed_cost_per_sku` sums match Flexport's `Invoice.TotalAmount`
  (±$1)
- Alert if any milestone event is older than 24 hours and we don't
  have a corresponding row

---

## 8. Open questions

1. **Which Flexport tier** (Public API / Standard EDI / Bespoke)?
   Recommend **Public API** for v1; revisit if CVS/Publix push EDI
   contractually.
2. **Air freight quotes**: brief mentions but isn't urgent. Defer
   to PRD-08 Phase 4.
3. **Carbon Calculator**: brief lists it — useful for sustainability
   marketing copy on the site? Defer.
4. **Multi-warehouse**: GA + NV (per the audit). Flexport currently
   ships to GA only. When NV opens for inbound, add it as a second
   destination port (LAX or OAK depending on supplier mix).

---

## 9. Out-of-band

- Flexport account upgraded to API access (their CSM handles)
- Production API credentials provisioned in Doppler
- One-time mapping spreadsheet: Flexport "Vendor" IDs → our `vendors.id`
  (ops team owns)
- New env vars: `FLEXPORT_CLIENT_ID`, `FLEXPORT_CLIENT_SECRET`,
  `FLEXPORT_WEBHOOK_SECRET`

---

## 10. Definition of done

- Every shipment milestone is reflected in our system within 5 minutes
- Landed cost flows automatically to QBO and to `products.landed_cost`
- `/admin/inventory` shows accurate run-rate / reorder triggers based
  on real receiving events
- The quoting engine (PRD-08) returns real freight quotes
- Ops team confirms: no more manual Flexport portal cross-referencing
