# Unite 2.0 analytics and search launch

## Current status

- PostHog is implemented in this PR for Unite project **622766**, separate from TJS project **622798**. Its production Vercel variables were configured previously. Tracking requires this code to be merged and deployed; it is not installed on the existing Shopify site. See [POSTHOG.md](POSTHOG.md).
- Google Analytics 4 (GA4) is the current Google Analytics integration. The code is ready but **disabled by default**, pending Unite's real web-stream Measurement ID and account configuration. No Google Tag Manager container or duplicate Google Analytics installation is needed.
- Search Console launch plumbing is ready: canonical sitemap generated on every build, existing robots sitemap declaration, prerendered canonical metadata, and optional verification meta tag. This does **not** mean Google ownership is verified, a sitemap is submitted, or pages are indexed.
- The current Shopify production site and DNS are unchanged. Do not submit the new sitemap until Unite 2.0 is serving the production domain.

## Google Analytics account setup

1. Use the existing Unite property/web stream if one already tracks `https://unitemedical.net`, preserving history. Otherwise create a Unite Medical GA4 property and web stream for that URL. Keep TJS in its own property. Obtain the public Measurement ID (`G-…`), not an API secret.
2. In the Unite web stream, **turn Enhanced Measurement OFF before activating this integration**. We send pageviews and successful form events manually. History-based pageviews, form interaction collection, and site-search collection would duplicate events or bypass the route/data exclusions. `send_page_view: false` alone does not disable history-based Enhanced Measurement.
3. Keep Google signals, advertising personalization, user-provided data collection, and cross-domain measurement off. Check any account-level tag destinations or extra tags so Unite events are not forwarded to TJS.
4. Set only in the `unite-2-0` Vercel **Production** environment:

   ```text
   VITE_UNITE_GA4_ID=G-<actual Unite Measurement ID>
   VITE_UNITE_GA4_ENABLED=true
   ```

5. Deploy the reviewed code when Unite 2.0 is ready. These are build-time variables; changes require a rebuild. Leave the switch false until the account settings and launch privacy/consent requirements have been reviewed. This change does not add a consent-management platform.

## Measurement scope

Both integrations use the existing public-page and approved-host boundaries: `unitemedical.net`, `www.unitemedical.net`, and the stable `unite-2-0.vercel.app` production host. Localhost, ephemeral previews, TJS, and internal/account/order/quote-token pages are excluded. GA is disabled when navigating to excluded routes. Unite uses a dedicated GA cookie prefix to avoid reusing another site's cookies.

| Site action | PostHog | GA4 |
| --- | --- | --- |
| Public page navigation | `$pageview` | `page_view` |
| View product | `product_view` | `view_item` |
| Add product to cart | `add_to_cart` | `add_to_cart` with item ID, quantity, USD value |
| Open checkout | `begin_checkout` | `begin_checkout` (no cart totals/items yet) |
| Successful contact submission | `contact_submitted` | `generate_lead`, `form_type=contact` |
| Successful quote request | `quote_requested` | `generate_lead`, `form_type=quote` |

No purchase event is emitted: an order record is not proof of payment. Add purchase measurement only when the payment-confirmation workflow is real, with transaction deduplication.

GA page locations/referrers omit queries and fragments. Titles are stable route labels rather than text derived from forms or search. Queries/UTM attribution are intentionally not sent by this manual setup. Contact fields, quote text, addresses, customer identifiers, and account data are not event properties. No new session replay, advertising, or automatic form collection is enabled.

## Search Console

Prefer an existing verified `unitemedical.net` Domain property. Preserve its DNS verification record during the hosting cutover; changing hosts does not require a new property. Domain properties cover subdomains including TJS, so filter reports by `https://unitemedical.net/` or use a separate URL-prefix property when comparing Unite and TJS.

For a **URL-prefix** property using HTML-tag verification, set the `content` token (not the full tag) as the Production build variable `GOOGLE_SITE_VERIFICATION`. The build inserts it into the initial HTML head, including prerendered pages. Leave it blank for DNS verification. Never remove an existing verification file/tag/TXT record without checking which owner depends on it.

At domain launch:

1. Keep existing Shopify URL redirects and map any additional high-traffic legacy URLs before switching hosting.
2. Verify the live homepage's canonical URL and verification tag, and that `/robots.txt` and `/sitemap.xml` return their actual files rather than the SPA HTML.
3. Submit `https://unitemedical.net/sitemap.xml` in the Unite Search Console property.
4. Use URL Inspection → Test live URL for the homepage, catalog, and a product, then request indexing for key pages. Indexing is not immediate or guaranteed.
5. Link the verified property to the Unite GA4 property in GA Admin → Product links → Search Console links.
6. Keep deployment previews out of search with Vercel deployment protection or `X-Robots-Tag: noindex`; verify this before public launch. Robots exclusions are not access controls.

The sitemap comes from the same static routes and catalog as prerendering. Filtered catalog URLs, private pages, and the old commented placeholder article are excluded. No fabricated `lastmod` dates are emitted. Published blog articles must be added to the shared route metadata when available. `node scripts/sitemap.mjs` refreshes the checked-in public copy; every production build generates a fresh `dist/sitemap.xml` automatically.

## Verify after activation

1. Use an ordinary browser without a tracking blocker on the approved production host. Open catalog → product → add to cart → checkout. No purchase is needed.
2. In GA4 Realtime, confirm these events. With Google Tag Assistant, enable debug mode and use DebugView to inspect one pageview per pathname navigation and the item/quantity/value on `add_to_cart`.
3. Confirm the collection requests target the Unite Measurement ID, never TJS, and contain no URL query strings or entered form content.
4. Navigate to an account/admin page and confirm no further GA collection requests originate there; return to catalog and confirm tracking resumes. Test localhost/preview separately and confirm no Google tag loads there.
5. In PostHog project 622766, check the same public events and `site_id=unite_medical`. TJS events should remain in 622798.
6. Test form conversion events only with a clearly identified test submission because the actual forms can notify the business. Do not mark an unsubmitted test as a real lead.

## References

- [Google: manual pageviews and Enhanced Measurement](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Google: privacy controls and disabling measurement](https://developers.google.com/tag-platform/security/guides/privacy)
- [Google: Search Console ownership verification](https://support.google.com/webmasters/answer/9008080)
- [Google: sitemap guidelines](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
