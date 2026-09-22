# Unite Medical analytics

The **new Unite 2.0 site** uses [PostHog project 622766](https://us.posthog.com/project/622766/home). TJS uses separate project 622798 and a different token. This integration does not modify the current Shopify storefront.

## Deployment

Configured on the existing Vercel project **unite-2-0**, Production only:

- `VITE_UNITE_POSTHOG_KEY`: Unite Medical's public project token, stored in Vercel, not source control.
- `VITE_UNITE_POSTHOG_HOST=https://us.i.posthog.com`
- `VITE_UNITE_ANALYTICS_ENABLED=true`

The code must be merged and built/deployed before visitor tracking becomes active. Vite embeds these public settings at build time. Tracking is restricted to the stable production alias `unite-2-0.vercel.app` and the future production domains `unitemedical.net` / `www.unitemedical.net`. Local development, branch previews, `staging.unitemedical.net`, TJS and internal routes are excluded. No production deployment or merge is included in this PR.

## Events

- `$pageview`: public route changes, including query navigation, with query strings removed from transmitted URLs. Duplicate React Strict Mode effects are suppressed.
- `product_view`: a real catalog product loads.
- `add_to_cart`: the cart store successfully adds or increases a product.
- `begin_checkout`: visitor opens the public checkout route.
- `contact_submitted`: existing contact workflow completes.
- `quote_requested`: existing quote request workflow completes.

All events have `site_id=unite_medical` and `brand=Unite Medical`. Only product IDs, quantities, cent values and a form-type field are allowed as custom properties. No names, emails, messages, organization details, account/order identifiers or quote tokens are passed. Existing demo/local order creation is deliberately not reported as a paid purchase.

Session recordings, autocapture, heatmaps, exception capture, person profiles and geolocation processing are disabled. Identity cookies remain host-scoped. No identity is shared with TJS. Admin, account, portal, order and token-bearing quote routes are excluded by an allowlist of public routes. SDK failures cannot block cart or form actions.

## Verification

`npm test` passes all 54 tests, including six analytics isolation/transport tests. `npm run build` passes and prerenders 122 routes. Targeted lint passes. One diagnostic `analytics_setup_test` event with no customer information was accepted with HTTP 200.

After deploying, verify navigation and commerce events in project 622766, and confirm no events from TJS or staging appear. Form submission tests should use a controlled test workflow because the existing forms send real email when their services are configured. No forms or purchases were submitted during this implementation.
