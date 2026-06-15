# PRD-19 — Customer Self-Serve Quoting Portal

**Source:** CTO Brief §7 — "customer-facing tool" / "intelligent sourcing platform"
**Owner:** Alex (CTO)
**Status:** shipped (client-side) 2026-06-15 — self-serve catalog quote builder at `/portal/quote` (`src/lib/selfServeQuote.js`): search the catalog, add SKUs+quantities priced at the account tier, generate a real quote, and land on the tokenized acceptance page (`/q/:token`, `src/lib/quoteAcceptance.js`) — no login required. Un-stocked needs route to the sourcing desk as leads. FDA product-code classification (`quoting/fda_classify`) fills un-coded lines.
**Depends on:** PRD-01, PRD-14 (B2B portal auth + role-based access), PRD-16 (quoting engine v3), PRD-17 (PDF generation)
**Blocks:** "Unite Source" public launch as a named product

> "This is the system that no competitor at Unite Medical's scale offers as a customer-facing tool." — Brief §7

---

## 1. North star

An approved customer logs into the Unite Medical portal, searches for a product or uploads a need, gets a real-time landed-cost quote with delivery timeline and compliance documentation — and accepts it with one click. No phone call, no email chain, no waiting. The quote is accurate because every component (FDA, HTS, freight, margin) is computed live. This is the product Unite Medical sells.

---

## 2. Current state

- PRD-08 Phase 7 allocates one phase to "Customer self-serve" with a 7-line description
- PRD-16 expands on the capability but focuses on the engine, not the UX
- No customer-facing quoting UI exists beyond the internal rep tool at `/quote/new`
- No product search or category browsing for quoting purposes exists
- No "request for quote" (RFQ) workflow exists
- Customer portal (PRD-14) exists as a concept but has no quoting integration

---

## 3. Scope

### In scope

- **Two self-serve quoting modes**:
  1. **Catalog quote** — customer browses approved products, selects items + quantities, gets instant pricing
  2. **Sourcing request** — customer describes a need ("I need 10,000 nitrile gloves, powder-free, medium") → system finds best vendor and quotes
- **Customer-facing UI** at `/portal/quote` (inside the authenticated B2B portal)
- **Product search** with filters: category, device class, compliance requirements, delivery timeline
- **Quantity-based pricing**: unit price changes based on quantity tiers (already in margin policy)
- **Delivery timeline**: real ETAs from Flexport integration
- **Quote comparison**: if customer requests sourcing, show top 3 vendor options (price, ETA, compliance score) without revealing vendor names
- **One-click acceptance**: Accept → order created → QBO invoice → fulfillment
- **Quote history**: customer sees all their quotes, can re-order from accepted quotes
- **RFQ for non-stocked items**: customer submits a request that triggers the full quoting engine; rep reviews before sending

### Out of scope

- Marketplace (customer-to-customer sales)
- Auction/reverse auction
- Customer uploading their own vendor sheets (that's the internal tool)
- Custom product configuration (e.g., custom branding on PPE)

---

## 4. Two quoting modes (detailed)

### Mode 1: Catalog Quote (instant)

For products Unite Medical already stocks or has pre-negotiated vendor pricing:

1. Customer logs in → navigates to `/portal/quote`
2. Browses product categories or searches ("knee braces", "diagnostic kits")
3. Results show: product name, description, compliance badges, stock status
4. Customer adds items to a "quote cart" (separate from purchase cart)
5. Selects quantities per item
6. System calculates: unit price (from tier margin), delivery timeline (from inventory or Flexport ETA), compliance status
7. **Instant quote generated** — no pipeline delay for stocked items
8. Customer reviews quote summary → clicks "Accept"
9. Order created automatically

**Key**: pricing is pre-computed from tier margin + known landed costs. No external API calls needed for stocked items.

### Mode 2: Sourcing Request (near-real-time)

For items Unite Medical doesn't stock but can source from approved vendors:

1. Customer describes what they need:
   - Free-text description ("nitrile exam gloves, powder-free, size medium, blue")
   - OR selects a product category + specifications
   - Quantity needed
   - Desired delivery date
2. Claude (PRD-11) interprets the request:
   - Maps to FDA product code + HTS code
   - Identifies matching approved vendors
3. System runs the quoting engine (PRD-16) against top 3 approved vendors
4. **Within 60 seconds**, customer sees:
   - Option A: $X/unit, delivery in Y days, compliance score Z
   - Option B: $X/unit, delivery in Y days, compliance score Z
   - Option C: $X/unit, delivery in Y days, compliance score Z
   - (Vendor names NOT shown — just "Source A/B/C")
5. Customer selects preferred option → quote generated → accept or save for later
6. For high-value quotes (> $50K), rep review required before acceptance

---

## 5. Customer experience flow

```
┌─────────────────────────────────────────────────┐
│  PORTAL LOGIN (PRD-14)                          │
│  Customer: Atlanta Surgical Center              │
│  Tier: A (30% margin)                           │
│  Rep: Marcus Johnson                            │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  /portal/quote                                   │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ CATALOG      │  │ SOURCE NEW   │              │
│  │ Browse our   │  │ Tell us what │              │
│  │ products     │  │ you need     │              │
│  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                      │
│  ┌──────▼───────┐  ┌──────▼───────┐              │
│  │ Product grid  │  │ Description  │              │
│  │ + qty inputs  │  │ + qty + date │              │
│  │ → Add to      │  │ → Find       │              │
│  │   quote cart  │  │   sources    │              │
│  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                      │
│         ▼                 ▼                      │
│  ┌──────────────────────────────┐                │
│  │ QUOTE SUMMARY                │                │
│  │ Items: 5                     │                │
│  │ Subtotal: $24,500            │                │
│  │ Shipping: ~$1,200            │                │
│  │ Est. delivery: June 28       │                │
│  │ Compliance: ✓ All verified   │                │
│  │                              │                │
│  │ [Accept Quote]  [Save Draft] │                │
│  │ [Download PDF]  [Share]      │                │
│  └──────────────────────────────┘                │
└──────────────────────────────────────────────────┘
```

---

## 6. Access control

| Role (PRD-14) | Catalog quote | Sourcing request | Accept quote | View quote history |
|---|---|---|---|---|
| Admin | ✓ | ✓ | ✓ | All quotes |
| Rep | ✓ (on behalf of customer) | ✓ | ✓ (under $50K) | Their customers only |
| Customer (A-tier) | ✓ | ✓ | ✓ (under $25K) | Their org only |
| Customer (B-tier) | ✓ | Request only (rep reviews) | ✗ (rep must approve) | Their org only |
| Customer (C-tier) | ✗ (must work with rep) | ✗ | ✗ | ✗ |
| Distributor | ✓ | ✓ | ✓ (under $100K) | Their org only |
| Gov buyer | ✓ | ✓ | ✓ (under BPA limit) | Their org only |

---

## 7. Rate limiting & abuse prevention

- **Quotes per day**: A-tier: 20, B-tier: 5, Distributor: 50, Gov: 20
- **Minimum order value**: $5,000 for sourcing requests, $500 for catalog quotes
- **Cooldown**: 5-minute cooldown between sourcing requests (prevents spamming the quoting engine)
- **Suspicious activity**: if a customer generates > 50 quotes in a week without accepting any, flag for rep review
- **Cost ceiling**: each sourcing request uses ~$0.05 in Claude API + Flexport API costs. Daily budget per customer: $5.00

---

## 8. Phases

### Phase 1 — Catalog quote (stocked items)

- `/portal/quote` page with product grid (filtered to customer's approved categories)
- Quantity input per product
- Instant pricing from tier margin + known landed costs
- Quote summary view with "Accept" button
- Acceptance creates order

**Exit:** A-tier customer browses catalog, selects 5 items, gets instant pricing, accepts — order created in < 10 seconds.

### Phase 2 — Sourcing request (basic)

- "Source new" tab with description field + quantity + delivery date
- Claude maps description to product category + specifications
- System queries approved vendors for matching products
- Single-vendor quote generated (best landed cost)
- Rep notification before customer can accept

**Exit:** Customer describes "1000 pulse oximeters" → system identifies vendor → quote generated in < 60 seconds.

### Phase 3 — Multi-vendor comparison

- Sourcing request returns top 3 vendor options (anonymized)
- Comparison table: price, ETA, compliance score
- Customer selects preferred option
- Selected option generates the full quote

**Exit:** Customer sees 3 sourcing options, selects cheapest, accepts — full pipeline completes.

### Phase 4 — Quote history + re-ordering

- `/portal/quotes` page showing all customer quotes
- Status: draft, sent, accepted, expired, declined
- "Re-order" button on accepted quotes (pre-fills quantities from last order)
- "Request refresh" on expired quotes (re-runs pipeline with current pricing)

**Exit:** Customer re-orders from a previous quote with two clicks.

### Phase 5 — Acceptance workflow + QBO integration

- One-click acceptance creates:
  - Order in Unite Medical system
  - Draft QBO invoice (PRD-02)
  - HubSpot deal stage update (PRD-06)
  - Rep notification
- For quotes requiring rep approval (B-tier, high-value): approval queue in admin
- Customer sees order confirmation with expected delivery date

**Exit:** Full cycle: quote → accept → QBO invoice → fulfillment pipeline started. Under 5 minutes.

---

## 9. Verifier

`scripts/self_serve_check.py`:

- Assert all customer-facing routes require authentication (PRD-14)
- Assert C-tier customers cannot access `/portal/quote`
- Assert rate limits are enforced (generate 25 quotes in rapid succession → throttled)
- Assert minimum order value is enforced
- Assert accepted quotes create valid QBO invoices

---

## 10. Open questions

1. **Product visibility**: does every customer see every product, or do we gate by category? Recommendation: show everything in the catalog, but sourcing requests are limited to categories the customer has purchased before.
2. **Pricing transparency**: do customers see per-unit pricing or only totals? Recommendation: per-unit pricing for catalog quotes, total-only for sourcing (to avoid price comparison gaming).
3. **Self-serve for government**: VA buyers often need specific contract pricing (BPA rates). Should self-serve use BPA rates automatically? Recommendation: yes, if the customer's org has a BPA on file.
4. **Re-quote notifications**: if a customer saves a draft quote and pricing changes, do we notify them? Recommendation: yes, email notification with "Your saved quote has updated pricing."

---

## 11. Out-of-band

- Customer segments defined in HubSpot (PRD-06) with tier assignments
- Product categories mapped to approved vendors (PRD-07)
- Rate limit configuration in admin settings
- Customer onboarding email template explaining self-serve capabilities

---

## 12. Definition of done

- A-tier customers can generate catalog quotes instantly without rep involvement
- Sourcing requests return multi-vendor comparisons in under 60 seconds
- Quote acceptance creates orders + QBO invoices automatically
- Rate limiting and access control prevent abuse
- Customer quote history enables easy re-ordering
- At least 3 real customers are using self-serve weekly
