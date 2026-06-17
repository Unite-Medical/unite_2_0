# Go-Live Runbook

How to take Unite Medical 2.0 from "demo on stubs" to "fully live." The
codebase is built so that **adding credentials is the only thing that flips a
surface from stub to real** — there are no unfinished integration code paths.

- **Status dashboard:** `/admin/integrations` (per-service configured? + ping)
- **Machine-readable:** `GET /api/health` → `{ service: { configured: bool } }`
- **Env template:** copy `.env.example` → set in Vercel → Settings → Env Vars

How it works: the browser never holds a secret. Clients in
`src/lib/external/*` POST plain JSON to `/api/proxy/<service>/<path>`; the
serverless proxy (`api/_lib/services.js`) injects the secret and forwards
upstream. If a service's env vars are missing the proxy returns `503` and the
client falls back to its local stub. Same signatures either way, so nothing
else in the app changes when you go live.

---

## Bucket A — paste a key, done (no other steps)

Set the env var(s) in Vercel and redeploy. The surface is live immediately.

| Service | Env var(s) | Lights up |
|---|---|---|
| Anthropic / Claude | `ANTHROPIC_API_KEY` | column mapping, translation, FDA/HTS classify, cover letters, CEO digest, surplus valuation, outreach |
| **Resend (email)** | `RESEND_API_KEY` | **all outbound email** — order/shipping notices, invoices, dunning, POs, outreach, rep statements, customer confirmations |
| Stripe | `STRIPE_SECRET_KEY` | invoices, payments, rep payouts (Connect) |
| Calendly | `CALENDLY_API_KEY` | rep scheduling links + booking → CRM |
| HubSpot | `HUBSPOT_PRIVATE_APP_TOKEN` | CRM sync, rep pipeline |
| Cin7 Core | `CIN7_ACCOUNT_ID`, `CIN7_APPLICATION_KEY` | inventory / WMS source of truth |
| GS1 US | `GS1_API_KEY`, `GS1_ACCOUNT_ID` | GTIN validation in product onboarding |
| ImportGenius | `IMPORTGENIUS_API_KEY` | vendor discovery / trade intelligence |
| ShipStation | `SHIPSTATION_API_KEY`, `SHIPSTATION_API_SECRET` | label creation + tracking |
| Persistence | `DATABASE_URL`, `DB_SYNC_TOKEN`, `VITE_DB_SYNC_TOKEN` | durable Neon-backed multi-device state |

**Email:** `RESEND_API_KEY` is the only credential needed for outbound mail.
The sender is a provider chain (`src/lib/mailer.js`): Resend → Gmail → local
outbox. With no key set, mail queues in the outbox (nothing is lost); set the
key and it sends for real — no code change.

**Scheduling:** Calendly is the primary scheduler (booking links + webhook →
`calendar_events` + CRM). Google Calendar is **not** required.

---

## Bucket B — one-time OAuth consent (≈2 min each)

The code exists; you just need to mint a refresh token once.

### QuickBooks Online
1. Set `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT` (`sandbox`→`production`).
2. In the Intuit developer app, register redirect URI: `https://<deployment>/api/auth/qbo/callback`.
3. Visit `https://<deployment>/api/auth/qbo/connect`, approve. The callback stores `QBO_REALM_ID` + `QBO_REFRESH_TOKEN` (or paste them into env).

### Google (Gmail + Calendar) — OPTIONAL
Not needed for go-live: Resend covers outbound email and Calendly covers
scheduling. Add Google only if you also want inbox reading (AI triage) or
events mirrored into a Google Calendar. One consent covers both Gmail + Calendar.
1. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google Cloud → OAuth consent → Web app).
2. Register redirect URI: `https://<deployment>/api/auth/google/callback`.
3. Visit `https://<deployment>/api/auth/google/connect`, approve. Save the returned `GOOGLE_REFRESH_TOKEN`.

---

## Bucket C — needs provider-side config beyond a key

### Webhooks
For each, register the endpoint URL in the provider dashboard and set the
matching `*_WEBHOOK_SECRET`. Receivers verify the signature, dedupe, and feed
the durable event bus (`/admin/webhooks`).

| Provider | Endpoint | Secret |
|---|---|---|
| Stripe | `/api/hooks/stripe` | `STRIPE_WEBHOOK_SECRET` |
| ShipStation | `/api/hooks/shipstation` | `SHIPSTATION_WEBHOOK_SECRET` |
| Flexport | `/api/hooks/flexport` | `FLEXPORT_WEBHOOK_SECRET` |
| Fathom | `/api/hooks/fathom` | `FATHOM_WEBHOOK_SECRET` |
| Calendly | `/api/hooks/calendly` | `CALENDLY_WEBHOOK_SECRET` |

### Demand forecasting (PRD-12) — the only deploy step
The Python/Prophet sidecar is already built in `forecasting/` (FastAPI app +
Dockerfile + eval harness). Deploy the container (Fly.io / Render / Cloud Run),
then set `FORECAST_API_URL` (+ optional `FORECAST_API_TOKEN`). Until then
forecasts use the in-app heuristic stub. This is the one surface that needs a
container deployed rather than just an env var.

---

## Bucket D — optional hardening (not blockers)

- **Relational schema cutover** — `scripts/migrate.mjs` applies the SQL in
  `docs/schema/migrations/`. The current JSONB row-store is already durable;
  do this only when standing up the dedicated relational API tier.
- **Server-side retry queue** — webhook + fulfillment retries currently run
  in-process. Swap in BullMQ/QStash for at-scale durability.

---

## Verify

```bash
curl https://<deployment>/api/health        # per-service configured? booleans
npm run build                                # client build + prerender
node scripts/verify_orchestration.mjs        # 38 end-to-end runtime checks
```

Open `/admin/integrations` and click "Run a ping" on each row — green means
the real upstream answered.
