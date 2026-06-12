/**
 * Upstream service registry for /api/proxy/[service]/[...path].
 *
 * Each entry knows how to:
 *   - report whether its credentials are configured (env vars)
 *   - build the upstream URL for a forwarded path
 *   - build auth headers (incl. OAuth token refresh where needed)
 *   - optionally transform the body (Stripe wants form-encoding)
 *
 * Secrets only ever live here, server-side. The browser clients in
 * `src/lib/external/*` POST JSON to `/api/proxy/<service><path>` and
 * receive the upstream JSON unchanged.
 */

const env = (k) => process.env[k] || '';

// ---------------------------------------------------------------------------
// OAuth token caches (module scope — survives warm invocations)
// ---------------------------------------------------------------------------

const tokenCache = new Map(); // key -> { token, expiresAt }

async function cachedToken(key, mint) {
  const hit = tokenCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.token;
  const { token, expiresInSec } = await mint();
  tokenCache.set(key, { token, expiresAt: Date.now() + (expiresInSec - 60) * 1000 });
  return token;
}

/** QBO: refresh-token grant → access token.
 *  Refresh token comes from the one-time /api/auth/qbo flow. */
async function qboAccessToken() {
  if (env('QBO_ACCESS_TOKEN')) return env('QBO_ACCESS_TOKEN');
  return cachedToken('qbo', async () => {
    const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${env('QBO_CLIENT_ID')}:${env('QBO_CLIENT_SECRET')}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env('QBO_REFRESH_TOKEN') }),
    });
    if (!res.ok) throw new Error(`QBO token refresh failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return { token: json.access_token, expiresInSec: json.expires_in || 3600 };
  });
}

/** Google: refresh-token grant (Gmail + Calendar share one identity).
 *  Refresh token comes from the one-time /api/auth/google flow. */
async function googleAccessToken() {
  return cachedToken('google', async () => {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'),
        refresh_token: env('GOOGLE_REFRESH_TOKEN'),
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return { token: json.access_token, expiresInSec: json.expires_in || 3600 };
  });
}

/** Flexport: permanent key, or client-credentials JWT. */
async function flexportToken() {
  const direct = env('FLEXPORT_API_KEY');
  if (direct) return direct;
  return cachedToken('flexport', async () => {
    const res = await fetch('https://api.flexport.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env('FLEXPORT_CLIENT_ID'),
        client_secret: env('FLEXPORT_CLIENT_SECRET'),
        audience: 'https://api.flexport.com',
        grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) throw new Error(`Flexport token failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    return { token: json.access_token, expiresInSec: json.expires_in || 86400 };
  });
}

// ---------------------------------------------------------------------------
// Stripe form encoding (Stripe rejects JSON bodies)
// ---------------------------------------------------------------------------

function encodeStripeForm(obj, prefix = '') {
  const params = new URLSearchParams();
  function walk(key, value) {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) { value.forEach((v, i) => walk(`${key}[${i}]`, v)); return; }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(key ? `${key}[${k}]` : k, v);
      return;
    }
    params.append(key, String(value));
  }
  for (const [k, v] of Object.entries(obj || {})) walk(prefix ? `${prefix}[${k}]` : k, v);
  return params.toString();
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SERVICES = {
  qbo: {
    label: 'QuickBooks Online',
    configured: () => Boolean(
      env('QBO_REALM_ID') && (env('QBO_ACCESS_TOKEN') || (env('QBO_CLIENT_ID') && env('QBO_CLIENT_SECRET') && env('QBO_REFRESH_TOKEN'))),
    ),
    // Client sends /proxy/qbo/<entity>?q=<query> — expand to the full
    // Intuit company path with minorversion pinning. `?q=` targets the
    // SQL-ish /query endpoint instead of an entity.
    buildUrl: (path, query) => {
      const root = env('QBO_ENVIRONMENT') === 'production'
        ? 'https://quickbooks.api.intuit.com/v3'
        : 'https://sandbox-quickbooks.api.intuit.com/v3';
      const realm = env('QBO_REALM_ID');
      const entity = path.replace(/^\//, '');
      const url = query.q
        ? new URL(`${root}/company/${realm}/query`)
        : new URL(`${root}/company/${realm}/${entity}`);
      if (query.q) url.searchParams.set('query', query.q);
      url.searchParams.set('minorversion', '75');
      return url.toString();
    },
    headers: async () => ({ Authorization: `Bearer ${await qboAccessToken()}`, Accept: 'application/json', 'Content-Type': 'application/json' }),
  },

  flexport: {
    label: 'Flexport',
    configured: () => Boolean(env('FLEXPORT_API_KEY') || (env('FLEXPORT_CLIENT_ID') && env('FLEXPORT_CLIENT_SECRET'))),
    buildUrl: (path, query) => withQuery(`https://api.flexport.com${path}`, query),
    headers: async () => ({
      Authorization: `Bearer ${await flexportToken()}`,
      'Flexport-Version': '2',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
  },

  stripe: {
    label: 'Stripe',
    configured: () => Boolean(env('STRIPE_SECRET_KEY')),
    buildUrl: (path, query) => withQuery(`https://api.stripe.com/v1${path}`, query),
    headers: async () => ({
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }),
    // Browser clients send JSON; Stripe wants form-encoded.
    transformBody: (json) => encodeStripeForm(json),
  },

  shipstation: {
    label: 'ShipStation',
    configured: () => Boolean(env('SHIPSTATION_API_KEY') && env('SHIPSTATION_API_SECRET')),
    buildUrl: (path, query) => withQuery(`https://ssapi.shipstation.com${path}`, query),
    headers: async () => ({
      Authorization: `Basic ${Buffer.from(`${env('SHIPSTATION_API_KEY')}:${env('SHIPSTATION_API_SECRET')}`).toString('base64')}`,
      'Content-Type': 'application/json',
    }),
  },

  hubspot: {
    label: 'HubSpot CRM',
    configured: () => Boolean(env('HUBSPOT_PRIVATE_APP_TOKEN')),
    buildUrl: (path, query) => withQuery(`https://api.hubapi.com${path}`, query),
    headers: async () => ({
      Authorization: `Bearer ${env('HUBSPOT_PRIVATE_APP_TOKEN')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }),
  },

  cin7: {
    label: 'Cin7 Core',
    configured: () => Boolean(env('CIN7_ACCOUNT_ID') && env('CIN7_APPLICATION_KEY')),
    buildUrl: (path, query) => withQuery(`https://inventory.dearsystems.com/ExternalApi/v2${path}`, query),
    headers: async () => ({
      'api-auth-accountid': env('CIN7_ACCOUNT_ID'),
      'api-auth-applicationkey': env('CIN7_APPLICATION_KEY'),
      'Content-Type': 'application/json',
    }),
  },

  gs1: {
    label: 'GS1 US Data Hub',
    configured: () => Boolean(env('GS1_API_KEY') && env('GS1_ACCOUNT_ID')),
    buildUrl: (path, query) => withQuery(`https://api.gs1us.org${path}`, query),
    headers: async () => ({
      APIKey: env('GS1_API_KEY'),
      'X-Product-Owner-Account-Id': env('GS1_ACCOUNT_ID'),
      'Content-Type': 'application/json',
    }),
  },

  importgenius: {
    label: 'ImportGenius',
    configured: () => Boolean(env('IMPORTGENIUS_API_KEY')),
    buildUrl: (path, query) => withQuery(`https://api.importgenius.com/v1${path}`, query),
    headers: async () => ({ 'X-API-Key': env('IMPORTGENIUS_API_KEY'), 'Content-Type': 'application/json' }),
  },

  anthropic: {
    label: 'Anthropic (Claude)',
    configured: () => Boolean(env('ANTHROPIC_API_KEY')),
    buildUrl: (path, query) => withQuery(`https://api.anthropic.com${path}`, query),
    headers: async () => ({
      'x-api-key': env('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }),
  },

  gmail: {
    label: 'Gmail API',
    configured: () => Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && env('GOOGLE_REFRESH_TOKEN')),
    buildUrl: (path, query) => withQuery(`https://gmail.googleapis.com${path}`, query),
    headers: async () => ({ Authorization: `Bearer ${await googleAccessToken()}`, 'Content-Type': 'application/json' }),
  },

  gcal: {
    label: 'Google Calendar API',
    configured: () => Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && env('GOOGLE_REFRESH_TOKEN')),
    buildUrl: (path, query) => withQuery(`https://www.googleapis.com/calendar/v3${path}`, query),
    headers: async () => ({ Authorization: `Bearer ${await googleAccessToken()}`, 'Content-Type': 'application/json' }),
  },

  calendly: {
    label: 'Calendly',
    configured: () => Boolean(env('CALENDLY_API_KEY')),
    buildUrl: (path, query) => withQuery(`https://api.calendly.com${path}`, query),
    headers: async () => ({ Authorization: `Bearer ${env('CALENDLY_API_KEY')}`, 'Content-Type': 'application/json' }),
  },

  forecast: {
    label: 'Prophet forecasting sidecar',
    configured: () => Boolean(env('FORECAST_API_URL')),
    buildUrl: (path, query) => withQuery(`${env('FORECAST_API_URL').replace(/\/$/, '')}${path}`, query),
    headers: async () => ({
      ...(env('FORECAST_API_TOKEN') ? { Authorization: `Bearer ${env('FORECAST_API_TOKEN')}` } : {}),
      'Content-Type': 'application/json',
    }),
  },
};

function withQuery(base, query = {}) {
  const url = new URL(base);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || k === 'service' || k === 'path') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Configuration snapshot for /api/health — booleans only, no secrets. */
export function configSnapshot() {
  const out = {};
  for (const [key, svc] of Object.entries(SERVICES)) {
    out[key] = { label: svc.label, configured: svc.configured() };
  }
  out.openfda = { label: 'openFDA', configured: true, note: 'free, no auth required' };
  out.hts = { label: 'USITC HTS', configured: true, note: 'free REST API via /api/proxy/hts' };
  out.postgres = {
    label: 'Postgres (Neon row-store)',
    configured: Boolean(env('DATABASE_URL') && env('DB_SYNC_TOKEN')),
    note: 'durable persistence via /api/db/sync',
  };
  out.webhooks = {
    label: 'Webhook receivers',
    stripe: Boolean(env('STRIPE_WEBHOOK_SECRET')),
    shipstation: Boolean(env('SHIPSTATION_WEBHOOK_SECRET')),
    flexport: Boolean(env('FLEXPORT_WEBHOOK_SECRET')),
    fathom: Boolean(env('FATHOM_WEBHOOK_SECRET')),
    calendly: Boolean(env('CALENDLY_WEBHOOK_SECRET')),
  };
  return out;
}
