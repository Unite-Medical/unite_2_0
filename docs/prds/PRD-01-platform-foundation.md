# PRD-01 — Platform Foundation

**Source:** CTO Brief §10 "Core Platform Technology Recommendations"
**Owner:** Alex (CTO)
**Status:** draft
**Repo:** `unite_2_0` (this app) + new `unite-api` repo (TBD)
**Depends on:** nothing
**Blocks:** PRD-02 through PRD-14

> Every other PRD assumes there is a real database, a real API surface,
> and real authentication. Today there is `localStorage` + a reactive
> in-browser DB + a mocked auth. This PRD makes the platform real.

---

## 1. North star

A new feature in any downstream PRD can be implemented as a single
backend service that reads/writes Postgres, exposes a typed HTTP API,
authenticates against a managed Auth provider, and is observable in
production. **No more "search-and-replace migration from localStorage."**

---

## 2. Scope

### In scope

- Pick the runtime, DB, auth, hosting, and migration tool — and write
  them down so all other PRDs can stop hedging.
- Stand up the empty backend with one health check, one auth-protected
  route, and one Postgres-backed CRUD resource (`vendors`, the simplest
  table) end-to-end.
- Migration framework + the first migration that creates `vendors`
  and `audit_log`.
- CI: lint, typecheck, test, migrate, deploy.
- Secrets management.
- Observability baseline (logs + error tracking; metrics later).
- Replace `src/lib/db.js` with a thin client that talks to the new API
  for the `vendors` table only, keeping all other tables on
  localStorage as a transitional shim. Subsequent PRDs migrate tables
  one at a time.

### Out of scope

- Any business feature beyond the `vendors` smoke-test resource
- Multi-tenant data isolation (current scope: single Unite Medical
  tenant; revisit if marketplace surplus PRD-10 demands it)
- Real-time / pub-sub (file under "future" — current app uses polling
  and is fine)

---

## 3. Decisions to make (this PRD resolves them)

| Decision | Recommendation | Reason |
|---|---|---|
| Runtime | **Node.js 20 + TypeScript + Fastify** | API-heavy workload, biggest hiring pool, lowest cold-start on Vercel/Fly. Python sidecar only for forecasting (PRD-12). |
| ORM | **Drizzle** | Typescript-native, no codegen step, raw SQL escape hatch when we need it. Prisma is fine too; pick once. |
| Database | **Postgres on Neon** | Serverless, scales to zero, generous free tier, real Postgres (not Aurora-like dialect). Supabase is the alternative if we also want auth+storage from them — see Auth row. |
| Migrations | **drizzle-kit** | Native to ORM choice; SQL output committed under `docs/schema/migrations/`. |
| Auth | **Clerk** | Faster to ship than Auth0, has B2B "organizations" + role-based access out of the box (matches brief §10 "rep, dealer, hospital, admin"). Easy webhook to mirror users into our DB. |
| Hosting (API) | **Fly.io** (primary) or **Vercel Functions** (if everything stays sub-30s and Node) | Fly gives long-running processes (useful for forecasting + Fathom webhooks). |
| Hosting (web) | **Vercel** (unchanged) | Already configured; PRD-13 decides SSR. |
| Object storage | **Cloudflare R2** | S3-compatible, zero egress, cheaper than S3/GCS for image-heavy product catalog. |
| Secrets | **Doppler** or 1Password Service Accounts | Either is fine; avoid raw `.env` in prod. |
| Logs | **Better Stack** (Logtail) | Cheap, JSON ingestion, Slack alerts. |
| Errors | **Sentry** | Standard. |
| Email send | **Resend** | Modern API, deliverability, simple React templates. Gmail (PRD-05) is for reading the team's inboxes, not for transactional. |

Each row above is a single yes/no decision. Damon should sign off on
the column before Phase 1 starts.

---

## 4. Architecture sketch

```
┌─────────────────────────────────────────────────────────────────┐
│                 unitemedical.net (Vercel)                       │
│   - public marketing pages (SSR per PRD-13, eventually)         │
│   - /catalog, /products/* (Shopify Storefront API for v1)       │
│   - /portal/* (auth-gated B2B portal, PRD-14)                   │
│   - /admin/* (auth-gated internal ops)                          │
│   calls →                                                       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│           api.unitemedical.net (Fly.io · Node + Fastify)        │
│                                                                 │
│   - REST resources:  /vendors  /quotes  /orders  /...           │
│   - Webhook receivers: /hooks/{stripe,flexport,fathom,...}      │
│   - Background workers (BullMQ on Upstash Redis) for:           │
│       · webhook replay                                          │
│       · daily ledger sync (QBO, Flexport, etc.)                 │
│       · AI digest generation                                    │
│   - Outbound to: QBO · Flexport · Stripe · HubSpot · openFDA ·  │
│     USITC · GS1 · ImportGenius · ShipStation · Cin7 · Claude    │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
   ┌──────────────────┐  ┌────────────────────┐  ┌──────────────┐
   │  Postgres (Neon) │  │  Redis (Upstash)   │  │  R2 (objects)│
   └──────────────────┘  └────────────────────┘  └──────────────┘
                            │
                            ▼
                  ┌──────────────────────┐
                  │  forecasting sidecar │  ◀── PRD-12
                  │  (Python · FastAPI)  │
                  └──────────────────────┘
```

---

## 5. Phases

### Phase 1 — Repo, runtime, deploy pipeline

- Create `unite-api` repo (or `apps/api` in a monorepo — pick one in
  Phase 1)
- Fastify + TypeScript + Drizzle scaffold
- One route: `GET /health` → `200 {ok:true, sha, started_at}`
- GitHub Actions: lint → typecheck → test → build → deploy to Fly.io
  on `main`
- Sentry + Logtail wired
- All secrets in Doppler; nothing in repo

**Exit:** `curl https://api.unitemedical.net/health` returns 200 from
prod, build/deploy is green on `main`.

### Phase 2 — Postgres + first migration

- `vendors` and `audit_log` tables (shape mirrors `src/lib/db.js` so
  the migration from localStorage is mechanical)
- `drizzle-kit generate` → SQL committed to `docs/schema/migrations/`
- Migration runs in CI before deploy
- Seed script loads ~10 vendors so the API has something to return

**Exit:** Migrations apply cleanly to a fresh DB. `drizzle-kit
check` is green.

### Phase 3 — Auth

- Clerk app provisioned (production + preview)
- Frontend: replace `src/lib/auth.js` calls with Clerk's React SDK
- Backend: validate Clerk session JWTs on every protected route
- Webhook `user.created` → upsert into our `profiles` table
- Role-based access: `admin` / `rep` / `customer` / `dealer` (matches
  brief §10)
- The existing `RequireAdmin` component swaps to Clerk's `Protect`
  with `role:admin`

**Exit:** Logging into the current `/admin` works against Clerk; the
local mock is deleted.

### Phase 4 — End-to-end vendor CRUD

- API: `GET/POST/PATCH/DELETE /vendors` with Zod validation, auth
  required, audit log on every write
- Frontend: `src/pages/admin/AdminVendorApproval.jsx` reads/writes via
  the API instead of `db.list('vendors', ...)`
- The rest of the app still uses `db.js` (localStorage); the migration
  per-table happens in subsequent PRDs.

**Exit:** Vendors persist across browsers / devices / logouts. Audit
log shows the change history.

### Phase 5 — Observability + runbooks

- Sentry alerts wired to a Slack channel
- One synthetic uptime check on `/health` (Better Stack)
- `docs/runbooks/oncall.md` covering: deploy rollback, DB restore,
  rotating Clerk + DB secrets
- Backup policy: Neon's PITR is on; verify by restoring a snapshot to
  a scratch branch monthly

**Exit:** First synthetic + a deliberate test exception both produce
the expected Slack alert.

---

## 6. Open questions

1. **Monorepo or separate repos?** Recommend monorepo with pnpm
   workspaces (`apps/web`, `apps/api`, `packages/shared`). Lets us
   share TypeScript types of every API response across both sides.
2. **Do we keep the in-browser `db.js` as a *transitional* shim** or
   rip it out per-table as each PRD migrates? Recommend keep the
   shim — it lets downstream PRDs migrate one table at a time without
   breaking the demo.
3. **Tenant isolation**: just one Unite Medical tenant for now, or
   design for multi-tenant from day one to enable a future "private
   surplus marketplace" (brief §8)? Recommend single-tenant + a
   `tenant_id` nullable column we ignore until needed.
4. **Anthropic API key handling**: store in Doppler, expose to API
   via env, never to the browser. Confirm.

---

## 7. Out-of-band

- Clerk account + Pro plan ($25/mo) for organizations + custom domains
- Neon account + production project
- Fly.io org + Postgres-adjacent region (e.g., `iad`)
- Cloudflare R2 bucket + API token
- Doppler / 1Password Service Accounts setup
- Domain DNS: `api.unitemedical.net` CNAME → Fly.io edge
- New environment variables (in Vercel + Doppler):
  - `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`
  - `DATABASE_URL` (Neon)
  - `REDIS_URL` (Upstash)
  - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
  - `SENTRY_DSN`
  - `LOGTAIL_TOKEN`

---

## 8. Definition of done

- All 5 phases shipped
- A net-new engineer can clone, `pnpm install`, `pnpm dev`, and have
  the full stack running locally against a Neon branch DB within 30
  minutes (timed onboarding test)
- The 6 decisions in §3 are committed (no longer "recommendations")
- Subsequent PRDs (02+) can start without re-deciding any of those
