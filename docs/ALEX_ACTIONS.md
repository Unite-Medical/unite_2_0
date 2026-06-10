# Alex / Damon — Master Action List

> Everything that needs a human to do something outside of code.
> If it's on this list, the code can't move forward without it.
> If it's not on this list, the code is on me.

Last updated: 2026-05-27 by the agent loop. Use this as a working
checklist; tick items off as you finish them and note the date.

Companion docs:

- `docs/PRD.md` — the original site-rebuild PRD (Phase 0)
- `docs/prds/` — the back-end / platform PRD set (PRD-00 through PRD-14)
- `docs/ALEX_THINGS.md` — the older, narrower action list for Phase 0;
  still valid for the marketing-site assets

---

## 🔥 Block-everything decisions (do these first)

These six decisions in PRD-01 §3 gate every other PRD. The
recommendations are mine; you say yes/no.

| Decision | Recommendation | Why |
|---|---|---|
| Backend runtime | **Node.js 20 + TypeScript + Fastify** | API-heavy workload; biggest hiring pool; Python only as sidecar for forecasting (PRD-12) |
| ORM | **Drizzle** | TS-native, raw SQL escape hatch |
| Database | **Postgres on Neon** | Serverless, scales to zero, real Postgres |
| Auth | **Clerk** | Faster than Auth0, has B2B "organizations" + roles |
| Hosting (API) | **Fly.io** primary | Long-running workers needed for webhooks + forecasting |
| Secrets | **Doppler** | Either Doppler or 1Password Service Accounts |

→ Tell me **"go" or "change X to Y"** and PRD-01 can start.

Two more decisions that aren't blocking but should be made early:

| Decision | Recommendation | Where |
|---|---|---|
| SSR path | **Path A: Migrate to Next.js** (vs. Path B prerender Vite) | PRD-13 |
| Shopify role | **Headless commerce engine for v1** (vs. full replacement) | PRD-04 §2 |

---

## 🪪 Accounts to provision (with rough costs)

Group by priority. Once provisioned, drop the API keys into Doppler
(or whatever we land on) and notify me.

### Tier 1 — needed for PRD-01 (Platform Foundation)

| Service | Cost | Notes |
|---|---|---|
| **Clerk** | Pro plan ~$25/mo + per-user | Need: production + preview environments. Custom domain on `unitemedical.net/sign-in` |
| **Neon** | Free tier covers dev; ~$19/mo prod | Pick region `us-east-2` or `us-east-1` (Atlanta latency) |
| **Fly.io** | Pay-as-you-go (~$5-30/mo for one app + Postgres-adjacent region) | Create org `unite-medical`, deploy region `iad` |
| **Cloudflare R2** | Free tier covers 10GB/mo; ~$0.015/GB after | One bucket: `unite-medical-prod` |
| **Doppler** | Free for team < 5 | Or 1Password Service Accounts if you prefer |
| **Sentry** | Team plan $26/mo | One project: `unite-medical` |
| **Better Stack** (Logtail) | Free tier covers low volume | One source: `unite-medical-api` |
| **Resend** | Free for 100/day; ~$20/mo prod | Verify `unitemedical.net` domain (SPF/DKIM/DMARC) |
| **Upstash Redis** | Pay-per-request; ~$0-10/mo | For BullMQ background jobs |

### Tier 2 — integrations (one per PRD)

| Service | PRD | Cost | Notes |
|---|---|---|---|
| **Intuit Developer** + QBO subscription | PRD-02 | QBO Essentials $35/mo or Plus $65/mo | Create app, get production OAuth credentials. CFO needs sandbox + prod company file |
| **Flexport API access** | PRD-03 | Account-required; CSM enables | Email your Flexport rep; ask for Public API tier |
| **Cin7 Core** | PRD-04 | ~$349-799/mo depending on tier | Onboarding team will help with data migration |
| **Fathom** | PRD-05 | $19-29/user/mo | Team plan; one seat per rep |
| **Google Workspace** OAuth admin | PRD-05 | Existing | You're admin; grant Gmail.readonly + Calendar.readonly scopes |
| **Calendly** Pro | PRD-05 | $12/user/mo | Need API access tier |
| **HubSpot Sales Hub** | PRD-06 | Pro $90/seat/mo or Enterprise $150/seat/mo | Confirm seat count for 1099 reps |
| **openFDA API key** | PRD-07 | **FREE** | Request from open.fda.gov/apis/authentication; only needed for higher rate limits, not for basic use |
| **GS1 US Data Hub** | PRD-07 | ~$500/yr+ | Already on if Unite is registered with GS1 |
| **ImportGenius Enterprise** | PRD-08 | $899/user/mo | One shared user for v1 to test ROI |
| **USITC HTS** | PRD-08 | **FREE** | Account at hts.usitc.gov |
| **Stripe** Connect + Billing | PRD-09 | Pay-per-transaction | You should already have Stripe; just need Connect application approval (federal EIN, etc.) |
| **ShipStation** API key | PRD-04 | Existing subscription | Currently mediated via Shopify plugin — get the direct API key |
| **Anthropic** API key | PRD-11 | Per-token (~$0.003 per 1k input tokens for Sonnet) | Set hard budget cap in their dashboard |

### Tier 3 — site/SEO

| Service | PRD | Cost | Notes |
|---|---|---|---|
| **Vercel** Next.js project | PRD-13 | Free for Hobby, $20/mo Pro | Already exists; just enable Next.js framework when migrating |
| **Google Search Console** | PRD-13 | Free | Verify `unitemedical.net` ownership; monitor PDAC rank weekly |
| **WebPageTest API** | PRD-13 | Free tier sufficient | Optional, useful for performance budgets |

**Estimated total monthly burn at full deployment: ~$2,500-3,500/mo**
(varies most with HubSpot seat count + ImportGenius). Decommissioning
the 8 Shopify apps in PRD-04 claws back ~$60/mo.

---

## 🌐 DNS / domain changes

| Record | Value | When | Notes |
|---|---|---|---|
| `api.unitemedical.net` CNAME | Fly.io edge | PRD-01 Phase 1 | For the API |
| `forecasting.unitemedical.net` CNAME | Fly.io edge | PRD-12 Phase 1 | Optional; can live behind the API |
| SPF / DKIM / DMARC for `unitemedical.net` | Resend's records | PRD-01 Phase 1 | For transactional email |
| (If migrating to Next.js) update Vercel project to use Next.js framework | — | PRD-13 Phase 1 | One-click in Vercel UI |

---

## 📥 One-time data migrations

| What | From | To | Owned by | When |
|---|---|---|---|---|
| Accounting | QuickBooks Desktop | QuickBooks Online | CFO (Intuit's conversion tool or accountant) | PRD-02 Phase 1 |
| Inventory + POs | Shopify PO features | Cin7 Core | Warehouse Lead + Cin7 onboarding team | PRD-04 Phase 1 |
| Customers + auth | Shopify customer records | Postgres + Clerk | Me + you (password reset blast to existing customers) | PRD-14 Phase 1 |
| Vendor list | Damon's notes / spreadsheets | `vendors` table | Damon | PRD-07 Phase 1 |

---

## 🧠 Business decisions I need from Damon

These don't block code immediately but they will. Get them on paper
so we can move when each PRD reaches the relevant phase.

### Pricing & margin

- [ ] **Margin policy per customer tier** (PRD-08 §5). Defaults I put in:

  | Tier | Default margin |
  |---|---|
  | A (large hospital, gov, retail) | 30% |
  | B (mid ASC, dealer) | 50% |
  | C (small clinic, one-off) | 60% |
  | Distributor | 25% |

  Tell me which to keep, change, or split further (e.g., per category).

- [ ] **Quote validity period** (PRD-08 §11). Default: 14 days.
  Flexport rates often expire in 7. Confirm.

- [ ] **Customer-facing margin disclosure** (PRD-08 §11). Default: no
  (customer sees sell price only; rep sees full breakdown). Confirm.

### Vendor approval

- [ ] **Vendor scoring weights** (PRD-07 §4). I have defaults; please
  review and override anything that feels off, especially around
  Class III devices and high-watch countries.
- [ ] **High-watch country list** (PRD-07 §10.2). Right now any
  first-time country goes to manual review. Want a stricter list
  (e.g., always-manual-review for specific countries)?
- [ ] **Class III device policy** (PRD-07 §10.1). Default: AUTO_REJECT
  for v1. Confirm or override.

### Sales & ops

- [ ] **Rep commission structure** (PRD-06 §7.3). Flat % per rep, or
  tiered by segment/product? Default: flat %.
- [ ] **Account-rep reassignment policy** (PRD-06 §7.4). What happens
  to old rep's open deals when an account changes hands? Default:
  stays with old rep.
- [ ] **ZoomInfo decision** (PRD-06 §7.1). Brief recommends 90-day
  parallel test vs. openFDA + ImportGenius. Run it or kill it now?
- [ ] **Auto-pause exceptions** (PRD-09 §9.4). Which top accounts get
  `never_pause = true`? (CVS, etc.) Confirm list when it matters.

### Sales tax

- [ ] **Sales tax tooling** (PRD-09 §9.1). Stripe Tax (recommended)
  vs. QBO built-in vs. Avalara. CFO + you decide.

### Surplus inventory

- [ ] **Default surplus offer % of retail** (PRD-10 §9.1). Default
  35% for "new in box" Class II.
- [ ] **Surplus pickup logistics** (PRD-10 §9.2). LTL contract vs.
  customer-ships. Default: contracted LTL.

### Quoting customer self-serve

- [ ] **Self-serve quote gating** (PRD-08 §11.5). Which customer
  segments get self-serve access? Default: A-tier + approved
  distributors only.

### Compliance + legal

- [ ] **Call recording consent / privacy policy update** (PRD-05
  §8.1). Fathom does in-call consent; we also need to add a line to
  `/privacy`. Will draft when you OK.
- [ ] **Data retention policy** (PRD-05 §8.2, PRD-11 §11.3). My
  defaults: transcripts 3yr (closed deals) / indefinite (open);
  AI inputs 30 days; full audit log indefinite. OK?

---

## 🤝 People to coordinate with

| Who | What | When |
|---|---|---|
| **CFO** | QBO Desktop → QBO Online migration + 30-day parallel run | PRD-02 Phases 1, 6 |
| **VP Sales** | HubSpot rep pipeline review + 1099 onboarding plan | PRD-06 Phase 3 |
| **Warehouse Lead** | Cin7 onboarding + receiving workflow runbook | PRD-04 |
| **Jill** | Blog content (still outstanding from ALEX_THINGS #6) | PRD-13 |
| **Damon** | Vendor scoring sign-off + recall-policy SLA + capability-statement copy | PRD-07, PRD-10 |
| **Flexport CSM** | API tier upgrade | PRD-03 Phase 1 |
| **Cin7 onboarding team** | Data import | PRD-04 Phase 1 |
| **Designer** | Coverage map redraw (2 dots, not 4); compliance shield/badge graphic | PRD-13 + PRD-08 |
| **Legal** | Capability statement, BAA template, privacy policy update | PRD-07, PRD-05 |

---

## 🎨 Assets to source (no code blocked, but visible gaps)

Carried over from `docs/ALEX_THINGS.md` and the PRDs:

- [ ] **8 partner logos** — Ardent Health, Restore Robotics,
  Amazon Fresh, WellLink, The Resource Group, Orlando Health,
  UF Health, Total Joint Specialists (see `docs/partner-logos-spec.md`)
- [ ] **Coverage map** — redraw with 2 dots (Georgia + Nevada);
  no Dallas, no separate Atlanta dot
- [ ] **Compliance shield/badge graphic** — 4 categories: FDA Status,
  Quality System, Product Testing, Certifications (PRD-08 §6)
- [ ] **Real warehouse sqft** for Lithia Springs + Nevada
- [ ] **Real Shopify SKU count** for hero + locations widgets
  (or wire to Shopify Admin API once we have a backend — PRD-04)

---

## 🛠️ Hardware

- [ ] **Warehouse scanners** for PRD-04 Phase 4. Zebra TC22 or
  equivalent, ~$700/unit, one per warehouse (so 2 total). Or
  configure Cin7's mobile app on existing staff phones — confirm
  during Cin7 Phase 1.

---

## ✅ Done

| Date | Item |
|---|---|
| 2026-05-27 | Audit against CTO brief (15 findings catalogued) |
| 2026-05-27 | 15 PRDs drafted at `docs/prds/` |
| 2026-05-27 | PRD-00 fully executed: Dallas warehouse removed; `.com` → `.net`; admin tooling-name leaks sanitized; verifier hardened with 4 new forbidden patterns |
| 2026-05-27 | SDVOSB phrasing locked in: "via authorized SDVOSB partner" stays (not a self-claim) |
| 2026-05-27 | **PRD-07 Phase 1 shipped**: real openFDA REST client at `src/lib/external/openfda.js` (free API, browser-CORS-OK), with offline fallback table. Replaces the hardcoded 4-code stub. |
| 2026-05-27 | **PRD-07 Phase 2 shipped**: vendor scoring engine at `src/lib/vendorScoring.js`; the admin vendor-approval page (`/admin/vendors`) now renders real decisions, weighted components, and AUTO_REJECT logic against live openFDA data. |
| 2026-05-27 | **PRD-08 Phase 2 shipped**: USITC HTS client at `src/lib/external/hts.js` with backend-proxy hook + offline fallback rate table. |
| 2026-05-27 | **PRD-08 Phase 5 shipped**: quote print view at `/quotes/:id/print`. Two views — customer + internal-with-landed-cost. Browser print-to-PDF works today; swap to server-side PDF when backend lands. |
| 2026-05-27 | **PRD-10 Phase 1 shipped**: public `/surplus` intake page with line-item form, AI categorization wired through the prompt registry. |
| 2026-05-27 | **PRD-11 Phase 1 shipped**: prompt registry at `prompts/` (9 prompts authored), `@unite/ai` client at `src/lib/ai/client.js`, `ai_usage` tracking table. Stubs work today; flip on by setting `ANTHROPIC_API_KEY` server-side. |
| 2026-05-27 | **PRD-12 Phase 1 shipped**: Python forecasting sidecar scaffolded at `forecasting/` — FastAPI + Prophet, Postgres-ready, Docker-ready, eval harness included. |
| 2026-05-27 | **Schema migrations**: 14 idempotent SQL migrations at `docs/schema/migrations/` covering every PRD's tables (core, catalog, inventory, orders, finance, quotes, vendors, CRM, logistics, ai_usage, b2b portal, surplus, forecast, gmail/digests). |
| 2026-05-27 | **PRD verifier**: `scripts/prd_check.py` validates the structural commitments of PRD-07, PRD-08, PRD-10, PRD-11 (PASS). |
| 2026-05-27 | All 16 PRDs have either shipped Phase 1 or are unblocked on account-provisioning. |
| 2026-05-27 | **External clients wired for all 7 paid integrations** (QBO, Flexport, Cin7, ShipStation, HubSpot, Stripe, GS1) at `src/lib/external/`. Real endpoints, real auth shape, env-gated stub fallback so the demo runs today and flips to real upstream the moment env vars land. |
| 2026-05-27 | **PRD-11 Phase 2 shipped**: Anthropic strict tool-use with JSON Schema validators at `src/lib/ai/schemas.js` (9 schemas across fathom/digest/vendor/quoting/surplus). Schema violations alert via the AI usage table. |
| 2026-05-27 | **PRD-05 Phase 1-3 ready**: Fathom webhook handler with end-to-end AI extraction → HubSpot task push at `src/lib/external/fathom.js`. Server-side route ships when PRD-01 lands. |
| 2026-05-27 | **PRD-01 admin scaffold**: `/admin/integrations` (status of every external service + "Run a ping" buttons) and `/admin/integrations/ai` (per-prompt cost/latency/error dashboard). |
| 2026-05-27 | **PRD-07 Phase 3 shipped**: `/admin/products/onboard` — GUDID pre-validation form running real GS1 mod-10 + openFDA + USITC checks before opening the FDA portal. |
| 2026-05-27 | **PRD-08 Phase 1+4+7 shipped**: `/quote/new` CSV/XLSX vendor-sheet upload + parser; `/admin/settings/margin` tier-margin editor; full flow lands on the print-PDF view. |
| 2026-05-27 | **PRD-10 Phase 2 shipped**: `/admin/surplus` review pipeline — list submissions, run AI valuation, adjust per-line offers, send offer email. |
| 2026-05-27 | **PRD verifier extended**: `scripts/prd_check.py` now validates PRD-02/03/04/05/06/08b/09/10b structural commitments (12 PRDs total, all PASS). |
| 2026-06-10 | **Brief success criterion #2 shipped**: inbound receiving pipeline at `src/lib/receiving.js` — freight webhook `cleared` → inventory receive → landed-cost bill to the books → run-rate reorder recalc, fully chained. Demo trigger on `/admin/replenishment`. |
| 2026-06-10 | **PRD-12 client-side model shipped**: run-rate replenishment engine at `src/lib/replenishment.js` (trailing-90d demand → reorder points → one-click vendor PO drafting) + `/admin/replenishment`. Prophet sidecar swaps in behind the same interface. |
| 2026-06-10 | **PRD-05 Phase 5 shipped**: CEO morning brief at `/admin/digest` — `src/lib/digest.js` reads live orders/AR/inventory/freight/CRM/compliance, ranks 5 bullets with deep links. Heuristic engine today; Claude writes it once the API key lands. |
| 2026-06-10 | **CFO dashboard shipped** (brief §5): `/admin/finance` — AR aging buckets, one-click payment recording (synced to the accounting client), one-click reminder emails. No more order-notifications-in-inboxes. |
| 2026-06-10 | **Brief §7 shipped**: trade-data discovery at `/admin/discovery` + `src/lib/external/importgenius.js`. Find manufacturers → vendor pipeline + AI outreach drafts; find US importers → CRM leads. Stub data until the ImportGenius subscription is provisioned. |
| 2026-06-10 | **PRD-07 Phase 4 shipped**: continuous recall monitoring at `/admin/compliance` — live openFDA enforcement sweep across every stocked manufacturer, affected-SKU mapping, AI-drafted customer notices to the outbox. Backend cron takes over nightly when PRD-01 lands. |
| 2026-06-10 | **CRM order sync shipped** (brief §6): `placeOrder()` now upserts the contact + creates a closed-won deal in the CRM client on every order — failure-isolated so orders never block on CRM. |
| 2026-06-10 | **Migration 0015** added (`purchase_orders`, `daily_digests`, `trade_records`); verifier now covers 18 checks (all PASS). |

---

## How this doc gets updated

I (the agent) keep this doc current. When you finish an action:

1. Tick the checkbox or move the row to the "Done" table
2. Tell me — I'll cross-reference and unblock the next PRD phase

If a new dependency surfaces while I'm building, I add it here
**before** asking you for it, so you can see what's coming.
