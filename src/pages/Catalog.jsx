// Catalog — reworked per PRD-28 §5.1:
//   · 3-supply-state model (In Stock / Source / Available to Quote) replaces
//     the binary IN STOCK/LOW badge. OOS items still SHOW, with a sourcing
//     path (per M1) — never hidden, never claimed in stock.
//   · Hero no longer claims "everything in stock".
//   · Category chips run on the M6 taxonomy (§5.6).
//   · Compliance filters wired to real product flags.
//   · Fake "updated 04 min ago" removed — the WMS projection IS live.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { HomepageFooter } from '../components/layout/HomepageFooter.jsx';
import './commerce-public.css';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { cartStore } from '../store/cart.js';
import { db } from '../lib/db.js';
import { availability } from '../lib/wms/availability.js';
import { categorize, M6_CATEGORIES, SUPPLY_STATES } from '../lib/taxonomy.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';
import { PRODUCT_IMG } from '../lib/imageMap.js';
import { auth } from '../lib/auth.js';
import { commerceAccessFor } from '../lib/accessPolicy.js';

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
  const { isMobile } = useViewport();
  const PRODUCTS = db.useTable('products');
  const inventory = db.useTable('inventory');
  const accountPrices = db.useTable('account_prices');
  const session = auth.use();
  const organization = db.useRow('organizations', session?.org_id || '__anonymous__');
  const commerce = commerceAccessFor(session, organization);
  const priceBySku = useMemo(() => new Map(
    accountPrices.filter((row) => row.ok !== false && Number(row.quantity || 1) === 1)
      .map((row) => [row.sku, row]),
  ), [accountPrices]);
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

  const [search, setSearch] = useState(() => searchParams.get('q') || '');

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

  const resetFilters = () => { setCat('All'); setCompliance(new Set()); setSupplyFilter('all'); setSearch(''); };
  return <div className="uc-page">
    <Nav />
    <main id="main">
      <header className="uc-hero uc-wrap">
        <p className="uc-eyebrow">THE UNITE CATALOG / STOCKED + SOURCED</p>
        <div className="uc-hero-grid"><h1>Equipped for<br /><span>better care.</span></h1><div><p>The essentials you rely on. A sourcing team for everything else. Find the right supplies for your next day of care.</p><Link className="uc-button" to="/portal/quote">Build a quick quote <span>↗</span></Link></div></div>
        <div className="uc-proof"><span>Bracing & orthotics</span><span>Diagnostic tests</span><span>Medical supplies</span><span>One supply partner</span></div>
      </header>
      <section className="uc-shop uc-wrap" aria-label="Product catalog">
        <div className="uc-searchbar"><label className="uc-search"><Icon.search /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products, SKU, or HCPCS" aria-label="Search products" />{search&&<button onClick={()=>setSearch('')} aria-label="Clear search">×</button>}</label><span aria-live="polite">{filtered.length} products</span></div>
        <div className="uc-chips" aria-label="Product categories">{cats.map(c=><button key={c} aria-pressed={cat===c} onClick={()=>setCat(c)}>{c==='All'?'All products':c}</button>)}</div>
        <div className="uc-catalog-layout"><aside className="uc-filters"><details open={!isMobile}><summary>Refine your search</summary><div>{filterPanel}<button className="uc-text-button" onClick={resetFilters}>Reset filters ↗</button></div></details></aside>
          <div className="uc-products">{filtered.map(p=>{
            const stock=stockBySku.get(p.sku)||0;
            const state=stock>0?SUPPLY_STATES.in_stock:SUPPLY_STATES.source;
            const accountPrice=priceBySku.get(p.sku);
            return <article key={p.sku} className="uc-product">
              <Link className="uc-product-image" to={`/products/${p.sku}`} aria-label={`View ${p.name}`}><PhotoPlaceholder src={PRODUCT_IMG[p.sku]} alt={p.name} caption="Product image coming soon" height={240} stripeFrom="#f5f5ef" stripeTo="#edeee6" /></Link>
              <div className="uc-product-body"><div className="uc-product-meta"><span>{categorize(p)}</span><SupplyBadge state={state}/></div>
                <h2><Link to={`/products/${p.sku}`}>{p.name}</Link></h2><p className="uc-sku">{p.sku}{p.hcpcs&&p.hcpcs!=='—'?` · HCPCS ${p.hcpcs}`:''}</p>
                <div className="uc-product-bottom"><p>{p.quote_only?'Quote on request':commerce.can_view_prices?(accountPrice?.unit_price!=null?fmt.money(accountPrice.unit_price):'Pricing unavailable'):'Business pricing available'}<small>{p.pack_size}{p.moq?` · MOQ ${p.moq}`:''}</small></p>
                {stock>0&&commerce.can_use_cart&&accountPrice?.unit_price>0?<button className="uc-button uc-button-small" onClick={()=>cartStore.add(p.sku)} aria-label={`Add ${p.name} to cart`}>Add to cart +</button>:<Link className="uc-product-action" to={p.quote_only||stock<=0?`/quote?sku=${encodeURIComponent(p.sku)}&path=source`:`/portal/quote?sku=${encodeURIComponent(p.sku)}`}>{p.quote_only||stock<=0?'Request sourcing':'Add to quote'} <span>↗</span></Link>}
                </div>
              </div>
            </article>;
          })}
          {!filtered.length&&<div className="uc-empty"><p className="uc-eyebrow">LET’S TRY AGAIN</p><h2>No products found.</h2><p>Try another search or clear your filters. Our team can help source items beyond the catalog.</p><button className="uc-button" onClick={resetFilters}>Clear all filters ↗</button></div>}
          </div>
        </div>
        <div className="uc-callout"><div><p className="uc-eyebrow">BEYOND THE CATALOG</p><h2>Need something else?</h2><p>A specific brand. A hard-to-find item. An entire shortage list.<br/>Tell us what you need, and we’ll take it from here.</p></div><Link className="uc-button uc-button-light" to="/quote">Talk to our sourcing team ↗</Link></div>
      </section>
    </main><HomepageFooter />
  </div>;
}
