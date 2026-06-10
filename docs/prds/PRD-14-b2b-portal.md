# PRD-14 — B2B Portal & Account Features

**Source:** CTO Brief §3 (Locksmith / Helium replacements), §6 (account approval), §10 (auth & roles)
**Owner:** Alex (CTO) + VP Sales
**Status:** draft
**Depends on:** PRD-01 (Auth + DB), PRD-02 (QBO customer mirror), PRD-09 (invoice payment UI)
**Replaces:** Shopify apps — Locksmith, Helium Customer Fields, AAA Custom Form Builder

> "B2B multi-tenant auth, role-based access (rep, dealer, hospital, admin)." — Brief §10

---

## 1. North star

A logged-in customer sees their own pricing, their own catalog gating
(if applicable), their own invoices, their own quotes, their own reps,
and their own org-level user management. A logged-in rep sees only
their accounts. The Shopify apps Locksmith + Helium Customer Fields
are gone.

---

## 2. Current state

- Auth in repo: localStorage mock (`src/lib/auth.js`)
- `RequireAdmin` component gates `/admin/*`
- Account-approval helper exists at `src/lib/accountApproval.js` (per
  the original PRD §6.2) — pure JS, ready to be wired to a real
  signup endpoint
- Customer-facing: there's a `/dashboard`, `/account/settings`,
  `/account/invoices` page but everything is local
- B2B gating today on Shopify: Locksmith app ($9/mo)
- Custom customer fields (DEA #, tax-exempt, rep assignment) today on
  Shopify: Helium Customer Fields app ($26/mo)

---

## 3. Scope

### In scope

- Real auth via Clerk (PRD-01 Phase 3)
- Roles: `admin`, `rep`, `customer`, `dealer`, `gov_buyer`
- Org-level grouping: a customer is *a user within an organization*
  (hospital, ASC, etc.); orgs have addresses, terms, credit limit
- Account approval workflow: register → `evaluateAccount` → AUTO_APPROVE
  (CC-only) or MANUAL_REVIEW (rep review)
- Customer dashboard pages:
  - `/dashboard` — recent orders, upcoming deliveries, alerts
  - `/account/settings` — profile, payment methods (PRD-09), team
    members
  - `/account/invoices` — Stripe-driven (PRD-09)
  - `/account/quotes` — quotes from PRD-08
  - `/account/team` — invite teammates, set roles within org
- Role-based pricing: catalog/PDP shows the right tier price for the
  logged-in user
- Catalog gating (replaces Locksmith): some products visible only to
  certain customer segments (e.g., Class III prescription products
  to hospital + clinic accounts only)
- Custom org-level fields (replaces Helium): DEA #, tax-exempt
  status, NPI, account rep assignment, credit limit
- Rep portal: `/rep/dashboard`, `/rep/accounts`, `/rep/quotes`,
  `/rep/payouts` (PRD-09)
- Admin shell extensions (no big new pages — existing admin pages
  shift to real DB)

### Out of scope

- Marketplace features (buyer + seller in the same surface) — PRD-10
  Phase 5 territory
- Multi-tenant SaaS (we're still a single Unite Medical tenant)
- Self-serve enterprise procurement integration (PunchOut / cXML /
  OCI — original site PRD §3.1 forbids claiming these; build only
  if a contract demands)

---

## 4. Data model

```sql
-- orgs (existing 'organizations' table)
ALTER TABLE organizations ADD COLUMN dea_number TEXT;
ALTER TABLE organizations ADD COLUMN npi_number TEXT;
ALTER TABLE organizations ADD COLUMN tax_exempt_status TEXT;
ALTER TABLE organizations ADD COLUMN account_rep_user_id TEXT;
ALTER TABLE organizations ADD COLUMN credit_limit NUMERIC(10,2);
ALTER TABLE organizations ADD COLUMN payment_terms TEXT;
-- ...etc; matches HubSpot custom properties from PRD-06

-- users x orgs (many-to-many via existing 'organization_users')
-- columns: user_id, org_id, role_in_org (admin/buyer/viewer), invited_at

-- catalog gating
CREATE TABLE catalog_visibility (
  sku             TEXT NOT NULL,
  segment         TEXT NOT NULL,  -- 'asc' / 'pharmacy' / etc.
  visible         BOOLEAN DEFAULT TRUE,
  reason          TEXT,
  PRIMARY KEY (sku, segment)
);

-- tier pricing
CREATE TABLE tier_pricing (
  sku             TEXT NOT NULL,
  tier            TEXT NOT NULL,  -- 'A' / 'B' / 'C' / 'distributor' / 'gov'
  price           NUMERIC(10,2) NOT NULL,
  effective_from  DATE,
  effective_to    DATE,
  PRIMARY KEY (sku, tier, effective_from)
);
```

---

## 5. Workflows

### 5.1 Sign-up

```
1) /register form: org name, contact email, role, segment, expected volume
2) Server calls evaluateAccount(application)
3) AUTO_APPROVE path:
   - Clerk user + org created
   - Stripe customer created (PRD-09)
   - Terms: 'card' (CC-only by default)
   - Welcome email
4) MANUAL_REVIEW path:
   - 'pending' status
   - HubSpot Lead created in 'Manual Review' stage
   - Rep notified
   - User sees "we'll be in touch in 24-48h"
5) On approval (rep): user can log in; same flow as AUTO_APPROVE
6) Credit terms apply via a separate credit application (a doc upload
   + reference forms — manual review for v1)
```

### 5.2 Catalog gating

```
On every catalog/PDP request:
    user.segment loaded from org
    products filtered: visible = TRUE in catalog_visibility for user.segment
                       OR no row exists (default = visible)
    price displayed: lookup in tier_pricing for user.org.tier
                    fallback: products.price (list)
```

### 5.3 Org-level user management

- Org admin can invite teammates by email, set role within org
- Teammates can place orders on the org's credit/account
- Audit log per order: which user placed it on behalf of the org

---

## 6. Phases

### Phase 1 — Real auth + org/user model

- Clerk integrated (PRD-01 Phase 3 dependency)
- `organizations` + `organization_users` migrated from localStorage to
  Postgres
- Login / register / forgot-password flows on real Clerk

**Exit:** Users persist across browsers/devices. Existing test
accounts continue to work.

### Phase 2 — Account approval

- `/register` posts to API
- `evaluateAccount` runs server-side; HubSpot lead created (PRD-06)
- Email + portal-status routing per outcome

**Exit:** A new registration produces correct outcomes for all 3
paths (auto-approve / manual review / rejection per FDA-equivalent
business rule).

### Phase 3 — Customer dashboard pages

- `/dashboard`, `/account/settings`, `/account/invoices`, `/account/quotes`,
  `/account/team` migrated to real data
- All existing UI in repo (`src/pages/Dashboard.jsx`,
  `src/pages/AccountSettings.jsx`, `src/pages/Invoices.jsx`) is
  already designed — just swap data source

**Exit:** Each page renders real data for a logged-in customer.

### Phase 4 — Tier pricing + catalog gating

- `tier_pricing` + `catalog_visibility` tables seeded
- Catalog + PDP read user.org → resolve price + visibility
- Admin UI in `/admin/products/{sku}` to set per-tier prices + gating

**Exit:** A logged-in A-tier customer sees a different price than a
logged-in C-tier customer on the same SKU. Locksmith uninstalled
from Shopify.

### Phase 5 — Rep portal

- `/rep/*` routes (auth + role=rep)
- Pipeline view backed by HubSpot (PRD-06)
- Connect onboarding for payouts (PRD-09)

**Exit:** All 1099 reps have logged in at least once and see their
accounts.

### Phase 6 — Helium replacement (custom org fields)

- `/admin/customers/{id}` exposes all the custom org fields
- Sync back to HubSpot (PRD-06)
- Helium uninstalled

**Exit:** All custom fields used in DEA verification, tax exemption,
etc. live in our DB; Helium gone.

---

## 7. Verifier

`scripts/portal_check.py` (nightly):

- For 10 random customers, assert their dashboard renders without
  errors using a service-account browse
- Assert no production order placed without a valid `user_id` and
  `organization_id`
- Assert tier pricing is set for all active SKUs in all 5 tiers (or
  has a documented fallback)

---

## 8. Open questions

1. **Self-serve credit application**: do we build a real form or
   keep it a doc-upload + manual? Default: doc upload + manual for
   v1; revisit in 6 months.
2. **SSO for big customers**: hospitals often want SAML/OIDC. Clerk
   supports it. Defer to a customer-driven phase.
3. **Catalog visibility default**: opt-in or opt-out? Default:
   opt-out (everything visible to all segments unless explicitly
   restricted).
4. **Guest checkout**: do we allow non-logged-in orders for small
   one-off purchases? Default: no — every order ties to an org for
   compliance traceability.

---

## 9. Out-of-band

- Clerk Pro plan (PRD-01)
- One-time data migration: existing Shopify customers → our DB +
  Clerk (their next login provisions them automatically; OR send a
  password-reset blast)
- New env vars: covered by PRD-01

---

## 10. Definition of done

- Locksmith + Helium Customer Fields + AAA Custom Form Builder all
  uninstalled
- Every customer sees their own pricing + their own gated catalog
- 1099 reps work entirely out of `/rep/*` and HubSpot
- Account approval workflow handles all 3 outcomes correctly
- No legitimate user reports being unable to log in for 30 days
  consecutive
