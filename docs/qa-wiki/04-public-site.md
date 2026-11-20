# 4. Public site test script (anonymous visitor)

Target: https://staging.unitemedical.net (signed out, private window). Run each on **desktop (1440px)** and **mobile (390px)**. Compare tone/content against https://www.unitemedical.net (current Shopify).

| ID | Test | Steps | Expected |
|---|---|---|---|
| PUB-01 | Home | Open `/` | Loads < 3 s, hero + CTAs (browse catalog, request quote) work, no console errors, no placeholder/lorem text |
| PUB-02 | Header & footer nav | Click every header/footer link | Every link resolves (no 404), correct page title, footer contact info/phone/address correct |
| PUB-03 | Content pages | `/about` `/services` `/robotics` `/diagnostics` `/government` `/procurement` `/contact` `/support` `/locations` `/careers` `/compliance` `/resources` `/blog` + one `/blog/:slug` | Copy accurate, no internal notes, images load, claims (certifications, contract vehicles, locations) are true — **business sign-off required** |
| PUB-04 | Legal | `/privacy` `/terms` `/returns` `/shipping` | Present, current, match Unite policy — **legal sign-off required** |
| PUB-05 | Catalog browse | `/catalog`; use categories, search, filters, sort | Results correct, 118 products in current snapshot, **no contract prices shown signed-out**, empty-search state is friendly |
| PUB-06 | Product page | Open 5 products across categories | Images, title, SKU/UDI/HCPCS where shown, pack sizes, "request quote / sign in for pricing" CTA, no internal cost |
| PUB-07 | Quick quote | `/quote` → add items → submit with a **test mailbox** | Confirmation shown; inquiry appears in `/staff/inquiries` for Sales; any email goes only to test address |
| PUB-08 | Contact / inquiry form | `/contact` submit | Validation on required fields; success message; record lands in Inquiries |
| PUB-09 | WellLink / RegeniCool landing | `/welllink`, `/regenicool` | Copy and pricing approved; CTAs work |
| PUB-10 | Surplus marketplace | `/surplus` | Listings render; inquiry CTA routes to staff |
| PUB-11 | Register | `/register` (or "Create account") with a test business email | Account created as **pending**; message explains review; no prices visible after login (see CUS-01) |
| PUB-12 | Login page | `/login` — wrong password, unknown email, empty fields | Generic error (no account enumeration); "forgot password" link present |
| PUB-13 | Forgot password | Request reset for unknown + known test email | Same generic response for both; reset email arrives only for known; link single-use & expires |
| PUB-14 | Legacy Shopify redirects | `/pages/about-us`, `/collections/anything`, `/products/<old-shopify-handle>` | 308 → new equivalents (verified for the first two on 2026-11-16) — needed so Google/bookmarks survive cutover |
| PUB-15 | SEO basics | View source on 5 pages; `/sitemap.xml`; `/robots.txt` | Unique `<title>`/meta description, canonical points to production domain, sitemap lists real routes. Staging must stay `noindex` (it does); **production must not** |
| PUB-16 | 404 | `/this-does-not-exist` | Branded 404 with way home |
| PUB-17 | Protected route while signed out | `/dashboard`, `/work`, `/admin` | Redirect to `/login?next=…`, then back to target after login |
| PUB-18 | Performance & a11y | Lighthouse mobile on `/`, `/catalog`, one product | Perf ≥ 80, A11y ≥ 90, no layout shift on hero; keyboard-only nav works; images have alt text |
| PUB-19 | Cross-browser | Safari iOS, Chrome Android, Edge desktop | No layout breaks on header, catalog grid, product page, forms |
