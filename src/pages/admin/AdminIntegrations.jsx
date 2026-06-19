/**
 * Admin · Integrations status — PRD-01 placeholder + connect-status
 * dashboard for every external service the platform integrates with.
 *
 * Each row shows: configuration state (do we have creds?), last
 * successful sync timestamp (from `audit_log` or the relevant mirror
 * table), and a "Run a ping" button that exercises the client.
 *
 * Real credentials get plugged into VITE_<NAME>_* env vars (browser
 * test) or backend env vars (production). The state of each row
 * reflects reality automatically.
 */

import { useEffect, useState } from 'react';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { Icon } from '../../components/shared/Icon.jsx';
import { useViewport } from '../../lib/viewport.js';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { API_BASE } from '../../lib/external/_http.js';

import { qbo } from '../../lib/external/qbo.js';
import { flexport } from '../../lib/external/flexport.js';
import { cin7 } from '../../lib/external/cin7.js';
import { shipstation } from '../../lib/external/shipstation.js';
import { shopify } from '../../lib/external/shopify.js';
import { hubspot } from '../../lib/external/hubspot.js';
import { stripe } from '../../lib/external/stripe.js';
import { gs1 } from '../../lib/external/gs1.js';
import { openfda } from '../../lib/external/openfda.js';
import { hts } from '../../lib/external/hts.js';
import { resend } from '../../lib/external/resend.js';
import { gmail } from '../../lib/external/gmail.js';
import { gcal } from '../../lib/external/gcal.js';
import { calendly } from '../../lib/external/calendly.js';
import { forecast } from '../../lib/external/forecast.js';
import { ai } from '../../lib/ai/client.js';
import { remoteDbStatus } from '../../lib/remoteDb.js';

const INTEGRATIONS = [
  {
    key: 'qbo',
    label: 'QuickBooks Online',
    prd: 'PRD-02',
    client: qbo,
    envVars: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_REALM_ID', 'QBO_REFRESH_TOKEN'],
    docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/invoice',
    sample: () => qbo.ping(),
    tablesWatched: ['qbo_invoices'],
    connectUrl: '/api/auth/qbo/connect',
  },
  {
    key: 'flexport',
    label: 'Flexport',
    prd: 'PRD-03',
    client: flexport,
    envVars: ['FLEXPORT_API_KEY', '(or) FLEXPORT_CLIENT_ID + FLEXPORT_CLIENT_SECRET'],
    docsUrl: 'https://developers.flexport.com/s/api',
    sample: () => flexport.listShipments({ limit: 1 }),
    tablesWatched: ['flexport_shipments'],
  },
  {
    key: 'cin7',
    label: 'Cin7 Core (WMS)',
    prd: 'PRD-04',
    client: cin7,
    envVars: ['CIN7_ACCOUNT_ID', 'CIN7_APPLICATION_KEY'],
    docsUrl: 'https://help.core.cin7.com/hc/en-us/articles/9982480315407-Connecting-to-the-Cin7-Core-API',
    sample: () => cin7.ping(),
    tablesWatched: ['inventory'],
  },
  {
    key: 'shipstation',
    label: 'ShipStation',
    prd: 'PRD-04',
    client: shipstation,
    envVars: ['SHIPSTATION_API_KEY', 'SHIPSTATION_API_SECRET'],
    docsUrl: 'https://docs.shipstation.com/apis/shipstation-v1/openapi',
    sample: () => shipstation.getRates({ weight_lbs: 12 }),
    tablesWatched: ['shipstation_labels'],
  },
  {
    key: 'shopify',
    label: 'Shopify (headless commerce)',
    prd: 'PRD-04',
    client: shopify,
    envVars: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'VITE_SHOPIFY_STOREFRONT_TOKEN'],
    docsUrl: 'https://shopify.dev/docs/api/admin-rest',
    sample: () => shopify.ping(),
    tablesWatched: ['shopify_orders', 'shopify_products'],
  },
  {
    key: 'hubspot',
    label: 'HubSpot CRM',
    prd: 'PRD-06',
    client: hubspot,
    envVars: ['HUBSPOT_PRIVATE_APP_TOKEN'],
    docsUrl: 'https://developers.hubspot.com/docs/api-reference/legacy/crm/objects/contacts/guide',
    sample: () => hubspot.ensureCustomProperties(),
    tablesWatched: ['hubspot_contacts'],
  },
  {
    key: 'stripe',
    label: 'Stripe (Billing + Connect)',
    prd: 'PRD-09',
    client: stripe,
    envVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    docsUrl: 'https://docs.stripe.com/api',
    sample: () => stripe.upsertCustomer({ org: { id: 'org_atlsurgical', name: 'Atlanta Surgical', segment: 'asc', tier: 'A', billing_email: 'ar@atlanta-surgical.com' } }),
    tablesWatched: ['invoices', 'stripe_payments'],
  },
  {
    key: 'gs1',
    label: 'GS1 US Data Hub',
    prd: 'PRD-07',
    client: gs1,
    envVars: ['GS1_API_KEY', 'GS1_ACCOUNT_ID'],
    docsUrl: 'https://www.gs1us.org/tools/gs1-us-data-hub/gs1-us-apis',
    sample: () => gs1.validateGTIN('00012345678905'),
    tablesWatched: [],
  },
  {
    key: 'openfda',
    label: 'openFDA',
    prd: 'PRD-07',
    client: openfda,
    envVars: ['OPENFDA_API_KEY (optional)'],
    docsUrl: 'https://open.fda.gov/apis/device/',
    sample: () => openfda.classification('KGN'),
    tablesWatched: ['vendor_evidence'],
    alwaysReal: true,
  },
  {
    key: 'hts',
    label: 'USITC HTS',
    prd: 'PRD-08',
    client: hts,
    envVars: ['(none — free, via /api/proxy/hts)'],
    docsUrl: 'https://hts.usitc.gov',
    sample: () => hts.lookup('9021.10'),
    tablesWatched: [],
    alwaysReal: true,
  },
  {
    key: 'anthropic',
    label: 'Anthropic (Claude)',
    prd: 'PRD-11',
    client: ai,
    envVars: ['ANTHROPIC_API_KEY (server)'],
    docsUrl: 'https://platform.claude.com/docs/en/api/messages',
    sample: () => ai.run('quoting/hts_classify', { input: { product_name: 'Hinged knee brace' }, source: 'integrations-ping' }),
    tablesWatched: ['ai_usage'],
  },
  {
    key: 'resend',
    label: 'Resend · email (primary)',
    prd: 'PRD-05',
    client: resend,
    envVars: ['RESEND_API_KEY'],
    docsUrl: 'https://resend.com/docs/api-reference/emails/send-email',
    sample: () => resend.ping(),
    tablesWatched: ['gmail_outbox'],
  },
  {
    key: 'calendly',
    label: 'Calendly · scheduling (primary)',
    prd: 'Brief §5',
    client: calendly,
    envVars: ['CALENDLY_API_KEY', 'CALENDLY_WEBHOOK_SECRET'],
    docsUrl: 'https://developer.calendly.com/api-docs',
    sample: () => calendly.listEventTypes(),
    tablesWatched: ['calendar_events'],
  },
  {
    key: 'gmail',
    label: 'Gmail · inbox + email fallback (optional)',
    prd: 'PRD-05',
    client: gmail,
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
    docsUrl: 'https://developers.google.com/gmail/api/reference/rest',
    sample: () => gmail.listInbox({ limit: 1 }),
    tablesWatched: ['gmail_outbox'],
    connectUrl: '/api/auth/google/connect',
  },
  {
    key: 'gcal',
    label: 'Google Calendar · mirror (optional)',
    prd: 'PRD-05',
    client: gcal,
    envVars: ['(same Google grant as Gmail)'],
    docsUrl: 'https://developers.google.com/calendar/api/v3/reference',
    sample: () => gcal.listUpcoming({ limit: 1 }),
    tablesWatched: ['calendar_events'],
    connectUrl: '/api/auth/google/connect',
  },
  {
    key: 'forecast',
    label: 'Prophet forecasting sidecar',
    prd: 'PRD-12',
    client: forecast,
    envVars: ['FORECAST_API_URL', 'FORECAST_API_TOKEN (optional)'],
    docsUrl: 'https://facebook.github.io/prophet/docs/quick_start.html',
    sample: () => forecast.health(),
    tablesWatched: ['purchase_orders'],
  },
  {
    key: 'postgres',
    label: 'Postgres (durable persistence)',
    prd: 'PRD-13',
    client: null,
    envVars: ['DATABASE_URL', 'DB_SYNC_TOKEN', 'VITE_DB_SYNC_TOKEN (build-time)'],
    docsUrl: 'https://neon.tech/docs/serverless/serverless-driver',
    sample: async () => remoteDbStatus(),
    tablesWatched: [],
  },
];

const BADGE = {
  real:       ['#2d6a4f', 'CONNECTED'],
  stub:       ['#8f8490', 'STUB'],
  partial:    [D.terra, 'PARTIAL'],
  error:      ['#c3382d', 'ERROR'],
};

export function AdminIntegrations() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;

  const auditLog = db.useTable('audit_log', { orderBy: 'created_at', dir: 'desc', limit: 200 });

  const [results, setResults] = useState({});
  const [running, setRunning] = useState(null);
  const [serverHealth, setServerHealth] = useState(null); // null = checking, false = unreachable

  // Server-side configuration snapshot (booleans only) from the
  // serverless layer — the source of truth for what's live-wired.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/health`);
        const json = res.ok ? await res.json() : null;
        if (!cancelled) setServerHealth(json?.ok ? json : false);
      } catch {
        if (!cancelled) setServerHealth(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function runPing(integration) {
    setRunning(integration.key);
    try {
      const start = Date.now();
      const r = await integration.sample();
      setResults((s) => ({ ...s, [integration.key]: { ok: true, elapsed: Date.now() - start, data: r } }));
    } catch (err) {
      setResults((s) => ({ ...s, [integration.key]: { ok: false, error: err.message } }));
    } finally {
      setRunning(null);
    }
  }

  function status(integration) {
    if (integration.alwaysReal) return 'real';
    // Server-side env config (via /api/health) is the source of truth.
    if (serverHealth && serverHealth.services?.[integration.key]?.configured) return 'real';
    const r = results[integration.key];
    if (r?.ok === false) return 'error';
    return 'stub';
  }

  function lastEvent(integration) {
    const prefixes = [`${integration.key}.`];
    if (integration.key === 'qbo') prefixes.push('qbo.');
    const evt = auditLog.find((a) => prefixes.some((p) => String(a.kind).startsWith(p)));
    return evt;
  }

  return (
    <AdminShell active="settings">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>PLATFORM · INTEGRATIONS</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 400, letterSpacing: -1.2, lineHeight: 1.02, margin: 0 }}>Integrations.</h1>
        <p style={{ fontSize: 14, color: D.ink2, marginTop: 10, maxWidth: 720, lineHeight: 1.55 }}>
          Every external service the platform talks to. Each row shows whether credentials are configured (Vercel/Doppler env vars), the last server event we received, and a button to ping the upstream.
        </p>
        <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 999, border: `1px solid ${D.line}`, background: D.card }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: serverHealth ? '#2d6a4f' : serverHealth === false ? '#c3382d' : '#8f8490' }} />
          <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, color: D.ink2 }}>
            {serverHealth ? `Serverless layer online · ${Object.values(serverHealth.services || {}).filter((s) => s.configured).length} services configured`
              : serverHealth === false ? 'Serverless layer unreachable (local dev — clients fall back to stubs)'
              : 'Checking serverless layer…'}
          </span>
        </div>
      </div>

      <div style={{ padding: isMobile ? 20 : 32, display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
        {INTEGRATIONS.map((it) => {
          const s = status(it);
          const [color, label] = BADGE[s];
          const result = results[it.key];
          const evt = lastEvent(it);
          return (
            <AdminCard key={it.key} title={it.label}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 280px', gap: 24, alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '4px 10px', borderRadius: 999, background: `${color}20`, color }}>{label}</span>
                    <span style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{it.prd}</span>
                    <a href={it.docsUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontFamily: D.mono, fontSize: 11, color: D.plum, textDecoration: 'underline' }}>docs ↗</a>
                  </div>
                  <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 12, marginBottom: 4 }}>ENV VARS</div>
                  <div style={{ fontSize: 12, color: D.ink2, fontFamily: D.mono, lineHeight: 1.7 }}>{it.envVars.join(' · ')}</div>

                  {it.tablesWatched.length > 0 && (
                    <>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 14, marginBottom: 4 }}>MIRRORED TABLES</div>
                      <div style={{ fontSize: 12, color: D.ink2, fontFamily: D.mono }}>
                        {it.tablesWatched.map((t) => `${t} (${db.count(t)})`).join(' · ')}
                      </div>
                    </>
                  )}

                  {evt && (
                    <>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 14, marginBottom: 4 }}>LAST EVENT</div>
                      <div style={{ fontSize: 12, color: D.ink2 }}>{evt.kind} · {fmt.ago(evt.created_at)}</div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    onClick={() => runPing(it)}
                    disabled={running === it.key}
                    style={{ background: D.ink, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: running === it.key ? 'wait' : 'pointer', opacity: running === it.key ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
                  >
                    {running === it.key ? 'Pinging…' : <>Run a ping <Icon.arrow /></>}
                  </button>

                  {it.connectUrl && (
                    <a href={it.connectUrl} style={{ background: 'transparent', color: D.plum, border: `1px solid ${D.plum}`, padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 500, textAlign: 'center', textDecoration: 'none' }}>
                      Connect via OAuth ↗
                    </a>
                  )}

                  {result && (
                    <div style={{ padding: 12, borderRadius: 8, background: result.ok ? '#e8f5ed' : '#fbe9e1', fontSize: 12, color: result.ok ? '#1d4731' : '#7a2d10', lineHeight: 1.5 }}>
                      {result.ok ? (
                        <>
                          <div style={{ fontWeight: 600 }}>OK · {result.elapsed}ms</div>
                          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '6px 0 0', fontFamily: D.mono, fontSize: 11, maxHeight: 160, overflow: 'auto' }}>
                            {JSON.stringify(result.data, null, 2).slice(0, 600)}
                            {JSON.stringify(result.data).length > 600 && '…'}
                          </pre>
                        </>
                      ) : (
                        <div><strong>Failed:</strong> {result.error}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </AdminCard>
          );
        })}
      </div>
    </AdminShell>
  );
}
