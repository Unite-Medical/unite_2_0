# Unite Medical 2.0 — QA Wiki

The working wiki for QA'ing the Unite Medical 2.0 platform before go-live. It covers what the platform is supposed to do, every role, how to sign in as each one, role-by-role test scripts, and the go-live gates that are still open.

> **The repository is public.** Never put passwords, MFA setup keys or recovery codes, tokens, real customer names/addresses, prices, or screenshots with customer data into this wiki or into the repo. Credentials live in Vercel env vars and the Devin/1Password secret stores only.

## Pages

| # | Page | Use it for |
|---|---|---|
| 1 | [Environments & deployments](01-environments.md) | Which URL is which, what code each runs, which integrations are live |
| 2 | [Roles & permissions](02-roles-and-permissions.md) | Every role, what it can open, MFA rules, the route-by-role matrix |
| 3 | [Accounts & sign-in](03-accounts-and-sign-in.md) | Who has an account, how to get QA accounts for every role, MFA, role switching |
| 4 | [Public site test script](04-public-site.md) | Anonymous visitor journeys, SEO, redirects, quote/inquiry forms |
| 5 | [Customer & distributor test script](05-customer-and-distributor.md) | Register → approval → activation, pricing, cart, checkout, team, distributor portal |
| 6 | [Staff test scripts](06-staff-workflows.md) | Sales/Jacobe, Admin/Damon, Warehouse/Darren, Finance/Ashley, Sourcing, Customer service |
| 7 | [Integrations & secrets inventory](07-integrations-and-secrets.md) | Every env var, what it powers, current staging status, what Alex must supply |
| 8 | [Go-live gates & known issues](08-go-live-gates.md) | What is still blocking launch, decisions needed, risks |
| 9 | [Bug reporting & sign-off](09-bug-reporting.md) | How to log findings (in-app `/admin/testing` + template), severity, sign-off sheet |

## The platform in one paragraph

Unite Medical 2.0 (`Unite-Medical/unite_2_0`) is a React 19 + Vite SPA with Vercel serverless API routes (`api/`) on a Neon Postgres JSONB row-store (`um_rows`). It replaces the current Shopify store at `unitemedical.net` with: a public marketing site + catalog + quick quote; approved B2B customer accounts with contract pricing, cart/checkout, quick order/reorder, invoices, quotes and team management; a distributor/3PL consignment portal; and a staff workspace (`/work`) for sales, warehouse, finance, sourcing and admin with QuickBooks Online, Stripe, ShipStation, Shopify history, Resend email and AI assistant integrations.

## Where things stand (verified 2026-11-16)

- **Latest code** is branch `codex/role-ui-corrections-2026-10-28` (commit `27e6919`, 2026-10-27). It is **50 commits ahead of `main`** and has no PR — `main` stops at PR #9 (2026-09-27). The only open PR is draft #6 (`codex/catalog-quick-quote`).
- **Branches with work *not* in the latest branch:** `codex/unite-account-recovery-2026-10-23` (3 commits — authenticator replacement & audited lost-factor recovery), `codex/bi-agent-batches` (3), `codex/bi-data-pipeline` (2), `review/launch-simplification` (19, Sept — likely superseded). These need a keep/drop decision before launch.
- **`staging.unitemedical.net`** serves that latest code (verified 2026-11-16: the live JS bundle contains UI strings first added in `27e6919`, e.g. "Invoices to review", "Overdue balance", "Record payment evidence"). It is deployed by CLI, not Git.
- **`unitemedical.net` / `www`** is still the **Shopify** store. Nothing has cut over.
- Local baseline on the latest branch: `npm test` → **755 pass, 0 fail, 3 skipped**; `npm run lint` clean; `npm run build` + 155-route prerender OK.
- **Staging is wired to live providers** (QuickBooks Online, Stripe, ShipStation, Shopify Admin, Resend). Some actions create real records — see the ⚠️ markers in the test scripts and [Environments](01-environments.md#side-effects).

## Source documents this wiki was built from

`docs/operational-roles-2026-10-27.md` (newest role guide), `docs/GO_LIVE.md`, `docs/PRIVATE_RUNTIME_CONFIGURATION.md`, `docs/login-recovery-2026-09-28.md`, `docs/launch/clean-test-workspace-2026-09-23.md`, `docs/deployments/vercel-team-transfer-2026-09-28.md`, `docs/UNITE-PLATFORM-MAP.md` (June, partly stale), `docs/prds/PRD-00…33`, `src/App.jsx` (routes), `src/lib/staffWorkspace.js` (navigation), `src/lib/workflowReview.js` (in-app QA checklist), `api/_lib/mfa.js`, `api/admin/roles.js`, `api/auth/*`.
