import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { cartStore } from '../store/cart.js';
import { parseQuickOrder } from '../lib/quickOrder.js';
import { buildReorder, buildReorderFromList, reorderLists } from '../lib/reorder.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

const TABS = [['quick', 'Quick order'], ['reorder', 'Reorder'], ['lists', 'Saved lists']];

export function AccountOrder() {
  const navigate = useNavigate();
  const session = auth.use();
  const { isMobile } = useViewport();
  useSEO({ title: 'Order', canonical: '/account/order', noindex: true });
  const orgId = session?.org_id || 'org_atlsurgical';
  const org = useMemo(() => db.get('organizations', orgId) || { id: orgId }, [orgId]);
  const [tab, setTab] = useState('quick');

  function addLines(lines) {
    for (const l of lines) cartStore.add(l.sku, l.qty);
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main" style={{ maxWidth: 1100, margin: '0 auto', padding: `${isMobile ? 32 : 52}px ${isMobile ? 20 : 40}px 80px` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>ORDERING · {org.name?.toUpperCase()}</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px,6vw,60px)', fontWeight: 400, letterSpacing: -1.2, margin: '8px 0 20px', lineHeight: 1 }}>Place an order</h1>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding: '9px 16px', borderRadius: 999, border: `1.5px solid ${tab === id ? D.plum : D.line}`, background: tab === id ? D.plum : D.card, color: tab === id ? D.paper : D.ink2, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{label}</button>
          ))}
        </div>

        {tab === 'quick' && <QuickOrder org={org} onAdd={addLines} navigate={navigate} />}
        {tab === 'reorder' && <Reorder org={org} onAdd={addLines} navigate={navigate} />}
        {tab === 'lists' && <SavedLists org={org} onAdd={addLines} navigate={navigate} />}
      </main>
    </div>
  );
}

function QuickOrder({ org, onAdd, navigate }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseQuickOrder(text, org), [text, org]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, color: D.ink2, marginBottom: 10 }}>Paste or type one line per item — <code>SKU, qty</code> (also accepts <code>SKU 12</code> or <code>SKU x12</code>). Prices are your contracted prices.</div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder={'UM-0001, 12\nUM-0042 x4'} style={{ width: '100%', boxSizing: 'border-box', fontFamily: D.mono, fontSize: 13, padding: 12, border: `1px solid ${D.line}`, borderRadius: 8, resize: 'vertical' }} />
      </div>
      {parsed.lines.length > 0 && (
        <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{['SKU', 'PRODUCT', 'QTY', 'UNIT', 'EXT', ''].map((h) => <th key={h} style={{ padding: '10px 12px', textAlign: 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {parsed.lines.map((l, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${D.line}`, background: l.valid ? 'transparent' : 'rgba(193,75,60,.06)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono, color: l.valid ? D.plum : D.terra }}>{l.sku || l.raw}</td>
                  <td style={{ padding: '10px 12px', color: D.ink2 }}>{l.valid ? l.name : l.error}</td>
                  <td style={{ padding: '10px 12px' }}>{l.qty || '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{l.valid ? fmt.money(l.unit_price) : '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono, fontWeight: 600 }}>{l.valid ? fmt.money(l.ext_price) : '—'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>{l.valid ? l.basis : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTop: `1px solid ${D.line}`, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ fontSize: 13, color: D.ink2 }}>{parsed.validCount} valid line(s){parsed.invalidCount ? ` · ${parsed.invalidCount} need fixing` : ''} · subtotal <b>{fmt.money(parsed.subtotal)}</b></div>
            <button disabled={!parsed.validCount} onClick={() => { onAdd(parsed.valid); navigate('/checkout'); }} style={primaryBtn(parsed.validCount)}>Add {parsed.validCount} to cart → checkout</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Reorder({ org, onAdd, navigate }) {
  const orders = db.useTable('orders', { where: { customer_id: org.id }, orderBy: 'placed_at', dir: 'desc' }).slice(0, 12);
  const [preview, setPreview] = useState(null);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {orders.length === 0 && <div style={{ color: D.ink3 }}>No past orders yet.</div>}
      {orders.map((o) => (
        <div key={o.id} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: D.mono, color: D.plum }}>{o.id}</div>
            <div style={{ fontSize: 12, color: D.ink2 }}>{fmt.date(o.placed_at)} · {fmt.money(o.total)} · {o.status?.replace('_', ' ')}</div>
          </div>
          <button onClick={() => setPreview({ id: o.id, lines: buildReorder(o.id, org) })} style={outlineBtn}>Reorder</button>
        </div>
      ))}
      {preview && <ReorderPreview title={`Reorder of ${preview.id}`} lines={preview.lines} onAdd={onAdd} navigate={navigate} onClose={() => setPreview(null)} />}
    </div>
  );
}

function SavedLists({ org, onAdd, navigate }) {
  const lists = reorderLists.forOrg(org.id);
  const cartItems = cartStore.items;
  const [name, setName] = useState('');
  const [preview, setPreview] = useState(null);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: D.ink2, flex: '1 1 240px' }}>Save the current cart ({cartItems.length} lines) as a reusable list.</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" style={{ padding: '9px 12px', border: `1px solid ${D.line}`, borderRadius: 8, fontSize: 13 }} />
        <button disabled={!name || !cartItems.length} onClick={() => { reorderLists.saveList(org, name, cartItems.map((c) => ({ sku: c.sku, qty: c.qty })), 'self'); setName(''); }} style={primaryBtn(name && cartItems.length)}>Save list</button>
      </div>
      {lists.length === 0 && <div style={{ color: D.ink3 }}>No saved lists yet.</div>}
      {lists.map((l) => (
        <div key={l.id} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div><div style={{ fontWeight: 600 }}>{l.name}</div><div style={{ fontSize: 12, color: D.ink2 }}>{l.items.length} items</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPreview({ id: l.id, name: l.name, lines: buildReorderFromList(l.id, org) })} style={outlineBtn}>Reorder</button>
            <button onClick={() => reorderLists.removeList(l.id)} style={{ ...outlineBtn, color: D.terra, borderColor: D.terra }}>Delete</button>
          </div>
        </div>
      ))}
      {preview && <ReorderPreview title={`Reorder · ${preview.name}`} lines={preview.lines} onAdd={onAdd} navigate={navigate} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ReorderPreview({ title, lines, onAdd, navigate, onClose }) {
  const changed = lines.filter((l) => l.price_changed);
  const subtotal = lines.reduce((a, b) => a + b.unit_price * b.qty, 0);
  return (
    <div style={{ background: D.card, border: `1.5px solid ${D.plum}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${D.line}`, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: D.display, fontSize: 18 }}>{title}</div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: D.ink3 }}>✕</button>
      </div>
      {changed.length > 0 && <div style={{ padding: '10px 16px', background: 'rgba(214,158,46,.12)', fontSize: 12, color: D.ink2 }}>{changed.length} line(s) re-priced since the original order — review before placing.</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderTop: `1px solid ${D.line}` }}>
              <td style={{ padding: '10px 12px', fontFamily: D.mono, color: D.plum }}>{l.sku}</td>
              <td style={{ padding: '10px 12px', color: D.ink2 }}>{l.name}</td>
              <td style={{ padding: '10px 12px' }}>× {l.qty}</td>
              <td style={{ padding: '10px 12px', fontFamily: D.mono }}>{fmt.money(l.unit_price)}{l.price_changed && <span style={{ color: D.terra, fontSize: 11 }}> ({l.price_delta > 0 ? '+' : ''}{fmt.money(l.price_delta)})</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTop: `1px solid ${D.line}` }}>
        <div style={{ fontSize: 13 }}>Subtotal <b>{fmt.money(subtotal)}</b></div>
        <button onClick={() => { onAdd(lines); navigate('/checkout'); }} style={primaryBtn(true)}>Add to cart → checkout</button>
      </div>
    </div>
  );
}

const primaryBtn = (on) => ({ background: D.plum, color: D.paper, border: 'none', padding: '11px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: on ? 'pointer' : 'default', opacity: on ? 1 : 0.5 });
const outlineBtn = { background: 'transparent', color: D.plum, border: `1.5px solid ${D.plum}`, padding: '9px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
