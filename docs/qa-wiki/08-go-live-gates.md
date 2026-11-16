# 8. Go-live gates & known issues

Status legend: 🔴 blocking launch · 🟠 needs decision · 🟢 done/verified. Last reviewed 2026-11-16.

## A. Code & deployment

| # | Gate | Status | Notes |
|---|---|---|---|
| A1 | Latest code (`codex/role-ui-corrections-2026-10-28`, 50 commits) reviewed and merged to `main` | 🔴 | No PR exists. `main` is what any future Git-connected deploy would ship. |
| A2 | Decide on unmerged branches | 🟠 | `codex/unite-account-recovery-2026-10-23` (authenticator replacement, lost-factor recovery, QR-first MFA enrollment, bound reset tokens) — **strongly recommended before launch** since 5 staff roles require MFA and there is otherwise no self-service way back from a lost phone. `codex/bi-agent-batches`, `codex/bi-data-pipeline` (QBO aging fixes), `review/launch-simplification` (Sept, likely superseded). Draft PR #6 (`codex/catalog-quick-quote`). |
| A3 | Reconnect Vercel ↔ GitHub (install Vercel GitHub App on `Unite-Medical`) | 🟠 | Today deploys are manual CLI. |
| A4 | Production Vercel project `unite-2-0` runs the **old** build with a different env set | 🔴 | Deploy latest to prod project; align env (QBO missing there; prod needs its own secrets/DB). |
| A5 | Automated checks | 🟢 | 755 pass / 3 skip, lint clean, build + prerender OK (2026-11-16). |
| A6 | Bundle size | 🟠 | Build warns on > 500 kB chunks (barcode, warehouse, Excel, HCPCS, PDF libraries). Check mobile load of `/warehouse` and catalog. |

## B. People & access

| # | Gate | Status | Notes |
|---|---|---|---|
| B1 | Damon, Jacobe, Darren, Ashley each sign in on their own account + MFA where required | 🔴 | Historical identities verified; **fresh session acceptance pending** per 10-27 role guide. |
| B2 | Role boundaries verified (UI + API) for every role | 🔴 | [Roles](02-roles-and-permissions.md#role-boundary-test-checklist). |
| B3 | Second admin exists | 🟠 | An admin can't change their own roles; with only Damon as admin, nobody can fix his roles or recover his access. |
| B4 | Sourcing role has no tools outside Admin | 🟠 | Decide: grant `/admin/sourcing` to sourcing roles, or drop the roles for launch. |
| B5 | Customer activation plan for migrated Shopify customers | 🔴 | Who gets activation emails, when, and with what message. |

## C. Data

| # | Gate | Status | Notes |
|---|---|---|---|
| C1 | Customers / orders / inventory / balances reconciled vs Shopify + QBO (`/admin/launch`) | 🔴 | Staging was a scoped clean import (`docs/launch/clean-test-workspace-2026-09-23.md`). |
| C2 | Catalog completeness | 🟠 | 118 products in current private snapshot vs. the real Shopify SKU count (open question in `docs/ALEX_THINGS.md` §1). |
| C3 | Production database separate from staging, with backups | 🟠 | |
| C4 | Remove/flag TEST records before launch | 🔴 | Use `/admin/test-data` on staging; production should start clean. |

## D. Integrations

| # | Gate | Status | Notes |
|---|---|---|---|
| D1 | Verified ShipStation ship-from origin | 🔴 | `/api/health` → not configured; rates/labels may be wrong. |
| D2 | Stripe mode per environment; sales-tax tooling decision (Stripe Tax?) | 🟠 | `docs/ALEX_ACTIONS.md` → Sales tax. |
| D3 | QBO on production (OAuth consent) + no duplicate invoices | 🔴 | |
| D4 | Webhooks registered against production URLs (Stripe, Shopify, ShipStation) | 🔴 | ShipStation webhook reports not configured on staging. |
| D5 | Anthropic key — decide if AI helpers are in launch scope | 🟠 | Off on staging, on in old prod project. |
| D6 | Owner operations digest, private document scanner, certificate extraction | 🟠 | Not configured on staging. |

## E. Website cutover

| # | Gate | Status | Notes |
|---|---|---|---|
| E1 | Content & legal sign-off (PUB-03/04) | 🔴 | Open items in `docs/ALEX_THINGS.md`: SKU count, warehouse sq ft, partner logos, coverage map, compliance badge, blog content (Jill), document-request buttons. |
| E2 | Shopify URL redirects cover top-traffic URLs | 🟠 | Pull top 200 URLs from Shopify/GA and test each (PUB-14). |
| E3 | DNS: point `unitemedical.net` + `www` to Vercel (via Cloudflare) | 🔴 | Last step. Keep Shopify running read-only for rollback. |
| E4 | Production must be indexable; staging stays `noindex`; submit sitemap in Search Console | 🔴 | |
| E5 | Analytics (PostHog / GA4) live on production only | 🟠 | |

## F. Business decisions still open

From `docs/ALEX_ACTIONS.md`: margin policy per tier, quote validity (default 14 days), customer-facing margin disclosure, vendor scoring, high-watch countries, Class III policy, rep commissions & reassignment, self-serve quote gating, call-recording consent / privacy policy, data retention, surplus offer % and pickup logistics, warehouse scanner hardware.

## Rollback plan (to fill in before E3)

1. Keep Shopify store live and unchanged until 7 days after cutover.
2. DNS TTL lowered to 300 s 24 h before cutover.
3. Rollback = point DNS back to Shopify; Vercel production deploy stays for diagnosis.
