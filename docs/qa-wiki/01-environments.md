# 1. Environments & deployments

## URLs

| URL | What it is | Code | Notes |
|---|---|---|---|
| https://unitemedical.net → https://www.unitemedical.net | **Current production — Shopify store** | Shopify theme | Behind Cloudflare. Not this repo. Do not test here except to compare. |
| https://staging.unitemedical.net | **Unite 2.0 staging — the QA target** | `codex/role-ui-corrections-2026-10-28` @ `27e6919` (verified 2026-11-16 by UI strings unique to that commit in the live bundle) | Vercel project `unite-2-0-staging`, team `unite-medical`. `X-Robots-Tag: noindex`. `UNITE_ENVIRONMENT=staging`. |
| https://unite-2-0.vercel.app | Older Unite 2.0 build (Vercel project `unite-2-0`) | Pre-September source, rebuilt 2026-09-28 only to add analytics | Has a *different* integration set (HubSpot + Anthropic on, QBO off). Not the QA target. |
| https://tjs.unitemedical.net | TJS Patient Recovery Store — separate repo `Unite-Medical/tjs-project-2` (Next.js + Supabase) | `main` (Git-connected) | Out of scope for this wiki except the shared Damon admin account. |

## How code gets to staging

- Vercel Git integration for `Unite-Medical/unite_2_0` is **disconnected** (needs the Vercel GitHub App installed on the org — see `docs/deployments/vercel-team-transfer-2026-09-28.md`). Staging is deployed by **Vercel CLI/API** by whoever holds a Vercel token.
- `main` is 50 commits behind staging. Before launch, the latest branch must be reviewed/merged so `main` == what is deployed.
- Staging builds set `UNITE_PRIVATE_BUILD_INPUTS=1` and pull private snapshots (`build-inputs/` in Vercel Blob). A fresh public checkout builds with empty snapshots — fine for local dev, **not** representative data.

## Integrations live on staging (`GET /api/health`, 2026-11-16)

| Configured ✅ | Not configured ❌ |
|---|---|
| QuickBooks Online, Stripe (+webhook), ShipStation, Shopify Admin (+webhook), Resend email, Flexport, Postgres (Neon), MFA, openFDA, USITC HTS | Customer.io, HubSpot, Cin7, GS1, ImportGenius, Anthropic, Gmail, Google Calendar, Calendly, forecasting sidecar, ShipStation/Flexport/Fathom/Calendly webhooks, **verified shipping origin**, private document scanner, certificate extraction, owner operations digest |

## Side effects

Staging is not a sandbox. Treat these as **real-world actions** and only do them on designated TEST records with Alex/Damon's go-ahead:

| Action | Real effect on staging |
|---|---|
| Sales/Admin **Create order** (final submit) | Creates order + unpaid Finance invoice + accounting job and **attempts a QuickBooks Online invoice sync** (live company). "Save draft" is safe. |
| **Issue quote** | Can **email the customer** (Resend). Saving a quote draft is safe. |
| **Send supplier PO** | Can **email the supplier**. Saving a PO draft is safe. |
| Buy shipping label | Purchases a **ShipStation label** (real money). |
| Stripe payment / payment link | Uses whatever Stripe key is set (confirm test vs live mode before any checkout test). |
| Password reset / activation / MFA | Sends real email through Resend to the address entered. |
| Admin workspace reset / test-data / imports | Destructive to the staging workspace. Admin + MFA + exact staging origin only. |

## Local environment

```bash
nvm use 22      # Node 22+ (tested on 24)
npm ci
npm test        # 755 pass / 3 skipped on 27e6919
npm run lint
npm run build   # vite build + prerender 155 routes + connection check
npm run dev     # :5173 — API routes need `vercel dev` or VITE_DEV_API_TARGET pointing at a deployment
```

With no env vars the SPA runs on its local in-browser DB/stubs. To exercise real API routes locally you need `vercel env pull` from `unite-2-0-staging` (requires a Vercel token).
