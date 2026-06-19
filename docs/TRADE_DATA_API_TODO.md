# Trade-Data API — Stubs & TODO

> Tracking doc for the trade-data / customs-records integration (CTO brief §7,
> PRD-08). Captures the vendor research, the decision state, and exactly what's
> stubbed vs. what needs wiring. Created 2026-06-19 during the pre-launch
> working session.

## TL;DR

- The discovery feature (`/admin/discovery`) is **fully built and runs on
  deterministic stub data today** — search → rank → push lead to CRM all work
  without any key.
- The default real provider, **ImportGenius, is ~$2,000/mo for API access**
  (sales-gated, no self-serve key). Too expensive to commit pre-launch.
- We are **deferring the paid integration** and keeping the stub live for v1.
  Decision tracked as **D-14** in `docs/Unite_Medical_Decisions.docx`.
- The `external/` adapter pattern means swapping ImportGenius → a cheaper
  provider (or a free one) is a small, isolated change — not a rebuild.

---

## What the feature does (so we don't lose the intent)

Two jobs from the brief, both implemented in
`src/lib/external/importgenius.js`:

1. **Vendor discovery** — given a product keyword / HS code, find who is
   manufacturing/exporting it, at what volume, shipping to which US
   competitors. Output → vendor pipeline + AI outreach draft.
2. **Customer discovery** — find which US importers are bringing in the
   categories we stock (they buy from someone; could be us). Output → CRM lead.

Consumed by: `/admin/discovery`. Records mirror into the `trade_records` table.

---

## Current stub (what's faked today)

**File:** `src/lib/external/importgenius.js`

- `searchShipments({ keyword, hs_code, role, limit })` — `role: 'shipper'`
  finds vendors, `role: 'consignee'` finds US importers.
- When no key + no proxy, returns deterministic plausible records from
  `STUB_SHIPPERS` / `STUB_CONSIGNEES` (Ningbo Surgical, Coastal Medical
  Distributors, etc.) seeded by a hash of the query — stable across reloads.
- Real path already wired: `POST {API_BASE}/proxy/importgenius/shipments/search`
  (server-side proxy injects the key) **or** direct
  `POST https://api.importgenius.com/v1/shipments/search` with `X-API-Key`.
- `ping()` returns `{ ok: false, stub: true, reason: 'no_credentials' }` until
  keyed — visible on `/admin/integrations`.

**To go live as-is:** set `IMPORTGENIUS_API_KEY` in Vercel. No code change.
That's the only thing gating real data on the current adapter.

---

## Vendor research (2026-06-19)

Goal: find a trade-data API that is **self-serve (no mandatory sales call)**
with **published pricing**, sorted by cost. Honest finding: this market is
almost entirely sales-gated. A truly self-serve, per-call BOL API with public
pricing barely exists among the major players.

| Provider | Self-serve API? | Published price | Data coverage | Notes |
|---|---|---|---|---|
| **US Census Intl. Trade API** | ✅ Yes (instant free key) | **Free** | ⚠️ Aggregate only — by HS code / country / district. NOT company-level | Great for market sizing, useless for naming importers/suppliers |
| **ImportKey** | Web app self-serve; API unclear | **$22.50–$37.50/mo** (web plans) | US + China/India/Vietnam/Mexico. Full BOL records + company contacts | API may be a separate quote-based product — NEEDS VERIFICATION |
| **Trademo Intel** | Web "Buy Now"; API = sales-gated | Essential price gated at checkout; API custom quote | 3B+ shipments, 15M+ buyer/supplier profiles, contacts | Strong company/supplier search |
| **Volza** | Advertises API; tier needs contact | Web ~$40–200/mo; API not published | 200+ countries incl. US BOL | API effectively quote-based |
| **ImportGenius** (baseline) | ❌ No self-serve — sales call | Web ~$199–899/mo; **API ~$2,000/mo** | US import/export BOL | Current default adapter; $2k confirmed by Alex |
| Export Genius / Seair / 52WMB / Tendata / TradeAtlas | Quote required | Not published | Global, India/Asia-strong | All sales-gated |
| **Panjiva** (S&P) / Datamyne (Descartes) / Sayari / Bureau van Dijk | ❌ Enterprise sales only | Not published (often $tens of thousands/yr) | Global BOL + supply-chain intel | Out of budget |
| ImportYeti | Free web search; no documented paid API | n/a | US BOL, company search | No public API |

**Verification caveat:** ImportGenius, Volza, ImportYeti, Export Genius are
Cloudflare-blocked to automated access — their figures are from public/reported
sources, not a live page read. The ~$2k ImportGenius API figure matches Alex's
understanding but wasn't re-confirmed live.

### Best candidates
1. **ImportKey** — cheapest transparent entry ($22.50–37.50/mo) with real
   company-level BOL + contacts. **Open question:** does it expose a true REST
   API with a self-serve key, or only CSV/XLS export? If the API is even
   ~$100–200/mo it's a 10–20× saving vs ImportGenius for the same core data.
2. **US Census API** — free, but aggregate-only. Good as a no-cost interim for
   the market-sizing parts of discovery; cannot do company-level leads.

---

## Decision state

- **D-14 (ImportGenius for v1?):** → **DEFER.** $2k/mo is not a pre-launch
  commitment for an unproven sales motion. Launch on the stub; flip the key in
  later with zero code change.
- Reframe D-14 in the decisions doc from "ImportGenius yes/no" to
  **"ImportKey vs ImportGenius vs Census-free."**

---

## TODO

- [ ] **Verify ImportKey API**: email/ask ImportKey — "Do you offer a REST API
      with a self-serve key, and what's the per-call/monthly price?" (manual,
      needs a human — could not confirm via their Cloudflare-blocked site).
- [ ] **(Optional) Build `external/importkey.js` adapter** mirroring the
      `importgenius.js` shape (`searchShipments` + `ping` + stub fallback) so we
      are not locked to the $2k vendor. Same `realOrStub` pattern; only the
      endpoint + auth header + response mapping differ.
- [ ] **(Optional) Build `external/census.js` adapter** for the free US Census
      Intl. Trade API as a no-cost interim — wire the market-sizing / aggregate
      views of `/admin/discovery`. Clearly label it as aggregate-only (no
      company-level leads).
- [ ] **Add a provider switch**: let `/admin/discovery` pick the active trade
      provider (importgenius | importkey | census | stub) via env/config so we
      can A/B without code churn.
- [ ] **Decide & document** the final provider before turning on real spend.
- [ ] If ImportGenius is ever chosen: set `IMPORTGENIUS_API_KEY` in Vercel,
      verify ping green on `/admin/integrations`. (No code change needed.)

---

## Pointers

- Adapter: `src/lib/external/importgenius.js`
- Consumer page: `src/pages/admin/AdminDiscovery.jsx`
- Integration status row: `src/pages/admin/AdminIntegrations.jsx`
- Decision doc: `docs/Unite_Medical_Decisions.docx` (D-14)
- Keys doc: `docs/Unite_Medical_Keys_and_Accounts.docx` (K-11)
- Master action list: `docs/ALEX_ACTIONS.md` (Tier 2 — ImportGenius)
