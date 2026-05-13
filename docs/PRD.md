# Unite Medical 2.0 — Site Rebuild PRD

**Source spec:** `Unite_CTO_Site_Document.md` (Damon → Alex, May 2026)
**Owner:** Alex (CTO)
**Status:** Active — pre-launch
**Repo:** `unite_2_0` (Vite + React 19 + React Router 7)

> This PRD is the engineering plan that translates the CTO spec into shippable
> phases. Every phase ends with a verifier (`scripts/phase_check.py`) that
> fails the build if any forbidden string survives or any required redirect
> is missing.

---

## 0. North star

Ship the rebuilt Unite Medical marketing + commerce site **without burning
the `unitemedical.net` SEO equity** (especially the #1 Google rank for
"PDAC consulting"), and **without exposing internal tooling, fake stats, or
unsupported certification claims** in production.

Three success criteria:

1. **SEO:** every legacy URL 301-redirects to its new counterpart at the
   edge (Vercel), and the PDAC page keeps its target keywords intact.
2. **Truthfulness:** no `VOSB`, `SDVOSB`, `MSPV BPA`, `12,400 SKUs`, `48-hr`,
   `Dallas`, `ShipStation`, `Flexport`, `Claude`, `OpenFDA`, `Big 3`, fake
   testimonials, or fake stats anywhere in customer-facing code.
3. **Correctness:** real BPA number, CAGE, phone (`833.868.6483`), founding
   year (2019), bio (8 yrs Alabama Army National Guard, MOS 13E/13P), and
   warehouse count (2: GA + NV) appear consistently everywhere.

---

## 1. Scope

### In scope (this PRD)

- Global utility bar + footer rewrite
- Codebase-wide string normalization (credentials, phone, email domains,
  internal tooling, bio facts, certification claims)
- Routing changes + Vercel 301 redirects
- Page content rewrites across all 22 site routes
- 3 net-new pages: `/government`, `/services/private-label`,
  `/case-studies/tjs`
- Renamed pages: `/services/dealer` → `/services/distributors`,
  `/about/veteran-owned` → `/procurement`
- New data files: testimonials, FAQ JSON-LD, lot-tracking schema (SQL)
- Account-approval scoring helper (`src/lib/accountApproval.js`)
- Sitemap + `index.html` meta cleanup
- Automated phase verifier (`scripts/phase_check.py`)

### Out of scope (separate work)

- TJS site fix at `tjs.unitemedical.net` (different repo)
- Quoting Engine backend rebuild (covered by
  `Unite_Quoting_Engine_Spec.md`) — this PRD only **sanitizes the existing
  `/quote` page** to remove proprietary leakage
- Sourcing real logo SVGs for the 8 new partners (asset task)
- Sourcing real warehouse sqft + dynamic Shopify SKU count (waiting on
  Alex; placeholder copy used in the interim)
- Blog content from Jill — pages render but the placeholder posts are
  removed

---

## 2. Phases

Each phase has explicit exit criteria, all of which are checked by
`scripts/phase_check.py`. Phase N may not start until Phase N-1's checks
all pass.

| Phase | Title | Verifier focus |
|---|---|---|
| 1 | Global string replacements + layout | Forbidden strings absent · UtilityBar + Footer use new copy |
| 2 | Routes + redirects | Vercel redirects present · new routes mounted · sitemap regenerated |
| 3 | Page content rewrites | Required copy present on each page · removed copy gone |
| 4 | New pages + features | TJS case study, Government, Private Label render · testimonials data file · lot-tracking schema file · accountApproval helper |
| 5 | Final verification | `npm run lint` clean · `npm run build` succeeds · phase_check.py reports 0 violations across all phases |

---

## 3. Phase 1 — Global replacements & layout

### 3.1 Forbidden strings (deletion / replacement)

| Forbidden | Replacement | Notes |
|---|---|---|
| `36C24123A0077` | `36F79725D0203` | new BPA |
| `MSPV BPA` | `BPA` | label only |
| `(678) 555-0142`/`-0180`/`-0219`/`-0255`/`-0277` | `833.868.6483` | display |
| `6785550142`/`-0180`/`-0219`/`-0255`/`-0277` | `8338686483` | tel: hrefs |
| `VOSB` / `SDVOSB` (self-claims) | *delete* | no SBA cert |
| `EST. 2018` | `EST. 2019` | |
| `HCPC` (no trailing S) | `HCPCS` | |
| `FOB Atlanta` | `FOB Georgia` | |
| `12,400 SKUs` / `12,400` (SKU context) | `Browse products` | placeholder until Shopify API hookup |
| `48 hr` / `48-hr` / `48 hours` (shipping) | `Same-day shipping · Orders before 2pm EST, M-F` | |
| `4 DCs` / `4 distribution centers` / `4 DOMESTIC WAREHOUSES` | `2 US warehouses` | |
| `3 COASTS` / `three time zones` | *delete* | |
| `Atlanta, Reno, Dallas` / `Atlanta, Reno, and Dallas` | `Georgia & Nevada` | |
| `Dallas, TX` (warehouse context) | *delete* | does not exist |
| `Net-30 standard` / `net 30` (unqualified) | `Net-30 with approved credit` | |
| `14 days` (onboarding) | `24-48 hours` | |
| `PunchOut` / `cXML` / `OCI` | *delete* | not offered |
| `ShipStation` / `QBO` / `QuickBooks` | *delete* | internal tools |
| `Flexport` (customer-facing) | *delete* | |
| `22 years` / `22-year` / `two decades` (military) | `8 years` | |
| `U.S. Army` (Damon) | `Alabama Army National Guard` | |
| `Army logistics officer` | *delete / rewrite* | MOS 13E/13P |
| `Big 3 can't serve` / `Big-3` | *delete / soften* | |
| `sales@unitemedical.com` / `support@unitemedical.com` / `gov@unitemedical.com` / `dealers@unitemedical.com` / `vendors@unitemedical.com` | `.net` equivalent (gov + vendors → `info@`, dealers → `sales@`) | |

### 3.2 Utility bar (`Nav.jsx`)

- Desktop bar: `FDA · 3015727296 / BPA · 36F79725D0203 / CAGE · 8MK70 /
  Veteran-Owned · Lithia Springs, GA / ADMIN / Sales · 833.868.6483`
- Mobile bar: same compact format with the new phone
- Search button placeholder: `"Search products"` (no SKU count)

### 3.3 Footer (`Footer.jsx`)

- Tagline: drop "Big 3 can't serve well", keep
  `"Veteran-owned wholesale medical supply."`
- Credential line: `FDA 3015727296 · CAGE 8MK70 · DUNS 117553945`
  (no `VOSB`)
- Column 1 (Services): Distribution, PDAC Consulting, Private Label,
  Distributor Program, Government
- Column 2 (Company): About, Procurement & Diversity, Compliance,
  Locations, Blog, TJS Case Study
- Column 3 (Support): Contact, FAQs, `833.868.6483`,
  `support@unitemedical.net`
- Remove: Education & CEUs, Veteran Owned, Solutions, `View all 12,400 SKUs`
- Catalog column collapsed (links migrated into Services/Support)

### 3.4 Phase 1 exit criteria

`scripts/phase_check.py --phase 1` reports `0 violations`.

---

## 4. Phase 2 — Routes & redirects

### 4.1 Vercel `vercel.json` redirects

Server-side 301s (no client-side `<Navigate>` for SEO-bearing URLs):

```
/pages/pdac-consulting        → /services/pdac
/pages/about-us               → /about
/pages/contact-us             → /contact
/pages/dealer-program         → /services/distributors
/pages/private-labeling       → /services/private-label
/pages/pdac-approval-letters  → /services/pdac
/blogs/orthopedic-insights    → /blog
/collections/*                → /catalog
/solutions                    → /services
/services/education           → /blog          (Open Q #1)
/services/dealer              → /services/distributors
/about/veteran-owned          → /procurement
/segments/gov                 → /government
```

### 4.2 React Router

- Remove `/solutions/*` Navigate children (now redirected by Vercel).
- Mount new routes:
  - `/government` → `Government.jsx`
  - `/services/private-label` → `ServicePrivateLabel.jsx`
  - `/services/distributors` → `ServiceDistributors.jsx`
    (`ServiceDealer.jsx` stays as a compatibility export)
  - `/case-studies/tjs` → `CaseStudyTJS.jsx`
- Keep `/about/veteran-owned`, `/services/dealer`, `/segments/gov`,
  `/services/education`, `/solutions` mounted as React fallbacks (Vercel
  edge handles SEO; React handles dev/preview).

### 4.3 Sitemap

- Regenerate `public/sitemap.xml` from the new route list (22 core +
  `/case-studies/tjs`). Drop killed URLs.

### 4.4 Phase 2 exit criteria

`scripts/phase_check.py --phase 2` validates:

- every required entry exists in `vercel.json`
- every new route is reachable from `App.jsx`
- `public/sitemap.xml` contains the new URLs and is missing the killed ones

---

## 5. Phase 3 — Page content rewrites

For each page below, the verifier asserts:

- required new copy is present
- forbidden legacy copy is absent

| Page | New copy snippets verified |
|---|---|
| `/` (Homepage) | "The supply chain your suppliers use." · "Two ways to buy" · "PARTNER SPOTLIGHT" · "Same-day" stat |
| `/about` | "Built on discipline. Driven by demand." · "A letter from Damon" · "Jackie S." |
| `/services` | exactly four `ServiceCard` titles (Distribution & Fulfillment, PDAC Consulting, Quoting & Sourcing, Distributor Program) |
| `/services/distribution` | "Your forward warehouse." · "2 US warehouses" · "98.6% FILL RATE" · "Net-30 with approved credit" |
| `/services/pdac` | "Get your L-codes right the first time." · "HCPCS" · "95%+" · no "180+ submissions" |
| `/services/distributors` | "Your catalog. Our import desk." · 4 ServiceCards · no "Flexport" |
| `/procurement` | "For procurement & diversity officers." · no "22 years Army" · no "VOSB" |
| `/compliance` | "Pursuing ISO 13485 certification." · no "SOC 2" · no "Cold chain" · no "48 SKUs" |
| `/locations` | "Close to every dock." · exactly two `LocationCard`s (GA + NV) · no "Dallas" |
| `/contact` | "Call us. We answer." · dropdown contains "Distributor program", "Document request", "PDAC consulting" · all numbers `833.868.6483` |
| `/support` | corrected FAQ JSON · `FAQPage` JSON-LD emitted |
| `/quote` | no "CORE IP", "Flexport", "Claude", "OpenFDA", "Shanghai", "60% MARGIN", "AI COVER LETTER" |
| `/catalog` | no `12,400 SKUs` in headers |
| `/segments/asc` | "Medical Supply for Ambulatory Surgery Centers" + tag list, no fake stats |
| `/segments/pharmacy` | new H1 + body + tags |
| `/segments/ems` | new H1 + body + tags |
| `/segments/distributors` | new H1 + body + CTA to `/services/distributors` |
| `/segments/gov` (kept as alias) | redirects to `/government` |
| `/blog` | no placeholder titles ("Tariff volatility, Q2 2026", etc.) |

---

## 6. Phase 4 — New pages & features

### 6.1 New pages

- `src/pages/CaseStudyTJS.jsx` mounted at `/case-studies/tjs`
- `src/pages/Government.jsx` mounted at `/government`
- `src/pages/ServicePrivateLabel.jsx` mounted at `/services/private-label`
- `src/pages/ServiceDistributors.jsx` mounted at `/services/distributors`
  (re-exports `ServiceDealer` behavior with corrected copy)

### 6.2 Data + lib

- `src/data/testimonials.js` — exactly the 3 approved testimonials in the
  spec (Sarah C., Kareem H., D.V.), no extra entries
- `src/data/faqs.js` — exactly the 6 FAQs in the spec
- `src/lib/accountApproval.js` — `evaluateAccount(application)` returning
  `'AUTO_APPROVE' | 'MANUAL_REVIEW'` per spec §6.2
- `docs/schema/lot_tracking.sql` — DDL + recall query from spec §7

### 6.3 Open questions surfaced to the user

These remain TODOs (not blockers for the rest of the rebuild):

1. Was `/services/education` intended for blog? (defaulted to `/blog`)
2. Real SKU count (defaulted to "Browse products")
3. Real warehouse sqft (defaulted to `—` placeholder)
4. Was the quoting-engine internal-tooling exposure intentional?
   (defaulted to: scrub everything proprietary)
5. Quoting backend maturity (frontend currently shows generic copy)
6. Blog content from Jill (defaulted to: no placeholder articles)
7. Do document REQUEST buttons function? (defaulted: single contact CTA)
8. Can contact dropdown be extended? (yes — implemented)

---

## 7. Verification (`scripts/phase_check.py`)

Single Python script, no dependencies. Run modes:

```
python3 scripts/phase_check.py            # all phases
python3 scripts/phase_check.py --phase 1  # one phase
python3 scripts/phase_check.py --strict   # fail on warnings too
```

For every phase it returns 0/1, prints a clear PASS/FAIL summary, and
shows the file + line + matched pattern for each violation. CI can call
it after `npm run build`.

---

## 8. Out-of-band assets needed (does not block code)

- 8 partner SVG/PNG logos (Ardent Health, Restore Robotics, Amazon Fresh,
  WellLink, The Resource Group, Orlando Health, UF Health, Total Joint
  Specialists)
- Re-drawn coverage map (2 dots: GA + NV)
- Compliance badge / shield graphic (4 categories)
- Real warehouse sqft per location
- Real Shopify SKU count integration

These are tracked in `docs/partner-logos-spec.md` and §9 of the source
spec. Code paths reference these gracefully with placeholders so the
site ships without them.
