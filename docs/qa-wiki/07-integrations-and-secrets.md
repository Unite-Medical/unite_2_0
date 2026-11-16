# 7. Integrations & secrets inventory

**No secret values are in this repo or in this wiki.** Values live in Vercel (team `unite-medical`, projects `unite-2-0-staging` and `unite-2-0`). Every integration runs a deterministic stub until its env vars exist (`.env.example`), and `/api/health` / `/admin/integrations` report only *configured: true/false*.

## What Devin could access on 2026-11-16

- Devin secret store: **empty** — no Vercel token, DB URL, provider keys or staff logins.
- Public `GET /api/health` on staging and `unite-2-0.vercel.app` (booleans only — table below).
- **One Vercel token with access to team `unite-medical` unlocks almost everything**: `vercel env pull` gives the full staging env for local runs, lets Devin read deploy history/commit, redeploy, and compare staging vs production env without anyone copy-pasting keys.

## Inventory

Status: ✅ configured · ❌ missing · — n/a. "Staging" = `staging.unitemedical.net`; "Prod proj" = `unite-2-0.vercel.app` (the future production project, currently old code).

| Area | Env vars | Powers | Staging | Prod proj | Needed for launch? |
|---|---|---|---|---|---|
| Core DB | `DATABASE_URL`, `DB_SYNC_TOKEN` | Neon row-store, all persistence | ✅ | ✅ | **Yes** — decide whether production gets its own Neon DB (recommended) or inherits staging |
| Sessions/security | `SESSION_SECRET`, `MFA_ENCRYPTION_KEY`, `QUOTE_LINK_SECRET`, `QUOTE_OTP_SECRET`, `VENDOR_PO_TOKEN_SECRET`, `CRON_SECRET` | Login, MFA, quote/PO signed links, cron | MFA ✅ (others not reported) | ? | **Yes** — generate fresh values for production; never reuse staging |
| Staff identities | `UNITE_JACOBE_EMAIL`, `UNITE_ASHLEY_EMAIL`, `UNITE_DARREN_EMAIL`, `UNITE_INQUIRY_FROM` | Named approval/release routing, inquiry notifications | ? | ? | **Yes** |
| Email | `RESEND_API_KEY` (fallback), `CUSTOMERIO_*` (primary lifecycle) | Activation, reset, quotes, POs, notifications | Resend ✅ / Customer.io ❌ | Resend ✅ | Resend is enough to launch; sending domain must be verified in Resend |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`/`VITE_` | Card checkout, payment links | ✅ (+webhook) | ✅ | **Yes** — confirm test vs live key per env |
| Accounting | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REALM_ID`, `QBO_REFRESH_TOKEN`, `QBO_ENVIRONMENT`, `QBO_INVENTORY_ASSET_ACCOUNT_ID` | Invoice/payment sync, AR aging | ✅ | ❌ | **Yes** — OAuth consent via `/api/auth/qbo/connect` on prod |
| Shipping | `SHIPSTATION_API_KEY`, `SHIPSTATION_API_SECRET`, `SHIPSTATION_WEBHOOK_SECRET` + verified shipping origin | Rates, labels, tracking | API ✅ / webhook ❌ / **verified origin ❌** | API ✅ / webhook ✅ | **Yes** — verified origin address is required for correct rates |
| Shopify | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`/`SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_API_VERSION`, storefront tokens | Order/customer history import & catch-up | ✅ (+webhook) | ✅ | Yes until cutover is complete |
| Freight/customs | `FLEXPORT_API_KEY`, `FLEXPORT_WEBHOOK_SECRET` | Landed cost, customs status | ✅ / webhook ❌ | ✅ | Optional |
| AI | `ANTHROPIC_API_KEY` | Column mapping, classification, digests, assistant | ❌ | ✅ | Decide — several admin "AI" helpers stub without it |
| CRM | `HUBSPOT_PRIVATE_APP_TOKEN` | Rep pipeline | ❌ | ✅ | Optional |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | Gmail triage, calendar mirror | ❌ | ❌ | Optional |
| Scheduling | `CALENDLY_API_KEY`, `CALENDLY_WEBHOOK_SECRET` | Demo booking | ❌ | ❌ | Optional |
| Calls | `FATHOM_WEBHOOK_SECRET` | Call → action items | ❌ | ❌ | Optional |
| Inventory/GTIN/trade | `CIN7_*`, `GS1_*`, `IMPORTGENIUS_API_KEY` | WMS sync, GTIN validation, vendor discovery | ❌ | ❌ | Optional (native WMS in-app) |
| Forecasting | `FORECAST_API_URL`, `FORECAST_API_TOKEN` | Prophet sidecar (separate service) | ❌ | ❌ | Optional |
| Private runtime | `BLOB_READ_WRITE_TOKEN`, `UNITE_PRIVATE_BUILD_INPUTS`, `WELLLINK_SOURCE_JSON`, `DOCUMENT_SCAN_TOKEN`, `RESTORE_*` | Private catalog/data snapshots, doc scanner, Restore Robotics sync | Blob ✅ (build works) / scanner ❌ / cert extraction ❌ | ? | Yes for real catalog data |
| Staging only | `STAGING_SETUP_TOKEN`, `UNITE_ENVIRONMENT=staging` | Staging import / Damon activation (`api/internal/staging-setup.js`) | ✅ | must be **absent** | Must not exist in production |
| Analytics/SEO | `VITE_UNITE_POSTHOG_*`, GA4 vars, `GOOGLE_SITE_VERIFICATION` | Analytics, Search Console | ? | ✅ (PostHog set 09-28) | Yes at cutover |

`?` = not reported by `/api/health`; confirm via `vercel env ls`.

## What Alex needs to get for Devin (minimum, in priority order)

1. **Vercel access token** (team `unite-medical`) — store as a Devin secret. Replaces asking for individual provider keys.
2. **QA accounts on staging** — see [Accounts](03-accounts-and-sign-in.md#getting-qa-accounts). Either real-person logins shared via secret store, or approval for Devin to provision `+qa` test staff/customer accounts directly in the staging DB (needs `DATABASE_URL`, which the Vercel token provides).
3. **A test mailbox** Devin can read (e.g. `qa@unitemedical.net` or a Google group alias) for activation, reset, quote and PO emails.
4. **Rules of engagement on live side effects**: is staging Stripe test-mode? Is the staging QBO company the real books or a sandbox? May Devin submit TEST orders that sync to QBO? Buy a $0/void-able label?
5. Provider-side items only a human can do: ShipStation verified ship-from address, QBO OAuth on production, Resend domain verification for production sender, webhook registration on production URLs.
