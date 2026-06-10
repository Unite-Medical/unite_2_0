# PRD-13 — SSR / SEO Hardening

**Source:** CTO Brief §10 (Frontend), original `docs/PRD.md` §0 (SEO equity)
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01 (Platform decisions; API base URL set)
**Blocks:** nothing critical, but PROTECTS the #1 PDAC Google ranking

> "Ship the rebuilt site without burning the unitemedical.net SEO
> equity (especially #1 rank for 'PDAC consulting')." — Original PRD §0

---

## 1. North star

Search engines see a fully rendered HTML page for every URL on
`unitemedical.net`. Core Web Vitals score green. PDAC consulting,
medical supply distribution, and the other SEO-bearing pages keep
or improve their rankings.

---

## 2. Current state

- Frontend is Vite + React Router 7 (SPA)
- Search bots see `<div id="root"></div>` and execute JS to fill it
- Google indexes SPAs but it is slower, less reliable, and lower
  ranked than SSR for the same content
- The audit flagged this as the **biggest architecture mismatch with
  the brief** — brief §10 explicitly recommends Next.js with SSR
- `useSEO` hook sets meta tags client-side after hydration — works
  for users, marginal for bots, useless for social-card scrapers
  that don't run JS (Twitter Card preview, OpenGraph crawlers)

---

## 3. Scope

### In scope — one of two paths (decide in Phase 1)

#### Path A — Migrate to Next.js (preferred per brief)

- Move the marketing surface (~22 routes) to Next.js App Router
- All marketing pages are React Server Components by default
- API calls to `api.unitemedical.net` (PRD-01) wrapped in Next.js
  data fetching (`fetch()` with cache control)
- Keep the existing Vite app *only* for `/admin` (internal, doesn't
  need SEO) — eventually unify, but not required for v1

#### Path B — Prerender + static export from Vite

- Use `vite-plugin-ssr` or `vite-plugin-prerender` to generate static
  HTML for the ~22 marketing routes at build time
- Hydration unchanged
- Cheaper, lower risk than full Next.js migration; protects SEO
- Limits: no per-request server logic (fine for marketing; admin
  pages stay SPA)

Recommendation: **Path A** because PRD-08 (customer-facing quoting)
and PRD-14 (B2B portal) will eventually want SSR for personalization
+ auth-aware rendering. Doing Next.js once is cheaper than later
double-migration.

### Out of scope

- Migrating `/admin/*` pages — they're SPA, that's correct (auth-
  gated, no SEO need)
- Replacing the design system or visual design (the brand and the
  page copy stay identical)

---

## 4. Pages by SEO priority

| Priority | Route | Why |
|---|---|---|
| #1 | `/services/pdac` | Currently ranks #1 for "PDAC consulting"; ABSOLUTE no-regression |
| #1 | `/` | Brand traffic; commercial intent |
| #2 | `/services/distribution` | "wholesale medical supply distribution" terms |
| #2 | `/government` | "VA medical supply" / "SDVOSB medical" |
| #2 | `/services/distributors` | Distributor program SEO |
| #2 | `/about` | Brand + founder story |
| #3 | `/locations` | Local SEO (Lithia Springs GA, Nevada) |
| #3 | `/segments/*` | Long-tail medical segment terms |
| #3 | `/blog` + posts | Topical authority (when content lands per ALEX_THINGS #6) |
| Low | `/contact`, `/support`, `/careers`, `/portfolio`, `/legal/*` | Transactional / informational |

The Priority #1 routes are where regression would hurt most. Phase 1
ships those.

---

## 5. Migration steps (Path A — Next.js)

### Phase 1 — Next.js app skeleton + priority #1 routes

- New `apps/web-next` in monorepo (Path A) — Vite app stays alive
  during cutover
- Migrate routes in dependency order:
  1. `/` (Homepage)
  2. `/services/pdac` (THE rank we cannot lose)
  3. `/services/distribution`
  4. `/about`
  5. `/government`
- Vercel routes a subset of paths to the Next.js app via
  `vercel.json` rewrites; everything else stays Vite
- Identical visual + copy output (run a screenshot diff)
- `useSEO` calls replaced with Next.js metadata exports (RSC pattern)

**Exit:** All 5 routes server-render on Vercel. Lighthouse SEO 100,
no CLS regression. `view-source:` shows full HTML.

### Phase 2 — Remaining marketing routes

- Migrate the rest: catalog, product detail, segments, services
  subpages, legal, blog, etc.
- Catalog page: server-fetch from Shopify Storefront API → cached
- Vite app retained only for `/admin/*` and `/cart`+`/checkout`
  (which need client-side state)

**Exit:** Every marketing route is SSR. Vite app serves only auth-
gated + checkout paths.

### Phase 3 — Sitemap + structured data

- `app/sitemap.ts` generates `sitemap.xml` from the route list +
  blog post DB
- JSON-LD: `Organization`, `BreadcrumbList`, `Product`,
  `FAQPage`, `Article` per applicable page
- `robots.txt` checked in

**Exit:** Google Search Console picks up the new sitemap. No
indexation errors.

### Phase 4 — Performance budget

- Lighthouse CI in GitHub Actions on every PR
- Budgets: LCP < 2.0s, CLS < 0.1, INP < 200ms
- PR fails if any budget regresses by > 10%

**Exit:** Production Web Vitals across the priority pages are in the
"green" band for both desktop and mobile (Field Data via CrUX).

### Phase 5 — Cutover + monitor SEO

- Switch DNS / Vercel routing so Next.js serves 100% of marketing
  traffic
- Vite app retired from `/` to `/blog/*`; lives only at `/admin/*`,
  `/cart`, `/checkout`
- Monitor Google Search Console daily for 30 days post-cutover
  - Watch impressions + clicks for the priority terms
  - Watch crawl errors
  - Re-submit sitemaps if needed

**Exit:** 30 days post-cutover, no priority term has dropped > 1
position in Search Console.

---

## 6. Migration steps (Path B — Vite prerender, if Path A is rejected)

- Add `vite-plugin-ssr` to the Vite build
- Configure prerender list = all 22 marketing routes
- `useSEO` calls run server-side; output goes into the HTML
- `npm run build` produces real HTML files for every route

**Effort:** ~30% of Path A
**Limits:** no per-request SSR; can't personalize marketing pages by
auth state.

Pick Path A unless we're cost/time constrained AND there's no plan
to personalize marketing pages.

---

## 7. Verifier

`scripts/seo_check.py` (nightly):

- For every priority route, fetch `view-source:` and assert
  expected content is in the raw HTML (not requiring JS)
- Assert sitemap.xml contains all expected URLs
- Lighthouse run via Vercel Speed Insights / WebPageTest API; alert
  on score regression

---

## 8. Open questions

1. **Path A vs. Path B**: Damon's call (cost/time vs. flexibility).
   Recommend A.
2. **Catalog SSR**: do we render the full product catalog server-side
   or hybrid? Default: top categories + landing pages SSR; deep
   product detail can SSG + ISR (incremental static regeneration).
3. **Shopify Storefront API source of truth** for catalog: stays as
   today, even after PRD-04 (Cin7 is the WMS, Shopify is the
   commerce engine for v1).
4. **A/B for SEO**: any redirect changes from PRD-00 etc. should
   maintain 301 chain integrity. Already handled in vercel.json
   from the original PRD.

---

## 9. Out-of-band

- Vercel: Next.js project provisioned (free upgrade from current)
- Google Search Console access for monitoring
- Lighthouse CI account (free)
- WebPageTest API key (optional but useful for budget alerts)

---

## 10. Definition of done

- Every marketing route server-renders
- PDAC consulting rank preserved (no drop > 1 position) for 30 days
  post-cutover
- Lighthouse SEO 100 + Core Web Vitals green across the priority
  routes
- Verifier passing nightly
- Vite app serves only `/admin/*` + checkout (or is fully retired if
  PRD-14 migrates auth-gated pages to Next.js too)
