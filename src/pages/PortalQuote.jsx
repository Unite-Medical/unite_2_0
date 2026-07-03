/**
 * Customer self-serve quoting portal — PRD-19.
 *
 * Browse the stocked catalog, add SKUs + quantities, and generate a real
 * quote priced at your account tier — no rep required. The quote is
 * persisted with an acceptance token, so "Generate quote" lands the
 * customer straight on the `/q/:token` acceptance page. A sourcing-request
 * box captures anything we don't stock.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { priceFor } from '../lib/pricing.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { buildSelfServeQuote, requestSourcing } from '../lib/selfServeQuote.js';

export function PortalQuote() {
  const navigate = useNavigate();
  const session = auth.use();
  const org = auth.org();
  const { isMobile } = useViewport();
  const products = db.useTable('products', { orderBy: 'name', dir: 'asc' });

  const [query, setQuery] = useState('');
  const [cart, setCart] = useState({}); // sku -> qty
  const [busy, setBusy] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [sourceDone, setSourceDone] = useState(false);

  useSEO({ title: 'Build a quote', description: 'Self-serve catalog quoting — priced at your account tier, accept online.', canonical: '/portal/quote', noindex: true });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? products.filter((p) => `${p.name} ${p.sku} ${p.category || ''}`.toLowerCase().includes(q)) : products;
    return list.slice(0, 40);
  }, [products, query]);

  const lines = useMemo(() => Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([sku, qty]) => {
      const p = db.get('products', sku) || db.list('products', { where: { sku } })[0];
      const price = priceFor({ sku, qty, basePrice: p?.price, org });
      return { sku, name: p?.name || sku, qty, unit: price.unit_price, list: price.list_price, ext: +(price.unit_price * qty).toFixed(2), contract: price.contract, discount: price.tier_discount_pct };
    }), [cart, org]);

  const total = lines.reduce((a, l) => a + l.ext, 0);

  function setQty(sku, qty) {
    setCart((c) => ({ ...c, [sku]: Math.max(0, Math.round(qty || 0)) }));
  }

  async function generate() {
    setBusy(true);
    const res = buildSelfServeQuote({
      items: lines.map((l) => ({ sku: l.sku, qty: l.qty })),
      org,
      customerName: org?.name,
      contactEmail: session?.email,
    });
    setBusy(false);
    if (res.ok) navigate(`/q/${res.quote.acceptance_token}`);
  }

  function submitSourcing() {
    const res = requestSourcing({ description: sourceText, org, contactEmail: session?.email });
    if (res.ok) { setSourceDone(true); setSourceText(''); }
  }

  const pad = isMobile ? 20 : 40;

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <div style={{ padding: `${isMobile ? 32 : 56}px ${pad}px 24px`, maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>SELF-SERVE QUOTING</div>
          <h1 style={{ fontFamily: D.display, fontSize: 'clamp(36px, 7vw, 72px)', fontWeight: 400, letterSpacing: -1.4, margin: '12px 0 0', lineHeight: 1.02 }}>Build your quote</h1>
          <div style={{ fontSize: isMobile ? 14 : 16, color: D.ink2, marginTop: 14, maxWidth: 640 }}>
            Add stocked items below — pricing reflects {org ? <>your <strong>{org.name}</strong> account tier ({org.tier})</> : 'list pricing (sign in for your account tier)'}. Generate the quote and accept it online to convert it into an order.
          </div>
        </div>

        <div style={{ maxWidth: 1280, margin: '0 auto', padding: `8px ${pad}px 80px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* Catalog picker */}
          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the catalog — name, SKU, or category"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${D.line}`, fontSize: 15, fontFamily: D.sans, background: D.card, color: D.ink, boxSizing: 'border-box' }}
            />
            <div style={{ marginTop: 16, background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {filtered.map((p, i) => {
                const qty = cart[p.sku] || 0;
                return (
                  <div key={p.sku} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>{p.sku} · {fmt.money(p.price)} list</div>
                    </div>
                    <input
                      type="number" min="0" value={qty || ''}
                      onChange={(e) => setQty(p.sku, Number(e.target.value))}
                      placeholder="qty"
                      style={{ width: 80, padding: '8px 10px', borderRadius: 8, border: `1px solid ${D.line}`, fontSize: 14, fontFamily: D.mono, textAlign: 'right', background: D.paper, color: D.ink }}
                    />
                  </div>
                );
              })}
              {filtered.length === 0 && <div style={{ padding: 24, color: D.ink3, fontSize: 14 }}>No products match “{query}”.</div>}
            </div>

            {/* Sourcing request */}
            <div style={{ marginTop: 24, background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>CAN&apos;T FIND IT?</div>
              <div style={{ fontSize: 14, color: D.ink2, marginTop: 8 }}>Tell us what you need — our sourcing desk hunts it down globally and quotes you landed cost.</div>
              {sourceDone ? (
                <div style={{ marginTop: 12, color: '#3b8760', fontSize: 14 }}>Got it — our sourcing team will be in touch.</div>
              ) : (
                <>
                  <textarea value={sourceText} onChange={(e) => setSourceText(e.target.value)} rows={3} placeholder="e.g. 5,000 units nitrile exam gloves, blue, size L, EN455"
                    style={{ width: '100%', marginTop: 12, padding: 12, borderRadius: 10, border: `1px solid ${D.line}`, fontSize: 14, fontFamily: D.sans, background: D.paper, color: D.ink, boxSizing: 'border-box', resize: 'vertical' }} />
                  <button type="button" onClick={submitSourcing} disabled={!sourceText.trim()} style={{ marginTop: 10, background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '10px 18px', borderRadius: 4, cursor: sourceText.trim() ? 'pointer' : 'not-allowed', fontSize: 14, fontWeight: 600, opacity: sourceText.trim() ? 1 : 0.5 }}>Request sourcing</button>
                </>
              )}
            </div>
          </div>

          {/* Quote summary */}
          <div style={{ position: isMobile ? 'static' : 'sticky', top: 92 }}>
            <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 22 }}>
              <div style={{ fontFamily: D.display, fontSize: 24, letterSpacing: -0.4 }}>Your quote</div>
              {lines.length === 0 ? (
                <div style={{ color: D.ink3, fontSize: 14, marginTop: 14 }}>Add items from the catalog to start your quote.</div>
              ) : (
                <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                  {lines.map((l) => (
                    <div key={l.sku} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, borderBottom: `1px solid ${D.line}`, paddingBottom: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                        <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>
                          {l.qty.toLocaleString()} × {fmt.money(l.unit)}
                          {l.discount > 0 && <span style={{ color: '#3b8760' }}> · −{l.discount}%{l.contract ? ' contract' : ''}</span>}
                        </div>
                      </div>
                      <div style={{ fontFamily: D.mono, fontWeight: 600 }}>{fmt.money(l.ext)}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                    <span style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3 }}>TOTAL (FOB GA)</span>
                    <span style={{ fontFamily: D.display, fontSize: 28, color: D.plum }}>{fmt.money(total)}</span>
                  </div>
                  <button type="button" onClick={generate} disabled={busy} style={{ marginTop: 8, background: D.plum, color: D.paper, border: 'none', padding: '14px', borderRadius: 4, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
                    {busy ? 'Generating…' : 'Generate quote →'}
                  </button>
                  <div style={{ fontSize: 11, color: D.ink3, textAlign: 'center' }}>You&apos;ll be able to review and accept it on the next screen.</div>
                </div>
              )}
            </div>
            {!session && (
              <div style={{ marginTop: 14, fontSize: 13, color: D.ink2, textAlign: 'center' }}>
                <button type="button" onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: D.plum, cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}>Sign in</button> to price at your negotiated account tier.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
