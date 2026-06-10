# PRD-20 — Real-Time Webhook Event Bus

**Source:** CTO Brief §1 — "Enter data once — have it sync across all aspects of the company"
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01 (Fastify backend)
**Blocks:** reliable operation of PRD-02 (QBO), PRD-03 (Flexport), PRD-04 (Cin7), PRD-09 (Stripe)

> "Enter data once — have it sync across all aspects of the company." — Brief §1

---

## 1. North star

Every external event — Flexport shipment cleared, Stripe payment received, ShipStation label printed, Fathom call completed — arrives at a single, resilient webhook receiver that validates the signature, routes to the right handler, retries on failure, and produces an audit trail. No event is lost. No handler crashes the system. Every downstream sync happens within 5 minutes of the source event.

---

## 2. Current state

- Each integration client (`flexport.js`, `stripe.js`, `shipstation.js`, `fathom.js`) has a `handleWebhookEvent()` method
- No webhook receiver endpoints exist on any server (there IS no server — PRD-01)
- `_http.js` has a `verifyWebhookSignature()` function that returns `pending_pr_01_backend`
- Webhook handlers currently write to the localStorage DB via `db.insert('audit_log', ...)`
- No retry logic, no dead-letter queue, no idempotency
- No signature verification for any provider

---

## 3. Scope

### In scope

- **Unified webhook receiver** — a set of Fastify routes under `/hooks/*` that receive webhooks from all external systems
- **Signature verification** per provider (HMAC-SHA256 for Stripe, custom for Flexport/ShipStation)
- **Event routing** — based on provider + event type, dispatch to the correct handler
- **Idempotency** — deduplicate events by provider event ID (don't process the same Stripe event twice)
- **Retry with backoff** — if a handler fails (e.g., QBO is down when Stripe payment arrives), retry 3× with exponential backoff
- **Dead-letter queue** — events that fail all retries are stored for manual review + replay
- **Audit trail** — every event logged: received_at, provider, event_type, processed_at, result, retries
- **Health dashboard** — `/admin/webhooks` shows recent events, failures, retry queue
- **Provider registration** — store webhook URLs and secrets per provider

### Out of scope

- Real-time pub/sub (WebSockets, SSE for browser push) — that's a future enhancement
- Outbound webhooks (notifying third parties of our events)
- Event sourcing architecture (we're doing CRUD with audit logs, not full event sourcing)

---

## 4. Webhook endpoints

| Route | Provider | Events | Signature |
|---|---|---|---|
| `POST /hooks/stripe` | Stripe | `payment_intent.succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.created` | `Stripe-Signature` header, HMAC-SHA256 with `STRIPE_WEBHOOK_SECRET` |
| `POST /hooks/flexport` | Flexport | `shipment.departed`, `shipment.arrived`, `shipment.cleared`, `shipment.delivered`, `shipment.exception` | Custom header, verify with `FLEXPORT_WEBHOOK_SECRET` |
| `POST /hooks/shipstation` | ShipStation | `ORDER_NOTIFY`, `SHIP_NOTIFY`, `ITEM_ORDER_NOTIFY` | URL parameter `?verify=<hash>` |
| `POST /hooks/fathom` | Fathom | `call.completed` | Bearer token in Authorization header |
| `POST /hooks/cin7` | Cin7 | `inventory.adjusted`, `po.received`, `stock.transfer` | API key in header |
| `POST /hooks/qbo` | QuickBooks | `payment.created`, `invoice.updated`, `bill.created` | Intuit signature verification |

---

## 5. Event processing pipeline

```
┌─────────────────────────────────────────────────┐
│  RECEIVE                                         │
│  POST /hooks/{provider}                          │
│  → Validate Content-Type (application/json)      │
│  → Extract raw body for signature verification   │
│  → Return 200 immediately (acknowledge receipt)  │
└──────────────────┬──────────────────────────────┘
                   │ (async)
┌──────────────────▼──────────────────────────────┐
│  VERIFY                                          │
│  → Verify signature using provider-specific      │
│    algorithm + stored secret                     │
│  → If invalid: log + discard (don't retry)       │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  DEDUPLICATE                                     │
│  → Check event ID against processed_events table │
│  → If already processed: log + skip              │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  ROUTE                                           │
│  → Match provider + event_type to handler        │
│  → Handlers are the existing .handleWebhookEvent │
│    methods (already written in the integration   │
│    clients)                                      │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  HANDLE                                          │
│  → Execute the handler (e.g., flexport           │
│    .handleWebhookEvent updates shipment status,  │
│    triggers Cin7 receiving, queues QBO bill)      │
│  → If success: mark event as processed           │
│  → If failure: schedule retry                    │
└──────────────────┬──────────────────────────────┘
                   │ (on failure)
┌──────────────────▼──────────────────────────────┐
│  RETRY                                           │
│  → Exponential backoff: 30s, 2min, 15min         │
│  → Max 3 retries                                 │
│  → After 3 failures: move to dead-letter queue   │
│  → Alert admin via email                         │
└──────────────────────────────────────────────────┘
```

---

## 6. Data model

```sql
-- Migration: 0017_webhook_events.sql

CREATE TABLE IF NOT EXISTS webhook_events (
  id              TEXT PRIMARY KEY,
  provider        TEXT NOT NULL,           -- 'stripe', 'flexport', etc.
  provider_event_id TEXT,                  -- their event ID (for dedup)
  event_type      TEXT NOT NULL,           -- 'payment_intent.succeeded'
  payload         JSONB NOT NULL,          -- raw event payload
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  retry_count     INTEGER DEFAULT 0,
  next_retry_at   TIMESTAMPTZ,
  processed_at    TIMESTAMPTZ,
  error_message   TEXT,
  received_at     TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_webhook_dedup ON webhook_events(provider, provider_event_id);
CREATE INDEX idx_webhook_status ON webhook_events(status);
CREATE INDEX idx_webhook_retry ON webhook_events(next_retry_at) WHERE status = 'failed';
```

---

## 7. Phases

### Phase 1 — Receiver skeleton + Stripe webhooks

- Build `/hooks/*` Fastify routes with signature verification
- Implement Stripe webhook verification (most well-documented)
- Event logging to `webhook_events` table
- Idempotency check
- Wire Stripe handlers: `payment_intent.succeeded` → QBO reconciliation

**Exit:** A Stripe test webhook arrives, signature verified, handler runs, event logged. Duplicate event is detected and skipped.

### Phase 2 — Flexport + ShipStation webhooks

- Flexport webhook verification + handler wiring
- ShipStation webhook verification + handler wiring
- Flexport `shipment.cleared` → Cin7 receiving trigger → QBO bill
- ShipStation `SHIP_NOTIFY` → tracking number update → customer notification

**Exit:** Flexport shipment clearance event triggers inventory update + QBO bill creation within 5 minutes.

### Phase 3 — Retry + dead-letter queue

- Exponential backoff retry logic
- Dead-letter queue for persistent failures
- Admin notification on dead-letter events
- Manual replay button in admin UI

**Exit:** Simulate a handler failure (QBO down) → event retries 3× → moves to dead-letter → admin notified → manual replay succeeds after QBO recovers.

### Phase 4 — Admin dashboard + monitoring

- `/admin/webhooks` page: recent events, failures, retry queue, dead-letter
- Filters by provider, event type, status, date range
- Event detail view: raw payload, handler result, retry history
- Health metrics: events/hour, failure rate, avg processing time

**Exit:** Admin can see all webhook activity, identify failures, and replay dead-letter events.

### Phase 5 — Fathom + Cin7 + QBO webhooks

- Complete all remaining webhook integrations
- Fathom `call.completed` → Claude extraction → HubSpot tasks
- Cin7 inventory adjustments → stock level sync
- QBO payment events → order status updates

**Exit:** All 6 providers are sending real webhooks, all are processed reliably.

---

## 8. Verifier

`scripts/webhook_check.py`:

- Assert all `/hooks/*` routes return 200 for valid payloads
- Assert invalid signatures return 401
- Assert duplicate events are detected (idempotency)
- Assert retry logic triggers on handler failure
- Assert dead-letter queue captures events after max retries
- Assert no events older than 24 hours are in 'pending' status

---

## 9. Open questions

1. **Event ordering**: do we need to guarantee event ordering per entity (e.g., all Flexport events for shipment X processed in order)? Recommendation: yes for shipment lifecycle events, not critical for others.
2. **Webhook URL configuration**: do we register webhook URLs with each provider automatically (Stripe has an API for this) or manually? Recommendation: manual for v1 (documented in each PRD).
3. **Payload storage**: how long do we keep raw webhook payloads? Recommendation: 90 days, then archive to cold storage.

---

## 10. Out-of-band

- Stripe webhook secret (`STRIPE_WEBHOOK_SECRET`)
- Flexport webhook secret (`FLEXPORT_WEBHOOK_SECRET`)
- ShipStation webhook URL registered in ShipStation admin
- Fathom webhook URL registered in Fathom settings
- Public URL for webhook endpoints (Fly.io domain or custom domain with SSL)
- New env vars: all webhook secrets per provider

---

## 11. Definition of done

- All 6 providers' webhooks are received, verified, and processed
- No event is lost (100% delivery with retry)
- Duplicate events are detected and skipped
- Failed handlers retry automatically with exponential backoff
- Dead-letter queue captures persistent failures for manual resolution
- Admin dashboard shows real-time webhook health
- Average event processing time < 5 seconds
