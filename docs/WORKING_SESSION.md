# Unite Medical — Launch Working Session Board

> **How to use this doc.** This is the live board Alex + the owner drive the
> pre-launch session from. We go **top to bottom**: **Layer 1 (Backend /
> Functionality)** first, then **Layer 2 (UI / Design)**. Each surface has a
> stable ID (e.g. `B-03`) so we can say "let's do B-03 next." As we talk, we
> fill in the **Decision** column and tick **Status**. Nothing here is code —
> it's business decisions, accounts, and assets.
>
> **The one fact that makes this easy:** the app is built so that *adding a
> credential is the only thing that flips a surface from demo-stub to live.*
> There are no half-finished features. So most of Layer 1 is really "decide it,
> get the key, paste it in Vercel." See `docs/GO_LIVE.md` for the mechanics.

_Last updated: 2026-06-19 · session 1_

---

## Status legend

| Mark | Meaning |
|---|---|
| 🟢 LIVE | Keyed & working in production-ready state |
| 🟡 STUB | Built and working on demo data — needs a key/decision to go real |
| 🔴 BLOCKED | Can't go live yet — missing key, account, or asset |
| ⚪ DECIDE | Needs a business decision from the owner before we move |
| 🔵 DEPLOY | Code is done; needs a one-time deploy/OAuth step (not just a key) |
| ✅ DONE | Closed out this session |

---

## Scoreboard (fill in as we go)

| | Count |
|---|---|
| Surfaces total | 33 |
| 🟢 Live today | 3 (AI, database, free gov APIs) |
| 🔴 Blocked on a key/account | 16 |
| ⚪ Waiting on an owner decision | 11 |
| 🎨 UI/design + assets | 10 |
| **Decisions captured today** | **0 → update live** |

---

# LAYER 1 — Backend / Functionality (do first)

These are the capabilities that *make the business run*. Group order = rough
launch priority. For each: what it does **for the business**, current status,
what's blocking it, and the decision/action we need from the owner.

---

## Group A — Money & Commerce (highest priority — can't sell without this)

| ID | Surface | What it does for the business | Status | Blocker / what we need | Owner decision |
|---|---|---|---|---|---|
| **B-01** | **Payments / checkout** (Stripe) | Customers actually pay. No key = no real orders. | 🔴 | `STRIPE_SECRET_KEY` + Stripe **Connect** application approved (needs federal EIN) | Confirm we use the existing Stripe acct; start Connect approval today |
| **B-02** | **Invoicing & AR** (Stripe + CFO dashboard `/admin/finance`) | Send invoices, track who owes us, one-click reminders. | 🟡 | Rides on B-01's key | None — unlocks with B-01 |
| **B-03** | **Rep commissions & payouts** (Stripe Connect) | Pay 1099 reps automatically from attributed sales. | 🟡 | Stripe Connect (Express) enabled | Confirm reps get paid via Stripe vs manual for v1 |
| **B-04** | **Accounting sync** (QuickBooks Online) | Orders/invoices flow to the books; no double entry. | 🔵 | Intuit app + one-time OAuth (`/api/auth/qbo/connect`). QBO Essentials $35 or Plus $65/mo | CFO: QBO Desktop→Online migration. Pick plan |
| **B-05** | **Sales tax** | Charge the right tax per state. | ⚪ | — | **Decide tool:** Stripe Tax (recommended) vs QBO built-in vs Avalara |

---

## Group B — Email & Communications (nothing reaches customers without this)

| ID | Surface | What it does for the business | Status | Blocker / what we need | Owner decision |
|---|---|---|---|---|---|
| **B-06** | **All outbound email** (Resend) | Order confirmations, shipping notices, invoices, dunning, POs, rep statements — *everything*. Until keyed, it all silently queues in an outbox. | 🔴 | `RESEND_API_KEY` + verify `unitemedical.net` domain (SPF/DKIM/DMARC). ~$20/mo | **Single most important key.** Approve domain DNS records |
| **B-07** | **Scheduling** (Calendly) | Reps' booking links; bookings flow into CRM. | 🔴 | `CALENDLY_API_KEY` (Pro, $12/user/mo) + webhook secret | Confirm Calendly is the scheduler (Google Cal NOT required) |
| **B-08** | **Call intelligence** (Fathom) | Auto-summarize sales calls → CRM tasks. | 🔴 | Fathom account ($19-29/user/mo) + webhook secret | Worth it for v1? Needs privacy-policy consent line |
| **B-09** | **CRM sync** (HubSpot) | Contacts, deals, rep pipeline — the sales backbone. | 🔴 | `HUBSPOT_PRIVATE_APP_TOKEN` (Pro $90/seat/mo) | Confirm seat count for 1099 reps |

---

## Group C — Inventory & Fulfillment (the warehouse side)

| ID | Surface | What it does for the business | Status | Blocker / what we need | Owner decision |
|---|---|---|---|---|---|
| **B-10** | **Inventory / WMS source of truth** (Cin7 Core) | The real stock numbers everything else trusts. | 🔴 | `CIN7_ACCOUNT_ID` + `CIN7_APPLICATION_KEY` (~$349-799/mo). Data migration from Shopify | Pick Cin7 tier; schedule onboarding + data import |
| **B-11** | **Shipping labels & tracking** (ShipStation) | Create labels, push tracking to customers. | 🔴 | `SHIPSTATION_API_KEY` + secret (existing sub — get *direct* API key, not via Shopify) | Pull the direct API key from existing account |
| **B-12** | **Freight / customs** (Flexport) | Inbound ocean freight + landed-cost into the books. | 🔴 | `FLEXPORT_API_KEY` + webhook secret (CSM enables Public API tier) | Email Flexport rep for API access |
| **B-13** | **Demand forecasting** (Prophet sidecar) | Smarter reorder points than simple run-rate. | 🔵 | Deploy the `forecasting/` container (Fly/Render), set `FORECAST_API_URL`. *Only surface needing a container, not just a key.* | Low priority for launch — run-rate stub is fine day 1 |
| **B-14** | **Lot-level tracking** | Recall lookups in <1 sec; backs the compliance SLA. | ⚪ | Schema ready (`docs/schema/lot_tracking.sql`); needs WMS pick/pack to write rows | Confirm this is a launch requirement vs fast-follow |

---

## Group D — Product, Compliance & Sourcing

| ID | Surface | What it does for the business | Status | Blocker / what we need | Owner decision |
|---|---|---|---|---|---|
| **B-15** | **AI features** (Anthropic/Claude) | Quote cover letters, FDA/HTS classify, call extraction, CEO digest, surplus valuation. | 🟢 LIVE | `ANTHROPIC_API_KEY` is **set** | Set a hard budget cap in the Anthropic dashboard |
| **B-16** | **Durable database** (Neon Postgres) | State survives + syncs across devices. | 🟢 LIVE | `DATABASE_URL` / sync tokens **set** | None |
| **B-17** | **FDA / recall monitoring** (openFDA) | Live recall sweep across stocked manufacturers. | 🟢 LIVE | Free API, no key needed | None |
| **B-18** | **HTS duty classification** (USITC) | Real import-duty math in the quoting engine. | 🟢 LIVE | Free API (verified working) | None |
| **B-19** | **Product onboarding / GTIN check** (GS1) | Validate barcodes before FDA listing. | 🔴 | `GS1_API_KEY` + `GS1_ACCOUNT_ID` (~$500/yr) | Already registered with GS1? Pull the key |
| **B-20** | **Vendor / trade discovery** (ImportGenius) | Find manufacturers + US importers as leads. | 🔴 | `IMPORTGENIUS_API_KEY` ($899/user/mo) | Expensive — decide if v1 needs it or defer |

---

## Group E — Accounts, Auth & Business Rules (decisions, not keys)

These gate functionality but mostly need a **yes/no from the owner**, not money.

| ID | Surface | What it does for the business | Status | Owner decision needed |
|---|---|---|---|---|
| **B-21** | **Account approval** | Auto-approve good B2B signups, route the rest to manual review. | ⚪ | Confirm new accounts start credit-card-only (net-30 via separate app) |
| **B-22** | **Margin policy per tier** | What we charge each customer type. | ⚪ | Approve/adjust defaults: A 30% · B 50% · C 60% · Distributor 25% |
| **B-23** | **Quote validity period** | How long a quote price holds. | ⚪ | Default 14 days (Flexport rates expire in 7) — confirm |
| **B-24** | **Margin disclosure** | Does the customer see our markup? | ⚪ | Default: no (customer sees sell price; rep sees full breakdown) |
| **B-25** | **Vendor scoring + Class III policy** | Which vendors auto-approve/reject. | ⚪ | Review scoring weights; confirm Class III = AUTO_REJECT for v1; high-watch country list |
| **B-26** | **Rep commission structure** | How reps get paid. | ⚪ | Flat % per rep (default) vs tiered by segment/product |
| **B-27** | **Self-serve quote gating** | Who can quote without a rep. | ⚪ | Default: A-tier + approved distributors only |
| **B-28** | **Surplus offer % + logistics** | What we pay for surplus inventory. | ⚪ | Default 35% of retail for new-in-box Class II; contracted LTL pickup |
| **B-29** | **Data retention + call-recording consent** | Compliance/legal posture. | ⚪ | Approve retention defaults; OK privacy-policy update for Fathom |

---

# LAYER 2 — UI / Design (after functionality is settled)

Polish and assets. None of these block the *backend* working, but they're
visible gaps a visitor would notice. Several just need an asset or a number.

| ID | Surface | What's needed | Status | Owner action |
|---|---|---|---|---|
| **U-01** | **Homepage "live inventory" widget** | Real Shopify SKU count (hero + catalog header + locations card currently show no number) | 🔴 | Provide count or approve wiring to Shopify Admin API |
| **U-02** | **Warehouse square footage** | Real sqft for Lithia Springs GA + Nevada | ⚪ | Give the two numbers |
| **U-03** | **Coverage map redraw** | 2 dots (GA + NV) — kill the old 4-dot/Dallas/Atlanta map | 🎨 | Designer asset (or ship the 2-dot inline SVG as-is) |
| **U-04** | **8 partner logos** | Ardent Health, Restore Robotics, Amazon Fresh, WellLink, The Resource Group, Orlando Health, UF Health, Total Joint Specialists | 🔴 | Source SVG/PNG (see `docs/partner-logos-spec.md`) |
| **U-05** | **Compliance badge graphic** | 4-category shield: FDA Status · Quality System · Product Testing · Certifications | 🎨 | Designer asset |
| **U-06** | **Blog content** | Pages render but empty until real posts land | 🔴 | Coordinate with Jill on articles |
| **U-07** | **Quote page — rebuild?** | Sanitized demo flow is safe to ship; spec wants full rebuild | ⚪ | Decide: ship sanitized for launch vs rebuild first |
| **U-08** | **Document REQUEST buttons** | Compliance-page per-doc buttons hit the stub send | ⚪ | "Mock is fine for now" vs wire to real backend |
| **U-09** | **Per-page content review** | Walk the 22 public routes for copy/truthfulness | 🎨 | Read-through together; flag anything wrong |
| **U-10** | **Admin UI polish** | Internal-only screens; lowest launch priority | 🎨 | Defer unless something's broken |

---

## API Key / Account Procurement Checklist

The recurring blocker. Tick as each lands in Vercel → Settings → Env Vars.
Order = launch criticality.

- [ ] **Resend** (`RESEND_API_KEY`) + verify domain — unlocks ALL email `[B-06]`
- [ ] **Stripe** (`STRIPE_SECRET_KEY` + Connect approval + `STRIPE_WEBHOOK_SECRET`) `[B-01/02/03]`
- [ ] **Cin7 Core** (`CIN7_ACCOUNT_ID` + `CIN7_APPLICATION_KEY`) `[B-10]`
- [ ] **ShipStation** (`SHIPSTATION_API_KEY` + secret + webhook secret) `[B-11]`
- [ ] **HubSpot** (`HUBSPOT_PRIVATE_APP_TOKEN`) `[B-09]`
- [ ] **Calendly** (`CALENDLY_API_KEY` + webhook secret) `[B-07]`
- [ ] **QuickBooks** (Intuit app → OAuth → `QBO_*`) `[B-04]`
- [ ] **Flexport** (`FLEXPORT_API_KEY` + webhook secret) `[B-12]`
- [ ] **GS1** (`GS1_API_KEY` + `GS1_ACCOUNT_ID`) `[B-19]`
- [ ] **Fathom** (webhook secret) — if we keep it `[B-08]`
- [ ] **ImportGenius** (`IMPORTGENIUS_API_KEY`) — if v1 needs it `[B-20]`
- [ ] **Forecast sidecar** (deploy container → `FORECAST_API_URL`) `[B-13]`
- [x] **Anthropic** (`ANTHROPIC_API_KEY`) — DONE `[B-15]`
- [x] **Neon database** (`DATABASE_URL` + sync tokens) — DONE `[B-16]`

**Verify after each:** `curl https://<deployment>/api/health` or open
`/admin/integrations` and click "Run a ping" — green = real upstream answered.

---

## Decisions captured this session

> Fill this in live as the owner makes calls. Format: `ID · decision · date`.

| ID | Decision | Date |
|---|---|---|
| _e.g. B-05_ | _Stripe Tax_ | _2026-06-19_ |
|  |  |  |

---

## Session order we recommend

1. **Group A (Money)** — B-01 Stripe + B-06 Resend are the two true launch
   blockers. Start those procurements *today* (Connect approval has lead time).
2. **Group E decisions (B-21→B-29)** — these are free; knock them all out
   verbally in one pass while the owner is in the room.
3. **Groups B & C keys** — assign an owner + due date per row.
4. **Layer 2 assets** — hand U-03/U-04/U-05 to the designer; get the two
   numbers (U-01 SKU count, U-02 sqft) from the owner on the spot.
