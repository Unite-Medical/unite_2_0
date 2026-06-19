import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Grad } from '../components/shared/Grad.jsx';
import { Eyebrow } from '../components/shared/Eyebrow.jsx';
import { cartStore } from '../store/cart.js';
import { db } from '../lib/db.js';
import { availability } from '../lib/wms/availability.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { PRODUCT_IMG } from '../lib/imageMap.js';

export function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isMobile, isTablet } = useViewport();
  const padX = isMobile ? 20 : 40;
  const PRODUCTS = db.useTable('products');
  const inventory = db.useTable('inventory');
  const cats = useMemo(() => ['All', ...new Set(PRODUCTS.map((p) => p.category))], [PRODUCTS]);
  const tiers = useMemo(() => [...new Set(PRODUCTS.map((p) => p.tier))], [PRODUCTS]);
  // Storefront gates on available-to-promise (on_hand − reserved), not raw
  // on_hand, so held stock can't be double-sold (PRD-25 Phase 1).
  const stockBySku = useMemo(() => {
    const map = new Map();
    for (const [sku, v] of availability.stockBySku()) map.set(sku, v.available);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory]);

  const initialCat = (() => {
    const q = searchParams.get('cat');
    if (!q) return 'All';
    return cats.find((c) => c.toLowerCase() === q.toLowerCase()) || 'All';
  })();

  const [cat, setCat] = useState(initialCat);
  const [tier, setTier] = useState(new Set());

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (cat === 'All') {
      params.delete('cat');
    } else {
      params.set('cat', cat);
    }
    setSearchParams(params, { replace: true });
  }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const [search, setSearch] = useState('');

  useSEO({
    title: cat === 'All'
      ? 'Medical supply catalog · Unite Medical'
      : `${cat} · Catalog`,
    description: cat === 'All'
      ? 'Browse the Unite Medical catalog: orthotics, diagnostics, PPE, wound care, equipment, and pharmaceuticals. Veteran-owned, FDA-registered. No minimums on stocked items. Same-day shipping on orders before 2pm EST.'
      : `${cat} from Unite Medical — in stock, no minimums on stocked items, same-day shipping on orders before 2pm EST. Veteran-owned, FDA-registered catalog.`,
    canonical: cat === 'All' ? '/catalog' : `/catalog?cat=${encodeURIComponent(cat)}`,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PRODUCTS.filter((p) =>
      (cat === 'All' || p.category === cat) &&
      (tier.size === 0 || tier.has(p.tier)) &&
      (!q || `${p.name} ${p.sku} ${p.hcpcs}`.toLowerCase().includes(q))
    );
  }, [PRODUCTS, cat, tier, search]);

  const toggle = (t) => {
    const n = new Set(tier);
    if (n.has(t)) n.delete(t); else n.add(t);
    setTier(n);
  };

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
      <div style={{ background: D.paperAlt, padding: `${isMobile ? 32 : 48}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ maxWidth: 1360, margin: '0 auto' }}>
          <Eyebrow>CATALOG · STOCKED & SHIPPING SAME DAY</Eyebrow>
          <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'end', justifyContent: 'space-between', marginTop: 10, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <h1 style={{ fontFamily: D.display, fontSize: 'clamp(38px, 7.2vw, 72px)', fontWeight: 400, letterSpacing: 'clamp(-0.9px, -0.19vw, -1.8px)', margin: 0, lineHeight: 1.0 }}>
              {cat === 'All' ? <>Everything <Grad>in stock</Grad></> : cat}
            </h1>
            <div style={{ fontFamily: D.mono, fontSize: 12, color: D.ink2 }}>{filtered.length} results · updated 04 min ago</div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: `1px solid ${D.line}`, borderRadius: 999, background: D.card, flex: '1 1 280px', maxWidth: 420 }}>
              <Icon.search />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU, name, HCPCS"
                aria-label="Search products"
                style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, fontSize: 14, fontFamily: D.sans, color: D.ink }}
              />
            </div>
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} style={{
                background: cat === c ? D.plum : D.card, color: cat === c ? D.paper : D.ink2,
                border: `1px solid ${cat === c ? D.plum : D.line}`,
                padding: '8px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontFamily: D.sans,
              }}>{c}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 1360, margin: '0 auto', padding: `32px ${padX}px 80px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px 1fr', gap: isMobile ? 20 : 40 }}>
        <div>
          {isMobile ? (
            <details style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: '12px 14px' }}>
              <summary style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum, cursor: 'pointer' }}>FILTERS · {tier.size} active</summary>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${D.line}` }}>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, marginBottom: 8 }}>TIER</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {tiers.map((t) => (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14, color: D.ink2, cursor: 'pointer' }}>
                      <input type="checkbox" checked={tier.has(t)} onChange={() => toggle(t)} style={{ accentColor: D.plum }} /> {t}
                    </label>
                  ))}
                </div>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, margin: '18px 0 8px' }}>COMPLIANCE</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {['PDAC-approved', 'Berry compliant', 'TAA compliant', 'MSPV listed'].map((c) => (
                    <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13, color: D.ink2, cursor: 'pointer' }}>
                      <input type="checkbox" style={{ accentColor: D.plum }} /> {c}
                    </label>
                  ))}
                </div>
              </div>
            </details>
          ) : (
            <>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, marginBottom: 14 }}>TIER</div>
              {tiers.map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14, color: D.ink2, cursor: 'pointer' }}>
                  <input type="checkbox" checked={tier.has(t)} onChange={() => toggle(t)} style={{ accentColor: D.plum }} /> {t}
                </label>
              ))}
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, margin: '28px 0 14px' }}>COMPLIANCE</div>
              {['PDAC-approved', 'Berry compliant', 'TAA compliant', 'MSPV listed'].map((c) => (
                <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14, color: D.ink2, cursor: 'pointer' }}>
                  <input type="checkbox" style={{ accentColor: D.plum }} /> {c}
                </label>
              ))}
            </>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3,1fr)', gap: isMobile ? 12 : 18 }}>
          {filtered.map((p) => {
            const stock = stockBySku.get(p.sku) || 0;
            const isLow = stock < 200;
            return (
              <article key={p.sku} className="um-card" style={{ background: D.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${D.line}`, display: 'flex', flexDirection: 'column' }}>
                <Link to={`/products/${p.sku}`} style={{ display: 'block' }}>
                  <PhotoPlaceholder src={PRODUCT_IMG[p.sku]} caption={p.img} height={isMobile ? 140 : 210} stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum} />
                </Link>
                <div style={{ padding: isMobile ? 14 : 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.ink3 }}>
                    <span>{p.sku}</span>
                    <span style={{ color: !isLow ? '#3b8760' : D.terra }}><Icon.dot /> {!isLow ? 'IN STOCK' : 'LOW'}</span>
                  </div>
                  <Link to={`/products/${p.sku}`} style={{ fontFamily: D.display, fontSize: isMobile ? 16 : 19, color: D.ink, marginTop: 10, lineHeight: 1.25, minHeight: isMobile ? 40 : 46 }}>{p.name}</Link>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{p.category}{!isMobile && ` · HCPCS ${p.hcpcs}`}</div>
                  <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginTop: 14 }}>
                    <div>
                      <div style={{ fontFamily: D.display, fontSize: isMobile ? 20 : 24, color: D.plum, letterSpacing: -0.4 }}>{fmt.money(p.price)}</div>
                      <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>{p.pack_size} · MOQ {p.moq}</div>
                    </div>
                    <button aria-label={`Add ${p.name} to cart`} onClick={() => cartStore.add(p.sku)} style={{ background: D.ink, color: D.paper, border: 'none', width: 40, height: 40, borderRadius: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon.plus />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center', color: D.ink3, background: D.card, borderRadius: 14, border: `1px dashed ${D.line}` }}>
              No products match these filters.
            </div>
          )}
        </div>
      </div>
      </main>
      <Footer />
    </div>
  );
}
