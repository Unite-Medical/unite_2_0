import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db, __TABLES } from '../../lib/db.js';
import { auth } from '../../lib/auth.js';
import { useViewport } from '../../lib/viewport.js';

const SETTINGS_KEY = 'um.settings.v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSettings(value) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  } catch (e) {
    void e;
  }
}

const DEFAULTS = {
  company_name: 'Unite Medical Supply',
  company_address: '1487 Trae Lane, Lithia Springs, GA 30122',
  fda_registration: '3015727296',
  bpa: '36F79725D0203',
  cage: '8MK70',
  duns: '117553945',
  sales_phone: '833.868.6483',
  sales_email: 'support@unitemedical.net',
  default_margin: 0.6,
  freight_per_unit: 0.42,
  free_freight_threshold: 500,
  median_ship_label: 'Same-day',
  feature_quote_engine: true,
  feature_telehealth: false,
  feature_clyne: false,
};

export function AdminSettings() {
  const { isMobile } = useViewport();
  const navigate = useNavigate();
  const padX = isMobile ? 18 : 40;
  const session = auth.use();
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...(loadSettings() || {}) }));
  const [saved, setSaved] = useState(false);

  const counts = useMemo(() => {
    const tablesOfInterest = ['products', 'product_variants', 'orders', 'order_items', 'organizations', 'profiles', 'leads', 'invoices', 'quotes', 'inventory', 'shipments', 'blog_posts'];
    return tablesOfInterest.map((t) => [t, db.list(t).length]);
  }, []);

  function patch(p) {
    setSaved(false);
    setSettings((s) => ({ ...s, ...p }));
  }

  function commit() {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function reseedAll() {
    if (!window.confirm('This wipes the in-browser DB and re-seeds it from src/data/realCatalog.js. All local edits will be lost. Continue?')) return;
    db.reset();
    window.location.reload();
  }

  function clearLocalData() {
    if (!window.confirm('Clear ALL localStorage (DB + session + settings)? You will be signed out.')) return;
    try {
      localStorage.clear();
    } catch (e) {
      void e;
    }
    auth.logout();
    window.location.href = '/';
  }

  function exportSnapshot() {
    const snapshot = db.raw();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unite-medical-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell active="settings">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}`, display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
        <div>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>SYSTEM · SETTINGS</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>Settings.</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {saved && <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: '#3b8760', alignSelf: 'center' }}>SAVED</span>}
          <button onClick={commit} style={primaryBtn}>Save settings</button>
        </div>
      </div>

      <div style={{ padding: `${isMobile ? 24 : 32}px ${padX}px ${isMobile ? 48 : 80}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 24 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <Card title="Company">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Company name"><input value={settings.company_name} onChange={(e) => patch({ company_name: e.target.value })} style={inputStyle} /></Field>
              <Field label="Sales phone"><input value={settings.sales_phone} onChange={(e) => patch({ sales_phone: e.target.value })} style={inputStyle} /></Field>
              <Field label="Sales email"><input value={settings.sales_email} onChange={(e) => patch({ sales_email: e.target.value })} style={inputStyle} /></Field>
              <Field label="Median ship label"><input value={settings.median_ship_label} onChange={(e) => patch({ median_ship_label: e.target.value })} style={inputStyle} /></Field>
            </div>
            <Field label="Company address"><input value={settings.company_address} onChange={(e) => patch({ company_address: e.target.value })} style={inputStyle} /></Field>
          </Card>

          <Card title="Compliance & registrations">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="FDA registration"><input value={settings.fda_registration} onChange={(e) => patch({ fda_registration: e.target.value })} style={inputStyle} /></Field>
              <Field label="BPA"><input value={settings.bpa} onChange={(e) => patch({ bpa: e.target.value })} style={inputStyle} /></Field>
              <Field label="CAGE code"><input value={settings.cage} onChange={(e) => patch({ cage: e.target.value })} style={inputStyle} /></Field>
              <Field label="DUNS"><input value={settings.duns} onChange={(e) => patch({ duns: e.target.value })} style={inputStyle} /></Field>
            </div>
          </Card>

          <Card title="Quoting engine defaults">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Target margin (0–1)"><input type="number" step="0.05" min="0" max="0.95" value={settings.default_margin} onChange={(e) => patch({ default_margin: parseFloat(e.target.value) || 0 })} style={inputStyle} /></Field>
              <Field label="Freight per unit USD"><input type="number" step="0.01" value={settings.freight_per_unit} onChange={(e) => patch({ freight_per_unit: parseFloat(e.target.value) || 0 })} style={inputStyle} /></Field>
              <Field label="Free freight threshold"><input type="number" step="10" value={settings.free_freight_threshold} onChange={(e) => patch({ free_freight_threshold: parseFloat(e.target.value) || 0 })} style={inputStyle} /></Field>
            </div>
          </Card>

          <Card title="Feature flags">
            {[
              ['feature_quote_engine', 'Quoting engine page', 'Enable /quote in the marketing nav and footer.'],
              ['feature_telehealth',   'Telehealth integration', 'Reserved · enables Clyne handoff (not yet wired).'],
              ['feature_clyne',        'Clyne dropdown on PDP', 'Reserved · adds telehealth CTA to product pages.'],
            ].map(([key, label, sub]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: `1px solid ${D.line}` }}>
                <input
                  type="checkbox"
                  checked={!!settings[key]}
                  onChange={(e) => patch({ [key]: e.target.checked })}
                  style={{ accentColor: D.plum, marginTop: 3 }}
                />
                <div>
                  <div style={{ fontSize: 13.5, color: D.ink, fontWeight: 500 }}>{label}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 2 }}>{sub}</div>
                </div>
              </label>
            ))}
          </Card>

          <Card title="Danger zone">
            <p style={{ fontSize: 13, color: D.ink2, marginTop: 0, lineHeight: 1.55 }}>
              These actions affect the in-browser demo database (localStorage). Re-running the
              importer (<code style={mono}>python3 scripts/import_catalog.py</code>) and reloading
              the page is the easiest way to restore everything to a known state.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <button onClick={exportSnapshot} style={ghostBtn}>Export snapshot (.json)</button>
              <button onClick={reseedAll} style={{ ...ghostBtn, color: D.terra, borderColor: D.terra }}>Reset & reseed DB</button>
              <button onClick={clearLocalData} style={{ ...ghostBtn, color: D.terra, borderColor: D.terra }}>Wipe all local data</button>
            </div>
          </Card>
        </div>

        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <Card title="Session">
            <Stat label="Signed in as" value={session?.name || '—'} />
            <Stat label="Email" value={session?.email || '—'} />
            <Stat label="Role" value={(session?.role || 'guest').toUpperCase()} />
            <button onClick={() => { auth.logout(); navigate('/'); }} style={{ ...ghostBtn, marginTop: 14, width: '100%', justifyContent: 'center' }}>
              Sign out
            </button>
          </Card>

          <Card title="Database snapshot">
            <div style={{ fontSize: 12, color: D.ink2, marginBottom: 8 }}>
              {counts.length} tables of interest · {__TABLES.length} total
            </div>
            {counts.map(([table, n]) => (
              <Stat key={table} label={table} value={n.toLocaleString()} />
            ))}
          </Card>

          <Card title="Workflow">
            <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: D.ink2, lineHeight: 1.7 }}>
              <li>Edit catalog spreadsheet (upstream CSV)</li>
              <li>Run <code style={mono}>python3 scripts/import_catalog.py</code></li>
              <li>(optional) <code style={mono}>python3 scripts/generate_catalog_images.py</code></li>
              <li>Restart dev server</li>
              <li>Reset local DB from this page</li>
            </ol>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, padding: 22 }}>
      <div style={{ fontFamily: D.display, fontSize: 20, letterSpacing: -0.3, marginBottom: 16 }}>{title}</div>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 6 }}>{label.toUpperCase()}</div>
      {children}
    </label>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${D.line}`, gap: 12 }}>
      <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, color: D.ink3 }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 13, color: D.ink, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const inputStyle = { width: '100%', padding: '10px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13, color: D.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
const primaryBtn = { background: D.plum, color: D.paper, border: 'none', padding: '11px 22px', borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
const ghostBtn = { background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, padding: '10px 18px', borderRadius: 999, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const mono = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, background: D.paperAlt, padding: '1px 6px', borderRadius: 4 };
