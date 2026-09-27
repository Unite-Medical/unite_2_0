import { cleanUrl, enabledFor, isPublicPath } from './posthog-core.js';

const EVENT_NAMES = { product_view: 'view_item', add_to_cart: 'add_to_cart', begin_checkout: 'begin_checkout', contact_submitted: 'generate_lead', quote_requested: 'generate_lead' };

/** Manual events only. Disable Enhanced Measurement in the GA4 web stream before enabling. */
export function createGoogleAnalytics(transport, config, getLocation, getReferrer = () => '') {
  let initialized = false;
  let lastPage;
  let pageReferrer;
  const eligible = location => Boolean(location && /^G-[A-Z0-9]+$/.test(config.measurementId || '') &&
    enabledFor({ ...config, token: config.measurementId }, location));

  function send(event, properties = {}) {
    const location = getLocation();
    const active = eligible(location);
    transport.disable(!active);
    if (!active) return false;
    let referrer = cleanUrl(getReferrer()) || '';
    if (referrer) {
      const url = new URL(referrer);
      if (url.hostname.endsWith('unitemedical.net') && !isPublicPath(url.pathname)) referrer = '';
    }
    const context = {
      page_location: location.origin + location.pathname,
      // Never derive titles from forms, search terms, or account data.
      page_title: `Unite Medical · ${location.pathname}`,
      page_referrer: pageReferrer || referrer,
    };
    if (!initialized) {
      transport.initialize(config.measurementId, {
        send_page_view: false, allow_google_signals: false,
        allow_ad_personalization_signals: false, cookie_domain: location.hostname,
        cookie_prefix: 'unite_medical',
        ...context,
      });
      initialized = true;
    }
    transport.event(event, { ...context, ...properties, send_to: config.measurementId, site_id: 'unite_medical' });
    return true;
  }

  return {
    capture(event, properties = {}) {
      try {
        if (!Object.hasOwn(EVENT_NAMES, event)) return;
        const safe = {};
        const id = properties.product_id;
        if ((typeof id === 'string' && /^[\w.-]{1,160}$/.test(id)) || (typeof id === 'number' && Number.isFinite(id))) {
          const item = { item_id: String(id) };
          if (Number.isInteger(properties.quantity) && properties.quantity > 0) item.quantity = properties.quantity;
          if (Number.isInteger(properties.value_cents) && properties.value_cents >= 0 && item.quantity) {
            safe.currency = 'USD';
            safe.value = properties.value_cents / 100;
            item.price = safe.value / item.quantity;
          }
          safe.items = [item];
        }
        if (event === 'contact_submitted' || event === 'quote_requested') safe.form_type = event === 'contact_submitted' ? 'contact' : 'quote';
        send(EVENT_NAMES[event], safe);
      } catch { /* Measurement must not interrupt commerce or forms. */ }
    },
    page() {
      try {
        const location = getLocation();
        transport.disable(!eligible(location));
        if (!eligible(location)) { lastPage = undefined; pageReferrer = undefined; return; }
        const page = location.origin + location.pathname;
        // Query-only filter changes and React Strict Mode do not duplicate pageviews.
        if (lastPage === page) return;
        pageReferrer = lastPage;
        if (send('page_view')) {
          lastPage = page;
          if (location.pathname === '/checkout') send('begin_checkout');
        }
      } catch { /* Blocked tags must not break navigation. */ }
    },
  };
}

export function createGoogleTransport(browser, measurementId) {
  function gtag() { browser.dataLayer.push(arguments); }
  return {
    disable(disabled) { if (measurementId) browser[`ga-disable-${measurementId}`] = disabled; },
    initialize(id, options) {
      browser.dataLayer = browser.dataLayer || [];
      browser.gtag = gtag;
      gtag('js', new Date());
      gtag('config', id, options);
      const script = browser.document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      browser.document.head.appendChild(script);
    },
    event(name, properties) {
      // Apply scrubbed page context to subsequent automatic lifecycle events too.
      gtag('set', { page_location: properties.page_location, page_title: properties.page_title, page_referrer: properties.page_referrer });
      gtag('event', name, properties);
    },
  };
}
