import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { Icon } from '../../components/shared/Icon.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useViewport } from '../../lib/viewport.js';
import { M6_CATEGORIES } from '../../lib/taxonomy.js';

const CATEGORIES = ['Orthotics', 'Diagnostics', 'PPE', 'Surgical', 'Supplements', 'Wound Care', 'Pharmaceuticals', 'Equipment'];
const TIERS = ['Bracing', 'POC', 'OTC', 'Consumable', 'Surgical', 'Wellness', 'Pharma', 'Equipment'];
const COUNTRIES = ['US', 'CN', 'VN', 'TW', 'IN', 'MX', 'DE'];

function emptyProduct() {
  return {
    id: '',
    sku: '',
    handle: '',
    name: '',
    vendor: 'Unite Medical®',
    category: 'Orthotics',
    m6_category: '', // required on new uploads (PRD-28 §5.6 / ties to A2)
    product_type: 'Orthopedic Devices',
    tier: 'Bracing',
    pack_size: '1 ea',
    price: 0,
    price_min: 0,
    price_max: 0,
    cogs: 0,
    moq: 1,
    hcpcs: '—',
    summary: '',
    description: '',
    images: [],
    hero_image: '',
    tags: [],
    collections: [],
    variants: [],
    country_of_origin: 'CN',
    fda_registered: true,
    pdac_approved: false,
    taa_compliant: false,
    berry_compliant: false,
    mspv_listed: false,
    latex_free: false,
    available: true,
  };
}

export function AdminProductEdit() {
  const { sku: rawSku } = useParams();
  const sku = rawSku === 'new' ? null : decodeURIComponent(rawSku || '');
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const padX = isMobile ? 18 : 32;
  const existing = sku ? db.useRow('products', sku) : null;
  const [form, setForm] = useState(() => existing ? { ...existing } : emptyProduct());
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (existing && !dirty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({ ...existing });
    }
  }, [existing, dirty]);

  function patch(p) {
    setDirty(true);
    setSaved(false);
    setForm((f) => ({ ...f, ...p }));
  }

  function save() {
    if (!form.sku?.trim()) {
      window.alert('SKU is required.');
      return;
    }
    // M6 taxonomy is a required classification on every new product (PRD-28 §5.6).
    if (!existing && !form.m6_category) {
      window.alert('Product category (M6 taxonomy) is required on new products.');
      return;
    }
    const payload = {
      ...form,
      id: form.sku,
      price: Number(form.price) || 0,
      price_min: Number(form.price_min || form.price) || 0,
      price_max: Number(form.price_max || form.price) || 0,
      moq: Number(form.moq) || 1,
      images: form.images || [],
      hero_image: form.hero_image || form.images?.[0] || '',
    };
    if (existing) {
      db.update('products', existing.id, payload);
    } else {
      db.insert('products', payload);
    }
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function discard() {
    if (!dirty) {
      navigate('/admin/products');
      return;
    }
    if (window.confirm('Discard unsaved changes?')) {
      navigate('/admin/products');
    }
  }

  function deleteProduct() {
    if (!existing) return;
    if (!window.confirm(`Delete ${existing.sku}? This is reversible only by re-running the importer.`)) return;
    db.remove('products', existing.id);
    db.list('inventory', { where: { sku: existing.sku } }).forEach((i) => db.remove('inventory', i.id));
    db.list('pricing', { where: { sku: existing.sku } }).forEach((p) => db.remove('pricing', p.id));
    navigate('/admin/products');
  }

  function moveImage(idx, dir) {
    const list = [...(form.images || [])];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    patch({ images: list, hero_image: list[0] || '' });
  }

  function removeImage(idx) {
    const list = (form.images || []).filter((_, i) => i !== idx);
    patch({ images: list, hero_image: list[0] || '' });
  }

  function addImageUrl() {
    const url = window.prompt('Image URL or local path (e.g. /images/products/foo/foo_01.jpg)');
    if (!url) return;
    const list = [...(form.images || []), url.trim()];
    patch({ images: list, hero_image: form.hero_image || list[0] });
  }

  function setVariant(idx, p) {
    const list = [...(form.variants || [])];
    list[idx] = { ...list[idx], ...p };
    patch({ variants: list });
  }

  function removeVariant(idx) {
    patch({ variants: (form.variants || []).filter((_, i) => i !== idx) });
  }

  function addVariant() {
    patch({
      variants: [
        ...(form.variants || []),
        { variant_id: `v_${Date.now()}`, sku: '', title: 'New variant', price: form.price || 0, available: true, options: {}, image: '' },
      ],
    });
  }

  const tagsString = useMemo(() => (form.tags || []).join(', '), [form.tags]);
  const collectionsString = useMemo(() => (form.collections || []).join(', '), [form.collections]);

  if (sku && !existing) {
    return (
      <AdminShell active="products">
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.terra, marginBottom: 14 }}>404 · NOT FOUND</div>
          <h1 style={{ fontFamily: D.display, fontSize: 32, letterSpacing: -0.6 }}>Product {sku} not found.</h1>
          <Link to="/admin/products" style={{ display: 'inline-block', marginTop: 16, color: D.plum }}>← Back to products</Link>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell active="products">
      <div style={{ padding: `${isMobile ? 24 : 32}px ${padX}px ${isMobile ? 16 : 20}px`, borderBottom: `1px solid ${D.line}`, display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 16, flexDirection: isMobile ? 'column' : 'row', background: D.paperAlt }}>
        <div>
          <Link to="/admin/products" style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum, textDecoration: 'none' }}>← PRODUCTS</Link>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 400, letterSpacing: -0.9, lineHeight: 1.05, margin: '8px 0 0' }}>
            {existing ? form.name || form.sku : 'New product'}
          </h1>
          <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3, marginTop: 4 }}>
            {existing ? `${existing.sku} · ${existing.product_type}` : 'Add a new SKU to the catalog'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {saved && (
            <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: '#3b8760' }}>
              <Icon.check /> SAVED
            </span>
          )}
          {dirty && !saved && (
            <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.terra }}>UNSAVED</span>
          )}
          {existing && (
            <Link to={`/products/${encodeURIComponent(existing.sku)}`} target="_blank" rel="noreferrer" style={ghostBtn}>
              View live →
            </Link>
          )}
          <button onClick={discard} style={ghostBtn}>{dirty ? 'Discard' : 'Close'}</button>
          {existing && (
            <button onClick={deleteProduct} style={{ ...ghostBtn, color: D.terra, borderColor: D.terra }}>
              Delete
            </button>
          )}
          <button onClick={save} disabled={!dirty && !!existing} style={{ ...primaryBtn, opacity: !dirty && !!existing ? 0.5 : 1, cursor: !dirty && !!existing ? 'default' : 'pointer' }}>
            {existing ? 'Save changes' : 'Create product'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 24, padding: `${isMobile ? 24 : 32}px ${padX}px ${isMobile ? 48 : 80}px` }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <Card title="Basics">
            <Field label="Title">
              <input value={form.name || ''} onChange={(e) => patch({ name: e.target.value })} style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="SKU">
                <input value={form.sku || ''} onChange={(e) => patch({ sku: e.target.value, id: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="URL handle">
                <input value={form.handle || ''} onChange={(e) => patch({ handle: e.target.value })} placeholder="auto-from-title" style={inputStyle} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <Field label="Vendor">
                <input value={form.vendor || ''} onChange={(e) => patch({ vendor: e.target.value })} style={inputStyle} />
              </Field>
              <Field label="Category">
                <select value={form.category || 'Orthotics'} onChange={(e) => patch({ category: e.target.value })} style={inputStyle}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Tier">
                <select value={form.tier || 'Bracing'} onChange={(e) => patch({ tier: e.target.value })} style={inputStyle}>
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Product category (M6 taxonomy) — required">
              <select value={form.m6_category || ''} onChange={(e) => patch({ m6_category: e.target.value })} style={inputStyle}>
                <option value="" disabled>Select a category…</option>
                {M6_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Summary (1-line for cards)">
              <input value={form.summary || ''} onChange={(e) => patch({ summary: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Description (full)">
              <textarea
                value={form.description || ''}
                onChange={(e) => patch({ description: e.target.value })}
                rows={9}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: D.sans, lineHeight: 1.5 }}
                placeholder="Long-form product description (manufacturer copy, key features, billing, etc.)"
              />
            </Field>
          </Card>

          <Card title="Pricing & inventory">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <Field label="Price"><input type="number" step="0.01" value={form.price ?? 0} onChange={(e) => patch({ price: e.target.value })} style={inputStyle} /></Field>
              <Field label="Price min"><input type="number" step="0.01" value={form.price_min ?? 0} onChange={(e) => patch({ price_min: e.target.value })} style={inputStyle} /></Field>
              <Field label="Price max"><input type="number" step="0.01" value={form.price_max ?? 0} onChange={(e) => patch({ price_max: e.target.value })} style={inputStyle} /></Field>
              <Field label="COGS"><input type="number" step="0.01" value={form.cogs ?? 0} onChange={(e) => patch({ cogs: e.target.value })} style={inputStyle} /></Field>
              <Field label="MOQ"><input type="number" value={form.moq ?? 1} onChange={(e) => patch({ moq: e.target.value })} style={inputStyle} /></Field>
              <Field label="Pack size"><input value={form.pack_size || ''} onChange={(e) => patch({ pack_size: e.target.value })} style={inputStyle} /></Field>
              <Field label="HCPCS"><input value={form.hcpcs || ''} onChange={(e) => patch({ hcpcs: e.target.value })} style={inputStyle} /></Field>
              <Field label="Country of origin">
                <select value={form.country_of_origin || 'CN'} onChange={(e) => patch({ country_of_origin: e.target.value })} style={inputStyle}>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </Card>

          <Card
            title={`Variants · ${form.variants?.length || 0}`}
            action={<button onClick={addVariant} style={ghostBtn}>+ Add variant</button>}
          >
            {(!form.variants || form.variants.length === 0) && (
              <div style={{ padding: '14px 0', color: D.ink3, fontSize: 13 }}>
                No variants. Single-SKU products use the price above.
              </div>
            )}
            {form.variants?.length > 0 && (
              <div className="um-scroll-x">
                <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3 }}>
                      <th style={thStyle}>TITLE</th>
                      <th style={thStyle}>SKU</th>
                      <th style={thStyle}>PRICE</th>
                      <th style={thStyle}>AVAILABLE</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.variants.map((v, i) => (
                      <tr key={v.variant_id || i} style={{ borderTop: `1px solid ${D.line}` }}>
                        <td style={tdSmall}><input value={v.title || ''} onChange={(e) => setVariant(i, { title: e.target.value })} style={smallInput} /></td>
                        <td style={tdSmall}><input value={v.sku || ''} onChange={(e) => setVariant(i, { sku: e.target.value })} style={{ ...smallInput, fontFamily: D.mono }} /></td>
                        <td style={tdSmall}><input type="number" step="0.01" value={v.price ?? 0} onChange={(e) => setVariant(i, { price: parseFloat(e.target.value) || 0 })} style={{ ...smallInput, textAlign: 'right', fontFamily: D.mono }} /></td>
                        <td style={tdSmall}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: D.ink2 }}>
                            <input type="checkbox" checked={!!v.available} onChange={(e) => setVariant(i, { available: e.target.checked })} style={{ accentColor: D.plum }} />
                            {v.available ? 'In stock' : 'Out of stock'}
                          </label>
                        </td>
                        <td style={tdSmall}>
                          <button onClick={() => removeVariant(i)} style={{ ...textBtn, color: D.terra }}>REMOVE</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Tags & collections">
            <Field label="Tags (comma-separated)">
              <input
                value={tagsString}
                onChange={(e) => patch({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                placeholder="ortho, recovery, knee brace"
                style={inputStyle}
              />
            </Field>
            <Field label="Collections (comma-separated)">
              <input
                value={collectionsString}
                onChange={(e) => patch({ collections: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                placeholder="Knee Braces, Orthopedic Bracing"
                style={inputStyle}
              />
            </Field>
          </Card>
        </div>

        <div style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <Card title="Hero image">
            <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${D.line}`, background: D.paperAlt, aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {form.hero_image ? (
                <img src={form.hero_image} alt={form.name || ''} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />
              ) : (
                <span style={{ color: D.ink3, fontFamily: D.mono, fontSize: 11, letterSpacing: 1 }}>NO IMAGE</span>
              )}
            </div>
          </Card>

          <Card
            title={`Gallery · ${form.images?.length || 0}`}
            action={<button onClick={addImageUrl} style={ghostBtn}>+ Add URL</button>}
          >
            {(!form.images || form.images.length === 0) && (
              <div style={{ color: D.ink3, fontSize: 13, padding: '8px 0' }}>No images yet.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {(form.images || []).map((src, i) => (
                <div key={`${src}-${i}`} style={{ position: 'relative', border: `1px solid ${D.line}`, borderRadius: 8, overflow: 'hidden', background: D.paperAlt }}>
                  <img src={src} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', background: '#fff' }} />
                  <div style={{ position: 'absolute', inset: 'auto 4px 4px 4px', display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                    <button onClick={() => moveImage(i, -1)} disabled={i === 0} style={imgPillBtn}>←</button>
                    <button onClick={() => moveImage(i, +1)} disabled={i === (form.images.length - 1)} style={imgPillBtn}>→</button>
                    <button onClick={() => removeImage(i)} style={{ ...imgPillBtn, color: D.terra }}>✕</button>
                  </div>
                  {i === 0 && (
                    <div style={{ position: 'absolute', top: 4, left: 4, background: D.plum, color: D.paper, fontFamily: D.mono, fontSize: 9, letterSpacing: 1, padding: '2px 8px', borderRadius: 4 }}>HERO</div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Compliance flags">
            {[
              ['fda_registered',  'FDA registered'],
              ['pdac_approved',   'PDAC approved'],
              ['taa_compliant',   'TAA compliant'],
              ['berry_compliant', 'Berry compliant'],
              ['mspv_listed',     'MSPV listed'],
              ['latex_free',      'Latex-free'],
              ['available',       'Available for purchase'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 13.5, color: D.ink2, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form[key]} onChange={(e) => patch({ [key]: e.target.checked })} style={{ accentColor: D.plum }} />
                {label}
              </label>
            ))}
          </Card>

          {existing && (
            <Card title="Quick stats">
              <Stat label="Variants" value={String(existing.variants?.length || 1)} />
              <Stat label="Images" value={String(existing.images?.length || 0)} />
              <Stat label="Stock (all DCs)" value={fmt.number(db.list('inventory', { where: { sku: existing.sku } }).reduce((a, b) => a + b.on_hand, 0))} />
              <Stat label="Lifetime orders" value={String(db.list('order_items', { where: { sku: existing.sku } }).length)} />
            </Card>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function Card({ title, children, action }) {
  return (
    <div style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: D.display, fontSize: 20, letterSpacing: -0.3 }}>{title}</div>
        {action}
      </div>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${D.line}` }}>
      <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, color: D.ink3 }}>{label.toUpperCase()}</span>
      <span style={{ fontFamily: D.display, fontSize: 16, color: D.ink, letterSpacing: -0.2 }}>{value}</span>
    </div>
  );
}

const inputStyle = { width: '100%', padding: '10px 12px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13, color: D.ink, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
const smallInput = { width: '100%', padding: '6px 8px', background: D.paper, border: `1px solid ${D.line}`, borderRadius: 6, fontSize: 12, color: D.ink, outline: 'none', boxSizing: 'border-box' };
const thStyle = { padding: '10px 8px', textAlign: 'left' };
const tdSmall = { padding: '6px 4px' };
const primaryBtn = { background: D.plum, color: D.paper, border: 'none', padding: '11px 22px', borderRadius: 4, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' };
const ghostBtn = { background: 'transparent', color: D.ink, border: `1px solid ${D.line}`, padding: '10px 18px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 };
const textBtn = { background: 'transparent', color: D.plum, border: 'none', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, letterSpacing: 0.8, padding: '4px 6px' };
const imgPillBtn = { flex: 1, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', padding: '4px 0', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' };
