const PUBLIC_PAGES = new Set(['/', '/catalog', '/cart', '/checkout', '/quote', '/quote/engine', '/surplus', '/surplus/market', '/shortage-list', '/supply-risk', '/about', '/compliance', '/careers', '/portfolio', '/procurement', '/government', '/contact', '/support', '/locations', '/blog', '/resources', '/privacy', '/terms', '/returns', '/shipping', '/services', '/robotics', '/diagnostics']);
const HOSTS = new Set(['unite-2-0.vercel.app', 'unitemedical.net', 'www.unitemedical.net']);
const EVENTS = new Set(['$pageview', 'product_view', 'add_to_cart', 'begin_checkout', 'contact_submitted', 'quote_requested']);
const PROPERTIES = new Set(['product_id', 'quantity', 'value_cents', 'form_type']);

export function isPublicPath(path) {
  return PUBLIC_PAGES.has(path) || /^\/(products|blog|services|segments|resources|case-studies)\/[^/]+\/?$/.test(path);
}
export function enabledFor(config, location) {
  return Boolean(config.token && config.enabled === 'true' && config.production && HOSTS.has(location.hostname) && isPublicPath(location.pathname));
}
export function cleanUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin + url.pathname : undefined;
  } catch { return undefined; }
}
export function cleanProperties(properties, location) {
  const result = { ...properties };
  for (const key of Object.keys(result)) {
    if (/url|referrer/i.test(key)) {
      const value = cleanUrl(result[key]);
      if (value) result[key] = value; else delete result[key];
    }
    if (/email|name|search|query|authorization/i.test(key) && !['$pathname', '$os_name', '$browser_name'].includes(key)) delete result[key];
    if (['$set', '$set_once', '$initial_person_info'].includes(key)) delete result[key];
  }
  return { ...result, $current_url: location.origin + location.pathname, $pathname: location.pathname, site_id: 'unite_medical', brand: 'Unite Medical', $process_person_profile: false, $geoip_disable: true };
}

/** SDK boundary kept injectable so isolation and navigation can be verified offline. */
export function createUniteAnalytics(client, config, getLocation) {
  let initialized = false;
  let lastPage;
  const capture = (event, properties = {}) => {
    try {
      const location = getLocation();
      if (!EVENTS.has(event) || !location || !enabledFor(config, location)) return;
      if (!initialized) {
        client.init(config.token, {
          api_host: config.host || 'https://us.i.posthog.com', ui_host: 'https://us.posthog.com',
          capture_pageview: false, capture_pageleave: false, autocapture: false,
          capture_exceptions: false, capture_performance: false, capture_heatmaps: false,
          disable_session_recording: true, disable_surveys: true,
          person_profiles: 'never', cross_subdomain_cookie: false, ip: false,
          mask_personal_data_properties: true,
          before_send: event => {
            const current = getLocation();
            if (!event || !current || !enabledFor(config, current)) return null;
            event.properties = cleanProperties(event.properties, current);
            return event;
          },
        });
        initialized = true;
      }
      const safe = { site_id: 'unite_medical', brand: 'Unite Medical' };
      for (const [key, value] of Object.entries(properties)) {
        if (PROPERTIES.has(key) && ((typeof value === 'string' && value.length <= 160) || (typeof value === 'number' && Number.isFinite(value)))) safe[key] = value;
      }
      client.capture(event, safe);
    } catch { /* Analytics must not interrupt browsing, cart updates or forms. */ }
  };
  return {
    capture,
    page() {
      const location = getLocation();
      if (!location) return;
      const page = location.pathname + location.search;
      if (lastPage === page) return;
      lastPage = page;
      capture('$pageview');
      if (location.pathname === '/checkout') capture('begin_checkout');
    },
  };
}
