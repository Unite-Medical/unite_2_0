# PRD-23 — Hospital Surplus Private Marketplace

**Source:** CTO Brief §8 — "Build a private surplus marketplace"
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01, PRD-04 (Cin7 for receiving), PRD-06 (HubSpot for relationships), PRD-10 (surplus intake system), PRD-14 (B2B portal auth)
**Blocks:** new revenue stream (brokerage fees)

> "Once Unite Medical has established relationships with enough hospital supply chain managers, the surplus intake system can be expanded into a private marketplace where approved hospital clients can list their surplus and approved buyers can purchase. This creates a new revenue stream (brokerage fees) and deepens Unite Medical's position as the intelligence layer of the medical supply chain." — Brief §8

---

## 1. North star

Approved hospitals list their surplus inventory on Unite Medical's private marketplace. Approved buyers browse and purchase. Unite Medical brokers the transaction — handling compliance verification, pricing, and logistics. Revenue comes from brokerage fees (10-15% per transaction). This is a new business line, not just a cost-reduction tool.

---

## 2. Current state

- PRD-10 built the surplus intake system: public form → AI categorization → admin review → offer workflow
- The `/surplus` page is live with intake form + AI normalization
- Admin review at `/admin/surplus` works with AI valuation
- HubSpot "Surplus Supplier" pipeline exists conceptually but not implemented
- No marketplace functionality exists
- No buyer-side browsing or purchasing
- No brokerage fee system
- Brief §8 explicitly calls this a "longer-term" goal

---

## 3. Scope

### In scope

- **Supplier portal**: authenticated hospitals list surplus items with photos, quantities, lot numbers, expiration dates
- **Buyer portal**: authenticated buyers browse available surplus, filter by category/compliance/location
- **AI-powered listing**: AI (PRD-11) normalizes product descriptions, estimates market value, verifies compliance status
- **Transaction workflow**: buyer requests item → Unite Medical verifies compliance → price negotiated → logistics arranged → brokerage fee collected
- **Brokerage fee model**: Unite Medical takes 10-15% per transaction (configurable by category)
- **Compliance gate**: no item transacts without FDA verification (openFDA, PRD-07) and lot traceability
- **Reputation system**: supplier and buyer ratings after each transaction
- **Logistics coordination**: Unite Medical arranges pickup from hospital + delivery to buyer (or routes through Unite warehouse)

### Out of scope

- Public marketplace (this is private — approved participants only)
- Auction/bidding (fixed pricing for v1)
- International surplus (U.S. domestic only)
- Capital equipment (focus on consumables, disposables, and supplies — not MRI machines)
- Direct hospital-to-hospital transactions without Unite Medical brokering

---

## 4. Marketplace architecture

```
SUPPLIER SIDE                    UNITE MEDICAL                   BUYER SIDE
─────────────                    ──────────────                   ──────────

Hospital logs in                                                  Buyer logs in
      │                                                                │
      ▼                                                                ▼
List surplus items               AI normalizes +                 Browse listings
  - Product name                 values items                      - By category
  - Qty available                      │                           - By compliance
  - Lot number                         ▼                           - By location
  - Expiration                   Compliance check                  - By expiration
  - Photos                       (openFDA + lot)                       │
  - Asking price                       │                               ▼
      │                                ▼                         Request item(s)
      ▼                          Listing approved                      │
Listing submitted                (or flagged for                       ▼
      │                           human review)              Unite Medical verifies
      ▼                                │                     compliance + availability
Awaiting approval                      ▼                               │
                                 Published to                          ▼
                                 marketplace                   Price confirmation
                                                                       │
                                                                       ▼
                                                               Transaction created
                                                                       │
                                                                       ▼
                                                               Logistics arranged
                                                               (pickup + delivery)
                                                                       │
                                                                       ▼
                                                               Brokerage fee
                                                               collected (10-15%)
                                                                       │
                                                                       ▼
                                                               Supplier paid
                                                               (minus fee)
```

---

## 5. Data model additions

```sql
-- Migration: 0019_surplus_marketplace.sql

CREATE TABLE IF NOT EXISTS surplus_listings (
  id                TEXT PRIMARY KEY,
  supplier_org_id   TEXT NOT NULL REFERENCES organizations(id),
  submitted_by      TEXT REFERENCES profiles(id),
  product_name      TEXT NOT NULL,
  product_name_normalized TEXT,           -- AI-normalized
  category          TEXT,
  fda_product_code  TEXT,
  device_class      TEXT,
  quantity           INTEGER NOT NULL,
  unit_of_measure   TEXT DEFAULT 'each',
  lot_number        TEXT,
  expiration_date   DATE,
  condition         TEXT CHECK (condition IN ('new', 'like_new', 'open_box', 'short_dated')),
  asking_price_usd  NUMERIC,
  ai_estimated_value NUMERIC,
  photos            JSONB DEFAULT '[]',    -- array of R2 URLs
  compliance_status TEXT DEFAULT 'pending' CHECK (compliance_status IN ('pending', 'verified', 'flagged', 'rejected')),
  listing_status    TEXT DEFAULT 'draft' CHECK (listing_status IN ('draft', 'pending_review', 'active', 'reserved', 'sold', 'expired', 'withdrawn')),
  published_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,           -- 90 days from publish
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS surplus_transactions (
  id                TEXT PRIMARY KEY,
  listing_id        TEXT NOT NULL REFERENCES surplus_listings(id),
  buyer_org_id      TEXT NOT NULL REFERENCES organizations(id),
  buyer_user_id     TEXT REFERENCES profiles(id),
  quantity_purchased INTEGER NOT NULL,
  unit_price_usd    NUMERIC NOT NULL,
  subtotal_usd      NUMERIC NOT NULL,
  brokerage_fee_pct NUMERIC DEFAULT 0.12, -- 12% default
  brokerage_fee_usd NUMERIC NOT NULL,
  total_usd         NUMERIC NOT NULL,      -- subtotal + logistics
  logistics_cost    NUMERIC DEFAULT 0,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'pickup_scheduled', 'in_transit', 'delivered', 'completed', 'cancelled', 'disputed')),
  supplier_paid     BOOLEAN DEFAULT false,
  supplier_payout   NUMERIC,               -- subtotal - brokerage_fee
  qbo_invoice_id    TEXT,
  stripe_payment_id TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS surplus_ratings (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES surplus_transactions(id),
  rater_org_id    TEXT NOT NULL REFERENCES organizations(id),
  rated_org_id    TEXT NOT NULL REFERENCES organizations(id),
  rating          INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_surplus_listings_status ON surplus_listings(listing_status);
CREATE INDEX idx_surplus_listings_category ON surplus_listings(category);
CREATE INDEX idx_surplus_transactions_buyer ON surplus_transactions(buyer_org_id);
CREATE INDEX idx_surplus_transactions_status ON surplus_transactions(status);
```

---

## 6. Brokerage fee structure

| Category | Fee | Rationale |
|---|---|---|
| Disposables (gloves, gowns, masks) | 10% | High volume, low margin |
| Diagnostic kits | 12% | Standard margin |
| Orthopedic supplies | 12% | Standard margin |
| Surgical instruments (non-capital) | 15% | Higher value, more compliance |
| Pharmaceuticals / supplements | 15% | Regulatory complexity |

Minimum fee: $50 per transaction (small lots aren't worth the compliance overhead).

---

## 7. Phases

### Phase 1 — Supplier listing portal

- Authenticated supplier UI at `/portal/surplus/list`
- Form: product, quantity, lot, expiration, condition, photos, asking price
- AI normalization + valuation (reuse PRD-10 prompts)
- Draft → submit for review → admin approves
- Supplier dashboard showing their active listings

**Exit:** A hospital lists 10 surplus items with photos. Admin reviews and approves 8.

### Phase 2 — Buyer browsing + request

- Authenticated buyer UI at `/portal/surplus/browse`
- Filters: category, compliance status, location, expiration window, price range
- Search with AI-enhanced matching (Claude interprets "I need short-dated gloves near Atlanta")
- "Request" button → notification to Unite Medical team

**Exit:** A buyer finds and requests 3 items. Unite Medical receives the request with buyer + listing details.

### Phase 3 — Transaction workflow

- Transaction creation: buyer request → compliance verification → price confirmation → Unite Medical creates transaction
- Payment: buyer pays Unite Medical (Stripe, PRD-09) → Unite Medical pays supplier (minus brokerage fee)
- QBO integration: brokerage revenue posted as income, supplier payout as expense

**Exit:** End-to-end: listing → request → payment → supplier payout → QBO entries. Brokerage fee correctly calculated.

### Phase 4 — Logistics coordination

- Pickup scheduling: coordinate with 3PL or Unite Medical warehouse team
- Options: (a) ship directly hospital → buyer, (b) route through Unite warehouse for QC
- Tracking: link to ShipStation (PRD-04) for shipment tracking
- Condition verification: if routed through warehouse, QC photos before shipping to buyer

**Exit:** A surplus transaction includes pickup from hospital, QC at Unite warehouse, and delivery to buyer with tracking.

### Phase 5 — Reputation + analytics

- Post-transaction ratings (1-5 stars + comment) for both parties
- Supplier score: response time, accuracy, condition quality
- Buyer score: payment timeliness, order reliability
- Analytics dashboard: total brokerage revenue, transaction volume, top categories, repeat participants

**Exit:** Marketplace has 10+ active suppliers, 20+ transactions, and measurable brokerage revenue.

---

## 8. Verifier

`scripts/surplus_marketplace_check.py`:

- Assert no listing with `compliance_status='rejected'` has `listing_status='active'`
- Assert every completed transaction has a QBO invoice and brokerage fee
- Assert brokerage fee matches the configured rate for the category
- Assert expired listings are automatically moved to 'expired' status

---

## 9. Open questions

1. **Minimum viable network**: how many suppliers/buyers before the marketplace is useful? Recommendation: 5 suppliers, 10 buyers minimum before marketing it.
2. **Pricing model**: does Unite Medical set the price or does the supplier? Recommendation: supplier sets asking price, AI suggests market value, buyer can negotiate.
3. **Insurance/liability**: who's liable if surplus items are defective? Recommendation: legal review required. For v1, all items sold "as-is" with compliance verification only.
4. **Cannibalization**: does surplus compete with Unite Medical's primary distribution business? Recommendation: different product categories (surplus = overstock/short-dated; primary = fresh inventory). If overlap occurs, price surplus items to not undercut primary channel.

---

## 10. Out-of-band

- Legal review of marketplace terms, liability, and brokerage agreement template
- 3PL partnership for surplus logistics (or internal warehouse handling)
- Brokerage fee structure approval from Damon
- Insurance / liability coverage decision

---

## 11. Definition of done

- Approved hospitals can list surplus inventory with AI-powered normalization
- Approved buyers can browse, search, and request items
- Transactions include payment, compliance verification, and logistics
- Brokerage fees are collected and posted to QBO
- Marketplace generates measurable revenue within 90 days of launch
