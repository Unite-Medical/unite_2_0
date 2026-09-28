# Public site performance and sharing

Public routes render immediately instead of waiting for `/api/auth/session` and the admin database snapshot. Protected pages and authentication forms still wait for startup. Staff screens, PDF import, 3D warehouse tools, barcode scanning and analytics are excluded from the initial script payload. Archivo and IBM Plex Mono are self-hosted.

Initial HTML script/module-preload payload measured from production builds: **2,776,909 → 671,506 bytes** (75.8% reduction, uncompressed). The new initial payload is 155,421 bytes gzipped. These are bundle measurements, not a claim about field Core Web Vitals.

The shared metadata registry emits titles, descriptions, canonical URLs, Open Graph/Twitter cards, image dimensions and alternative text before JavaScript. It covers 36 marketing routes, Quick Quote and 118 public products. The sitemap includes the 118-product public catalog rather than the older 88-product source. Organization and product schemas omit invented telephone numbers, founding dates and aggregate ratings. Public product metadata never exposes account prices.

155 original branded 1200 × 630 JPEG compositions use existing approved page/product artwork. Generate with `SHARP_MODULE=/path/to/sharp node scripts/generate_social_cards.mjs`; generated files are checked in, so builds need no image-generation dependency. Bump the social image version when replacing published artwork because assets use immutable caching.

Staging HTML and response headers remain noindex. Production canonical URLs stay on unitemedical.net; preview images use the deployment environment's public host. Account/utility routes are noindex and use a separate workspace HTML shell. Missing public pages and assets return 404; known legacy routes redirect to their canonical pages.

Validation: 588 unit tests pass, 3 skipped; changed-file ESLint passes; production build and assistant-connection checks pass. `scripts/audit_public_seo.mjs` validates all 155 generated pages/cards and the initial bundle budget. Browser regressions cover pending session/admin sync, protected route startup, authentication startup, all 118 products, filters, variants, quoting validation/retries/review, sourcing, both editorial scroll films, reduced motion, media failure and layouts from 360–1440px. Form/API requests in those tests are isolated from external writes.

Live staging checks cover crawler-visible metadata, card content types, sitemap, punctuation-bearing SKUs, redirects and true 404s. The canonical production site has not been deployed by this change.
