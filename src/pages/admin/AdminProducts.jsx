import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { Icon } from '../../components/shared/Icon.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';

const TIERS = ['All', 'Bracing', 'POC', 'OTC', 'Consumable', 'Surgical', 'Wellness'];

const CATEGORY_BG = {
  Orthotics:    'rgba(94,41,99,.10)',
  Diagnostics:  'rgba(60,120,90,.10)',
  PPE:          'rgba(184,80,44,.10)',
  Surgical:     'rgba(40,80,140,.10)',
  Supplements:  'rgba(150,90,50,.10)',
};

export function AdminProducts() {
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 40;
  const navigate = useNavigate();
  const products = db.useTable('products');
  const inventory = db.useTable('inventory');

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [tier, setTier] = useState('All');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const cats = useMemo(() => ['All', ...new Set(products.map((p) => p.category).filter(Boolean))], [products]);

  const stockBySku = useMemo(() => {
    const m = new Map();
    inventory.forEach((i) => m.set(i.sku, (m.get(i.sku) || 0) + i.on_hand));
    return m;
  }, [inventory]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = products.filter((p) =>
      (cat === 'All' || p.category === cat) &&
      (tier === 'All' || p.tier === tier) &&
      (!needle ||
        `${p.name} ${p.sku} ${p.handle || ''} ${p.vendor || ''} ${(p.tags || []).join(' ')}`
          .toLowerCase()
          .includes(needle))
    );
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * (sortDir === 'asc' ? 1 : -1);
      return String(av).localeCompare(String(bv)) * (sortDir === 'asc' ? 1 : -1);
    });
    return rows;
  }, [products, q, cat, tier, sortKey, sortDir]);

  const counts = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(p.category, (map.get(p.category) || 0) + 1));
    return map;
  }, [products]);

  function setPrice(sku, value) {
    const v = parseFloat(value);
    if (Number.isFinite(v) && v >= 0) {
      db.update('products', sku, { price: v });
    }
  }

  function toggleAvailable(sku) {
    const p = db.get('products', sku);
    if (!p) return;
    db.update('products', sku, { available: !(p.available !== false) });
  }

  function deleteProduct(sku) {
    if (!window.confirm(`Delete ${sku}? This removes it from the catalog only — re-running the importer will restore it.`)) return;
    db.remove('products', sku);
    db.list('inventory', { where: { sku } }).forEach((i) => db.remove('inventory', i.id));
    db.list('pricing', { where: { sku } }).forEach((p) => db.remove('pricing', p.id));
  }

  function regenerateInfo(sku) {
    window.alert(
      `To regenerate the AI hero image for this product, run:\n\n` +
      `OPENAI_API_KEY=sk-... python3 scripts/generate_catalog_images.py \\\n` +
      `    --only ${db.get('products', sku)?.handle || sku} --quality medium\n\n` +
      `Output lands in public/images/products-ai/. To make it the live hero image,\n` +
      `swap the path in src/lib/imageMap.js or copy it over the original.`
    );
  }

  function sortBy(key) {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <AdminShell active="products">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 18 : 24}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 12 }}>CATALOG · PRODUCTS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5.6vw, 56px)', fontWeight: 400, letterSpacing: -1.3, lineHeight: 1.02, margin: 0 }}>
            Products · {products.length}
          </h1>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/admin/products/new" style={{ background: D.plum, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 999, fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
              + Add product
            </Link>
            <button
              onClick={() => window.alert(
                `To re-import the catalog from the upstream Shopify CSVs, run:\n\n` +
                `python3 scripts/import_catalog.py\n\n` +
                `That re-reads ALL_PRODUCTS_MASTER.csv, copies updated images, and rewrites src/data/realCatalog.js. ` +
                `Restart the dev server to pick up the new data.`
              )}
              style={{ background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, padding: '10px 16px', borderRadius: 999, fontSize: 13, cursor: 'pointer' }}
            >
              Re-import from CSV
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : 'repeat(6, 1fr)', gap: 10, marginTop: 22 }}>
          <StatCard label="Total" value={String(products.length)} accent />
          {[...counts.entries()].map(([c, n]) => (
            <StatCard key={c} label={c} value={String(n)} />
          ))}
        </div>
      </div>

      <div style={{ padding: `${isMobile ? 18 : 24}px ${padX}px`, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: `1px solid ${D.line}`, borderRadius: 999, background: D.card, flex: '1 1 280px', maxWidth: 420 }}>
          <Icon.search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SKU, handle, name, vendor, tag"
            aria-label="Search products"
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: 14, fontFamily: D.sans, color: D.ink }}
          />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category filter" style={selectStyle}>
          {cats.map((c) => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Tier filter" style={selectStyle}>
          {TIERS.map((t) => <option key={t} value={t}>{t === 'All' ? 'All tiers' : t}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3 }}>
          {filtered.length} of {products.length} shown
        </span>
      </div>

      <div style={{ padding: `0 ${padX}px ${isMobile ? 48 : 64}px` }}>
        <div style={{ background: D.card, borderRadius: 12, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
          <div className="um-scroll-x">
            <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                  <th style={thStyle}>IMG</th>
                  <SortHeader k="sku" label="SKU" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                  <SortHeader k="name" label="PRODUCT" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                  <SortHeader k="vendor" label="VENDOR" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                  <SortHeader k="category" label="CATEGORY" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                  <SortHeader k="price" label="PRICE" sortKey={sortKey} sortDir={sortDir} onClick={sortBy} />
                  <th style={thStyle}>STOCK</th>
                  <th style={thStyle}>VARIANTS</th>
                  <th style={thStyle}>FLAGS</th>
                  <th style={thStyle}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const stock = stockBySku.get(p.sku) || 0;
                  const lowStock = stock < 200;
                  const flags = [
                    p.pdac_approved && 'PDAC',
                    p.taa_compliant && 'TAA',
                    p.berry_compliant && 'BERRY',
                    p.mspv_listed && 'MSPV',
                  ].filter(Boolean);
                  return (
                    <tr key={p.sku} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, verticalAlign: 'middle' }}>
                      <td style={tdStyle}>
                        <div style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', background: D.paperAlt, border: `1px solid ${D.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {p.hero_image ? (
                            <img src={p.hero_image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontFamily: D.mono, fontSize: 9, color: D.ink3 }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: D.mono, fontSize: 12, color: D.plum, fontWeight: 600 }}>{p.sku}</td>
                      <td style={tdStyle}>
                        <Link to={`/admin/products/edit/${encodeURIComponent(p.sku)}`} style={{ fontWeight: 500, color: D.ink, lineHeight: 1.3, display: 'block', maxWidth: 320 }}>
                          {p.name}
                        </Link>
                        <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3, marginTop: 2 }}>{p.handle}</div>
                      </td>
                      <td style={{ ...tdStyle, color: D.ink2, fontSize: 12 }}>{p.vendor || '—'}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, background: CATEGORY_BG[p.category] || D.paperAlt, color: D.ink2 }}>
                          {p.category}
                        </span>
                        <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3, marginTop: 4 }}>{p.tier}</div>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: D.mono }}>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={p.price?.toFixed(2)}
                          onBlur={(e) => setPrice(p.sku, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          style={{ width: 80, padding: '6px 8px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 6, fontSize: 12, color: D.ink, fontFamily: D.mono, outline: 'none', textAlign: 'right' }}
                          aria-label={`Price for ${p.sku}`}
                        />
                        {p.price_max > p.price_min && (
                          <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3, marginTop: 4 }}>→ {fmt.money(p.price_max)}</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: D.mono, fontSize: 12 }}>
                        <span style={{ color: lowStock ? D.terra : '#3b8760' }}>
                          <Icon.dot /> {stock.toLocaleString()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: D.mono, fontSize: 12, color: D.ink2 }}>
                        {p.variants?.length || 1} {p.images ? `/ ${p.images.length} img` : ''}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: D.mono, fontSize: 9, letterSpacing: 1 }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {flags.length === 0 && <span style={{ color: D.ink3 }}>—</span>}
                          {flags.map((f) => (
                            <span key={f} style={{ background: 'rgba(94,41,99,.1)', color: D.plum, padding: '2px 6px', borderRadius: 4 }}>{f}</span>
                          ))}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <Link to={`/products/${encodeURIComponent(p.sku)}`} target="_blank" rel="noreferrer" style={iconBtn} title="View on storefront">
                            <Icon.arrow />
                          </Link>
                          <button onClick={() => navigate(`/admin/products/edit/${encodeURIComponent(p.sku)}`)} style={textBtn} title="Edit details">
                            EDIT
                          </button>
                          <button onClick={() => regenerateInfo(p.sku)} style={textBtn} title="Regenerate AI hero">
                            AI
                          </button>
                          <button onClick={() => toggleAvailable(p.sku)} style={textBtn} title="Toggle available">
                            {p.available === false ? 'SHOW' : 'HIDE'}
                          </button>
                          <button onClick={() => deleteProduct(p.sku)} style={{ ...textBtn, color: D.terra }} title="Delete">
                            DEL
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: D.ink3 }}>
                      No products match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ padding: 14, background: accent ? D.plum : D.card, color: accent ? D.paper : D.ink, borderRadius: 10, border: `1px solid ${accent ? D.plum : D.line}` }}>
      <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: accent ? 'rgba(255,255,255,.7)' : D.ink3 }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SortHeader({ k, label, sortKey, sortDir, onClick }) {
  const active = sortKey === k;
  return (
    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => onClick(k)}>
      <span style={{ color: active ? D.plum : 'inherit' }}>
        {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </span>
    </th>
  );
}

const thStyle = { padding: '11px 14px', textAlign: 'left' };
const tdStyle = { padding: '14px' };
const selectStyle = { padding: '9px 14px', border: `1px solid ${D.line}`, borderRadius: 999, background: D.card, fontSize: 13, color: D.ink2, fontFamily: 'inherit', cursor: 'pointer' };
const textBtn = { background: 'transparent', color: D.plum, border: 'none', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, letterSpacing: 0.8, padding: '4px 6px' };
const iconBtn = { background: 'transparent', color: D.ink3, border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex', alignItems: 'center' };
