# Unite Medical 2.0 — Build PRDs

This folder contains the engineering PRDs that turn the founder's CTO Brief
(`Unite_Medical_CTO_Brief.docx`, April 2026) into shippable work.

The pre-existing `docs/PRD.md` covered **Phase 0**: the customer-facing site
rebuild (string sanitization, routing, redirects, page copy). That ships the
marketing surface honestly. **Everything below is the back-end and platform
work the brief actually asks for** — the "enter data once, sync everywhere"
operational brain.

---

## North star

From the brief, verbatim:

> "Enter data once — have it sync across all aspects of the company. From
> inventory management, run rates, POs, receiving, shipping, inbound,
> outbound, everything."

Every PRD below contributes to that single goal.

---

## Build order

The brief's §2 already prioritized 9 systems by operational impact and
dependency chain. PRDs in this folder follow that order, with three
additions for foundation/safety work:

| # | PRD | Brief priority | Why this slot |
|---|---|---|---|
| 00 | [Hygiene & Truthfulness Fixes](PRD-00-hygiene-fixes.md) | — | Closes audit findings before more work lands |
| 01 | [Platform Foundation](PRD-01-platform-foundation.md) | — | DB, API, Auth — every other PRD depends on this |
| 02 | [QuickBooks Online](PRD-02-quickbooks-online.md) | #1 | Stop double-entry. CFO relief day one. |
| 03 | [Flexport](PRD-03-flexport.md) | #2 | Real-time landed cost, customs status, inventory trigger |
| 04 | [WMS / Cin7](PRD-04-wms-cin7.md) | #3 | Replace Shopify PO/inventory — single source of truth |
| 05 | [Fathom + Gmail AI Brain](PRD-05-fathom-gmail-ai.md) | #4 | Every call recorded. Every task assigned. CEO daily digest. |
| 06 | [HubSpot 1099 Rep System](PRD-06-hubspot-1099-reps.md) | #5 | Scale reps nationally with full visibility |
| 07 | [Vendor Approval Automation](PRD-07-vendor-approval.md) | #6 | Compliance-first product onboarding (openFDA + GUDID + GS1) |
| 08 | [Global Quoting Engine v2](PRD-08-quoting-engine-v2.md) | #7 | Proprietary real-time global quoting — Unite Medical's core IP |
| 09 | [Stripe B2B Billing](PRD-09-stripe-b2b-billing.md) | #8 | Net-30/60 automation. ACH. Auto-collections. |
| 10 | [Surplus Inventory Network](PRD-10-surplus-network.md) | #9 | Build inbound sourcing from hospital overstock |
| 11 | [AI Intelligence Layer](PRD-11-ai-intelligence-layer.md) | cross-cutting | Claude across the entire stack |
| 12 | [Demand Forecasting](PRD-12-demand-forecasting.md) | cross-cutting | CTO's mathematics background as direct business value |
| 13 | [SSR / SEO Hardening](PRD-13-ssr-seo.md) | cross-cutting | Protect the PDAC #1 Google rank during rebuild |
| 14 | [B2B Portal & Account Features](PRD-14-b2b-portal.md) | cross-cutting | Role-based pricing, account approval, custom fields |
| 15 | [ImportGenius Trade Intelligence](PRD-15-importgenius-trade-intelligence.md) | #7 | Vendor discovery + customer prospecting from customs data |
| 16 | [Global Quoting Engine v3](PRD-16-quoting-engine-v3.md) | #7 | The formidable system — Unite Medical's core IP |
| 17 | [PDF Generation & Document Pipeline](PRD-17-pdf-document-pipeline.md) | cross-cutting | Branded PDFs for quotes, invoices, POs, packing slips |
| 18 | [XLSX Upload & Advanced Parsing](PRD-18-xlsx-advanced-parsing.md) | #7 | Excel support + multilingual column mapping for vendor sheets |
| 19 | [Customer Self-Serve Quoting Portal](PRD-19-customer-self-serve-quoting.md) | #7 | Customer-facing quoting — the product we sell |
| 20 | [Webhook Event Bus](PRD-20-webhook-event-bus.md) | cross-cutting | Unified webhook receiver with retry + dead-letter |
| 21 | [Calendly + Google Calendar](PRD-21-calendly-google-calendar.md) | #4/#5 | Rep scheduling + meeting lifecycle → HubSpot |
| 22 | [Multi-Currency & Intl Vendor Comms](PRD-22-multi-currency-intl-vendor.md) | #7 | Currency conversion + translation for foreign vendors |
| 23 | [Hospital Surplus Marketplace](PRD-23-surplus-marketplace.md) | #9 | Private marketplace with brokerage fees — new revenue |
| 24 | [Zero-Touch Order Fulfillment](PRD-24-zero-touch-fulfillment.md) | north star | Order → tracking number with zero human data entry |
| 25 | [Customer Order Management & Self-Service Ordering](PRD-25-customer-order-management.md) | founder directive | Per-customer pricing, pre-approved payment methods, auto-invoicing, quick/reorder, rep RBAC |
| 26 | [Distributor / 3PL Ordering, Consignment & Blind Shipping](PRD-26-distributor-consignment-3pl.md) | founder directive | Owner-segregated consignment inventory, scan in/out, blind ship, custom packing slips, PO ingestion, third-party billing + rate markup |

Read `Unite_Medical_CTO_Brief.docx` once before starting. It is the source
of truth for the *why* behind everything here.

---

## How each PRD is structured

Every PRD in this folder follows the same template (matched to the existing
`docs/PRD.md`):

1. **Title + source + owner + status + repo**
2. **North star** — one sentence that makes the trade-offs decidable
3. **In scope / out of scope**
4. **Phases** — each with explicit exit criteria a verifier could check
5. **Data + API contract sketch** where the integration is non-trivial
6. **Open questions** — surfaced to the founder/Alex, not hidden
7. **Dependencies on other PRDs** — wired so the build order in the
   table above is honored
8. **Out-of-band assets** — accounts, API keys, contracts that need to
   be sourced

---

## Conventions

- **Owner:** Alex (CTO) unless otherwise marked.
- **Status:** `draft` → `accepted` → `in-progress` → `shipped`.
- **Verifier:** every PRD should add a check to `scripts/phase_check.py`
  (or a new `scripts/<area>_check.py`) so CI gates regressions.
- **Secrets:** never in repo. Vercel env vars or a managed secret store.
  Each PRD lists the env vars it introduces.
- **API simulation layer:** `src/lib/services.js` already mirrors the
  upstream contracts. Each PRD's "Phase 1" is typically replacing the
  body of one service function with a real `fetch()` while preserving
  the signature, so the rest of the app doesn't change.
- **Schema files:** SQL migrations land under `docs/schema/` and are
  applied with whichever migration tool we pick in PRD-01.

---

## Cross-cutting decisions still open

These get resolved during PRD-01 ("Platform Foundation") and constrain
every downstream PRD:

1. **Backend runtime:** Node.js (NestJS / Fastify) vs. Python (FastAPI).
   Brief recommends "Node for API-heavy, Python if ML/forecasting is
   primary." Demand forecasting (PRD-12) leans Python; everything else
   leans Node. Recommendation: Node primary, Python as a sidecar
   service for forecasting only.
2. **Frontend:** stay on Vite SPA vs. migrate to Next.js for SSR. See
   PRD-13.
3. **Hosting:** Vercel (current) keeps working for either. Backend
   probably ends up on Fly.io / Render / Vercel functions depending on
   shape.
4. **Database:** Postgres on Neon / Supabase / RDS. Code already
   declares `src/lib/db.js` as "designed for Supabase migration" — pick
   accordingly.
5. **Auth:** Clerk (faster) vs. Auth0 (more flexible, more expensive).
6. **Shopify transition:** headless (keep Shopify as commerce engine
   behind our portal) vs. full replacement. Brief §2 leaves this open
   to the CTO. Recommendation: **headless** for v1, evaluate full
   replacement after Cin7 is stable.

Track resolution of these in PRD-01 §6.

---

## Quick reference — every external API in scope

| System | PRD | Free? | Auth |
|---|---|---|---|
| QuickBooks Online | 02 | No (subscription) | OAuth 2.0 |
| Flexport | 03 | Account-required | OAuth |
| Cin7 Core | 04 | Subscription | API key |
| Fathom | 05 | Account | Webhook + native |
| Gmail / Google Workspace | 05 | Existing | OAuth 2.0 |
| Calendly | 05 / 06 | Existing | API key / OAuth |
| HubSpot | 06 | Existing | API key / OAuth |
| openFDA | 07 | **Free** | None (optional key for rate limits) |
| AccessGUDID | 07 | **Free** (read) / portal (write) | None |
| GS1 US Data Hub | 07 | ~$500/yr | API key |
| ImportGenius | 08 | $899/user/mo | API key |
| USITC HTS | 08 | **Free** | Account |
| Stripe | 09 | Per-transaction | API key + webhooks |
| ShipStation | 02 / 04 | Existing | API key |
| Claude (Anthropic) | 11 | Per-token | API key |

---

## PRDs 15–24: Quoting Engine & North Star Completion

PRDs 15–24 close the gap between the existing foundation (PRDs 01–14)
and the full vision Damon described in the brief — particularly the
"formidable" quoting system and the "zero human touchpoints" fulfillment
pipeline. The critical path for the quoting engine is:

```
PRD-01 (Platform) → PRD-15 (ImportGenius) → PRD-18 (XLSX) → PRD-17 (PDF)
                  → PRD-16 (Quoting v3) → PRD-19 (Self-Serve Portal)
```

The critical path for zero-touch fulfillment is:

```
PRD-01 → PRD-02 (QBO) → PRD-04 (Cin7) → PRD-20 (Webhooks) → PRD-24 (Fulfillment)
```

---

## Not in any PRD (yet)

Things the brief mentions that we're explicitly *deferring*:

- **ZoomInfo** — brief recommends 90-day parallel test vs. openFDA +
  ImportGenius. If we retain it, fold into PRD-06.
- **EDI 850/856/315/214/310/110** for big-retail customers. The brief
  flags this as "Standard EDI tier" on Flexport. PRD-03 covers REST;
  EDI is a follow-up if CVS/Publix/etc. require it.
- **Mirakl Connect** — keep until Amazon SP-API + SPS Commerce EDI are
  built natively. Re-evaluate after PRD-04.
- **Sales Tax (TaxJar / Avalara)** — mentioned in PRD-24 open questions.
  Needs its own PRD if Shopify is fully replaced.
- **Amazon SP-API / Marketplace integrations** — for Amazon, GoPuff,
  Publix direct integrations. Evaluate after PRD-04.

If any of these become urgent, file them as `PRD-XX-<slug>.md`.
