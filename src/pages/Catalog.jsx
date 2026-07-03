// Catalog — reworked per PRD-28 §5.1:
//   · 3-supply-state model (In Stock / Source / Available to Quote) replaces
//     the binary IN STOCK/LOW badge. OOS items still SHOW, with a sourcing
//     path (per M1) — never hidden, never claimed in stock.
//   · Hero no longer claims "everything in stock".
//   · Category chips run on the M6 taxonomy (§5.6).
//   · Compliance filters wired to real product flags.
//   · Fake "updated 04 min ago" removed — the WMS projection IS live.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
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
import { categorize, M6_CATEGORIES, SUPPLY_STATES } from '../lib/taxonomy.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { PRODUCT_IMG } from '../lib/imageMap.js';

// Compliance filters — wired to the real product flags (PRD-28 §5.1).
const COMPLIANCE_FILTERS = [
  ['PDAC-approved', 'pdac_approved'],
  ['Berry compliant', 'berry_compliant'],
  ['TAA compliant', 'taa_compliant'],
  ['MSPV listed', 'mspv_listed'],
];

// Legacy ?cat= values from old links map onto the M6 taxonomy.
const LEGACY_CAT_MAP = {
  orthotics: 'Bracing & Orthotics',
  diagnostics: 'Diagnostic Tests',
  ppe: 'American-Made PPE',
  surgical: 'Other / Medava',
  supplements: 'Supplements',
};

function SupplyBadge({ state }) {
  const color = state.id === 'in_stock' ? '#3b8760' : D.terra;
  return (
    <span style={{ color, display: 'inline-flex', alignItems: 'center', gap: 5 }} title={state.desc}>
      <Icon.dot /> {state.short}
    </span>
  );
}

export function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isMobile, isTablet } = useViewport();
  const padX = isMobile ? 20 : 40;
  const PRODUCTS = db.useTable('products');
  const inventory = db.useTable('inventory');
  const cats = useMemo(() => ['All', ...M6_CATEGORIES.filter((c) => PRODUCTS.some((p) => categorize(p) === c))], [PRODUCTS]);
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
    const direct = M6_CATEGORIES.find((c) => c.toLowerCase() === q.toLowerCase());
    return direct || LEGACY_CAT_MAP[q.toLowerCase()] || 'All';
  })();

  const [cat, setCat] = useState(initialCat);
  // Deep links like /catalog?filter=pdac (PDAC-page CTA) pre-select the
  // matching compliance filter.
  const [compliance, setCompliance] = useState(() => {
    const f = (searchParams.get('filter') || '').toLowerCase();
    const flag = COMPLIANCE_FILTERS.find(([, id]) => id.startsWith(f) && f)?.[1];
    return new Set(flag ? [flag] : []);
  });
  const [supplyFilter, setSupplyFilter] = useState('all'); // all | in_stock | source

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
      ? 'The Unite catalog: bracing & orthotics, diagnostic tests, American-made PPE, syringes, and supplements — stocked items ship same-day before 2pm EST, and anything we don\u2019t stock, we source. No minimums on stocked items.'
      : `${cat} from Unite Medical — stocked items ship same-day on orders before 2pm EST; out-of-stock items are sourced through our vetted network. No minimums on stocked items.`,
    canonical: cat === 'All' ? '/catalog' : `/catalog?cat=${encodeURIComponent(cat)}`,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      const stocked = (stockBySku.get(p.sku) || 0) > 0;
      return (cat === 'All' || categorize(p) === cat) &&
        (compliance.size === 0 || [...compliance].every((flag) => p[flag])) &&
        (supplyFilter === 'all' || (supplyFilter === 'in_stock' ? stocked : !stocked)) &&
        (!q || `${p.name} ${p.sku} ${p.hcpcs}`.toLowerCase().includes(q));
    });
  }, [PRODUCTS, cat, compliance, supplyFilter, search, stockBySku]);

  const toggleCompliance = (flag) => {
    const n = new Set(compliance);
    if (n.has(flag)) n.delete(flag); else n.add(flag);
    setCompliance(n);
  };

  const supplyStates = [
    ['all', 'Everything'],
    ['in_stock', SUPPLY_STATES.in_stock.label],
    ['source', SUPPLY_STATES.source.label],
  ];

  const filterPanel = (
    <>
      <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, marginBottom: 14 }}>SUPPLY STATE</div>
      {supplyStates.map(([id, label]) => (
        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14, color: D.ink2, cursor: 'pointer' }}>
          <input type="radio" name="supply" checked={supplyFilter === id} onChange={() => setSupplyFilter(id)} style={{ accentColor: D.plum }} /> {label}
        </label>
      ))}
      <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.ink3, margin: '28px 0 14px' }}>COMPLIANCE</div>
      {COMPLIANCE_FILTERS.map(([label, flag]) => (
        <label key={flag} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 14, color: D.ink2, cursor: 'pointer' }}>
          <input type="checkbox" checked={compliance.has(flag)} onChange={() => toggleCompliance(flag)} style={{ accentColor: D.plum }} /> {label}
        </label>
      ))}
    </>
  );

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
      <div style={{ background: D.paperAlt, padding: `${isMobile ? 32 : 48}px ${padX}px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ maxWidth: 1360, margin: '0 auto' }}>
          <Eyebrow>CATALOG · STOCKED + SOURCED</Eyebrow>
          <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'end', justifyContent: 'space-between', marginTop: 10, flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <h1 style={{ fontFamily: D.display, fontSize: 'clamp(38px, 7.2vw, 72px)', fontWeight: 400, letterSpacing: 'clamp(-0.9px, -0.19vw, -1.8px)', margin: 0, lineHeight: 1.0 }}>
              {cat === 'All' ? <>The Unite <Grad>catalog</Grad></> : cat}
            </h1>
            <div style={{ fontFamily: D.mono, fontSize: 12, color: D.ink2 }}>{filtered.length} results</div>
          </div>
          <p style={{ fontSize: isMobile ? 13.5 : 14.5, color: D.ink2, margin: '12px 0 0', maxWidth: 640, lineHeight: 1.55 }}>
            Stocked items ship same-day on orders before 2pm EST — no minimums. Out of stock or
            not listed? We source it and quote you a firm price.
          </p>
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
              <summary style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1, color: D.plum, cursor: 'pointer' }}>
                FILTERS · {compliance.size + (supplyFilter !== 'all' ? 1 : 0)} active
              </summary>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${D.line}` }}>
                {filterPanel}
              </div>
            </details>
          ) : filterPanel}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(2, 1fr)' : 'repeat(3,1fr)', gap: isMobile ? 12 : 18 }}>
          {filtered.map((p) => {
            const stock = stockBySku.get(p.sku) || 0;
            // 3-state supply model (PRD-28 §5.1): stocked items ship today;
            // OOS items stay visible with a sourcing path (never hidden).
            const state = stock > 0 ? SUPPLY_STATES.in_stock : SUPPLY_STATES.source;
            const stocked = state.id === 'in_stock';
            return (
              <article key={p.sku} className="um-card" style={{ background: D.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${D.line}`, display: 'flex', flexDirection: 'column' }}>
                <Link to={`/products/${p.sku}`} style={{ display: 'block' }}>
                  <PhotoPlaceholder src={PRODUCT_IMG[p.sku]} caption={p.img} height={isMobile ? 140 : 210} stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum} />
                </Link>
                <div style={{ padding: isMobile ? 14 : 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.ink3 }}>
                    <span>{p.sku}</span>
                    <SupplyBadge state={state} />
                  </div>
                  <Link to={`/products/${p.sku}`} style={{ fontFamily: D.display, fontSize: isMobile ? 16 : 19, color: D.ink, marginTop: 10, lineHeight: 1.25, minHeight: isMobile ? 40 : 46 }}>{p.name}</Link>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{categorize(p)}{!isMobile && ` · HCPCS ${p.hcpcs}`}</div>
                  <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginTop: 14 }}>
                    <div>
                      <div style={{ fontFamily: D.display, fontSize: isMobile ? 20 : 24, color: D.plum, letterSpacing: -0.4 }}>{p.price == null ? 'Quote' : fmt.money(p.price)}</div>
                      <div style={{ fontFamily: D.mono, fontSize: 10, color: D.ink3 }}>{p.pack_size} · MOQ {p.moq}</div>
                    </div>
                    {stocked ? (
                      <button aria-label={`Add ${p.name} to cart`} onClick={() => cartStore.add(p.sku)} style={{ background: D.ink, color: D.paper, border: 'none', width: 40, height: 40, borderRadius: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon.plus />
                      </button>
                    ) : (
                      <button
                        aria-label={`Request sourcing for ${p.name}`}
                        onClick={() => navigate(`/quote?sku=${encodeURIComponent(p.sku)}&path=source`)}
                        style={{ background: 'transparent', color: D.terra, border: `1.5px solid ${D.terra}`, padding: '9px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 600, fontFamily: D.sans, flexShrink: 0 }}
                      >
                        Source it →
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center', color: D.ink3, background: D.card, borderRadius: 14, border: `1px dashed ${D.line}` }}>
              <div>No products match these filters.</div>
              <div style={{ marginTop: 12, fontSize: 14 }}>
                Need something we don&apos;t list?{' '}
                <Link to="/quote" style={{ color: D.plum, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  {SUPPLY_STATES.quote.label} — start an RFQ →
                </Link>
              </div>
            </div>
          )}
          {/* 3rd supply state — open RFQ for items not in the catalog */}
          {filtered.length > 0 && (
            <div style={{ gridColumn: '1 / -1', marginTop: 8, padding: isMobile ? 18 : 24, background: D.paperAlt, borderRadius: 14, border: `1px solid ${D.line}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px' }}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{SUPPLY_STATES.quote.short} · ANYTHING NOT LISTED</div>
                <div style={{ fontSize: 14.5, color: D.ink2, marginTop: 6, lineHeight: 1.55 }}>{SUPPLY_STATES.quote.desc}</div>
              </div>
              <button onClick={() => navigate('/quote')} style={{ background: D.plum, color: D.paper, border: 'none', padding: '12px 22px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: D.sans }}>
                {SUPPLY_STATES.quote.cta} →
              </button>
            </div>
          )}
        </div>
      </div>
      </main>
      <Footer />
    </div>
  );
}
