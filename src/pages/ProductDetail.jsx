import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Icon } from '../components/shared/Icon.jsx';
import { Lightbox } from '../components/shared/Lightbox.jsx';
import { cartStore } from '../store/cart.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { PRODUCT_IMG, productThumbs } from '../lib/imageMap.js';
import {
  productDescription,
  productHighlights,
  productCompliance,
  productDocuments,
  productReviews,
  relatedProducts,
  productStockByWarehouse,
} from '../lib/productCopy.js';
import { useSEO, productSchema, breadcrumbSchema } from '../lib/seo.js';

function tierForQty(qty) {
  if (qty >= 250) return '250+';
  if (qty >= 50) return '50-249';
  if (qty >= 10) return '10-49';
  return '1-9';
}

const DELIVERY_BY_ZONE = [
  { zone: 'Southeast (ATL hub)', eta: '1–2 days' },
  { zone: 'West Coast (RNO hub)', eta: '2–3 days' },
  { zone: 'South Central (DAL hub)', eta: '1–2 days' },
  { zone: 'Northeast / Midwest', eta: '3–4 days' },
];

export function ProductDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { isMobile, isTablet } = useViewport();
  const padX = isMobile ? 20 : 40;
  const product = db.useRow('products', id);
  const inv = db.useTable('inventory', { where: { sku: id } });
  const stock = inv.reduce((a, b) => a + b.on_hand, 0);
  const tiers = useMemo(() => db.list('pricing', { where: { sku: id }, orderBy: 'min_qty' }), [id]);
  const variants = useMemo(() => (product?.variants || []), [product?.variants]);
  const hasMultiVariants = variants.length > 1;
  const [variantIdx, setVariantIdx] = useState(0);
  const selectedVariant = hasMultiVariants ? variants[variantIdx] : null;
  const [qty, setQty] = useState(1);
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const tierLabel = tierForQty(qty);
  const activeTier = tiers.slice().reverse().find((t) => qty >= t.min_qty) || tiers[0];

  const gallery = useMemo(() => {
    if (!product) return [];
    const items = [];
    const realImages = product.images || [];
    if (realImages.length > 0) {
      realImages.forEach((src, i) => {
        items.push({
          src,
          alt: `${product.name || ''} — image ${i + 1}`,
          label: i === 0 ? 'Hero' : `View ${i + 1}`,
        });
      });
      return items;
    }
    // Fallback for legacy/marketing-only products with no real photos.
    const heroSrc = PRODUCT_IMG[id];
    const thumbs = productThumbs(id);
    if (heroSrc) items.push({ src: heroSrc, alt: product.name || '', label: 'Hero' });
    if (thumbs) {
      ['front', 'back', 'detail', 'packaging'].forEach((angle) => {
        items.push({
          src: thumbs[angle],
          alt: `${product.name || ''} — ${angle}`,
          label: angle,
        });
      });
    }
    return items;
  }, [id, product]);

  const description = useMemo(() => (product ? productDescription(product) : []), [product]);

  useSEO(product ? {
    title: product.name,
    description: `${product.name} — ${product.category}, ${product.pack_size}.${product.hcpcs && product.hcpcs !== '—' ? ` HCPCS ${product.hcpcs}.` : ''} ${stock.toLocaleString()} units in stock, Same-day shipping on orders before 2pm EST.`,
    canonical: `/products/${product.sku}`,
    type: 'product',
    ogImage: PRODUCT_IMG[product.sku],
    jsonLd: [
      productSchema(product, { stock, image: PRODUCT_IMG[product.sku] }),
      breadcrumbSchema([
        { name: 'Catalog', path: '/catalog' },
        { name: product.category, path: `/catalog?cat=${encodeURIComponent(product.category)}` },
        { name: product.name, path: `/products/${product.sku}` },
      ]),
    ],
  } : { title: 'Product not found', noindex: true });
  const highlights = useMemo(() => (product ? productHighlights(product) : []), [product]);
  const compliance = useMemo(() => (product ? productCompliance(product) : []), [product]);
  const documents = useMemo(() => (product ? productDocuments(product) : []), [product]);
  const reviews = useMemo(() => (product ? productReviews(product) : []), [product]);
  const related = useMemo(() => (product ? relatedProducts(product, 4) : []), [product]);
  const stockByWh = useMemo(() => (product ? productStockByWarehouse(product.sku) : []), [product]);

  if (!product) {
    return (
      <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
        <Nav />
        <main style={{ maxWidth: 640, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <h1 style={{ fontFamily: D.display, fontSize: 56, fontWeight: 400, letterSpacing: -1.2, lineHeight: 1, margin: 0 }}>Product not found.</h1>
          <button onClick={() => navigate('/catalog')} style={{ marginTop: 16, background: D.plum, color: D.paper, border: 'none', padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Back to catalog</button>
        </main>
      </div>
    );
  }

  const variantPrice = selectedVariant?.price ?? product.price;
  const price = hasMultiVariants ? variantPrice : (activeTier?.unit_price ?? product.price);
  const savingsPct = product.price && price < product.price ? Math.round(((product.price - price) / product.price) * 100) : 0;

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <nav aria-label="Breadcrumb" style={{ padding: `14px ${padX}px`, background: D.paperAlt, borderBottom: `1px solid ${D.line}`, fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, color: D.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Link to="/catalog" style={{ color: D.ink2 }}>Catalog</Link> / <Link to={`/catalog?cat=${encodeURIComponent(product.category)}`} style={{ color: D.ink2 }}>{product.category}</Link> / <span style={{ color: D.ink }}>{product.name}</span>
          </div>
        </nav>

        {/* TOP: hero + buy box */}
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `${isMobile ? 28 : 40}px ${padX}px ${isMobile ? 36 : 56}px`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: isMobile ? 28 : 56 }}>
          <div>
            <button
              onClick={() => gallery.length && setLightboxIdx(0)}
              aria-label={`Open ${product.name} gallery (${gallery.length} images)`}
              disabled={gallery.length === 0}
              style={{ position: 'relative', display: 'block', width: '100%', padding: 0, background: 'transparent', border: 'none', cursor: gallery.length ? 'zoom-in' : 'default' }}
            >
              <PhotoPlaceholder
                src={PRODUCT_IMG[product.sku]}
                caption={product.img}
                alt={product.name}
                height={isMobile ? 320 : 560}
                stripeFrom="#ebe3d3"
                stripeTo="#ddd1b7"
                textColor={D.plum}
              />
              {gallery.length > 1 && (
                <span aria-hidden="true" style={{ position: 'absolute', bottom: 14, right: 14, background: 'rgba(36, 26, 40, 0.78)', color: D.paper, fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, padding: '6px 12px', borderRadius: 999, backdropFilter: 'blur(6px)' }}>
                  + {gallery.length - 1} VIEWS
                </span>
              )}
            </button>
          </div>

          <div>
            <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>
              {product.sku} {product.hcpcs && product.hcpcs !== '—' ? `· HCPCS ${product.hcpcs}` : ''} {product.pdac_approved ? '· PDAC APPROVED' : ''}
            </div>
            <h1 style={{ fontFamily: D.display, fontSize: 'clamp(30px, 5.4vw, 48px)', fontWeight: 400, letterSpacing: -1, lineHeight: 1.08, margin: '14px 0 0' }}>{product.name}</h1>
            <div style={{ display: 'flex', gap: 4, marginTop: 14, alignItems: 'center', color: D.plum, flexWrap: 'wrap' }}>
              {[0, 1, 2, 3, 4].map((i) => <Icon.star key={i} />)}
              <div style={{ fontSize: 13, color: D.ink2, marginLeft: 10 }}>4.8 · {reviews.length * 47} reviews · used by 38 ASCs</div>
            </div>

            <div style={{ marginTop: 28, padding: 24, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
              <div style={{ display: 'flex', alignItems: 'end', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 42 : 56, color: D.plum, letterSpacing: -1, lineHeight: 1 }}>{fmt.money(price)}</div>
                <div style={{ color: D.ink3, fontSize: 13, paddingBottom: 8 }}>
                  per unit · volume tier {tierLabel}
                  {savingsPct > 0 && <span style={{ color: '#3b8760', marginLeft: 8, fontWeight: 600 }}>save {savingsPct}%</span>}
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                {hasMultiVariants ? (
                  <>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 10 }}>
                      {Object.keys(variants[0]?.options || {})[0]?.toUpperCase() || 'OPTION'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: variants.length === 2 ? '1fr 1fr' : variants.length === 3 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 6 }}>
                      {variants.map((v, i) => {
                        const isActive = i === variantIdx;
                        return (
                          <button
                            key={v.variant_id || v.sku || i}
                            onClick={() => setVariantIdx(i)}
                            disabled={!v.available}
                            style={{
                              padding: '12px 10px',
                              borderRadius: 10,
                              background: isActive ? D.plum : D.paper,
                              color: isActive ? D.paper : v.available ? D.ink : D.ink3,
                              border: `1px solid ${isActive ? D.plum : D.line}`,
                              cursor: v.available ? 'pointer' : 'not-allowed',
                              fontFamily: D.sans,
                              textAlign: 'left',
                              opacity: v.available ? 1 : 0.55,
                            }}
                            aria-pressed={isActive}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{v.title}</div>
                            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                              {fmt.money(v.price)} {!v.available && '· out of stock'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginBottom: 10 }}>VOLUME TIER</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {tiers.map((t) => {
                        const isActive = activeTier?.id === t.id;
                        const range = t.min_qty >= 250 ? '250+' : t.min_qty >= 50 ? '50-249' : t.min_qty >= 10 ? '10-49' : '1-9';
                        return (
                          <button key={t.id} onClick={() => setQty(t.min_qty)} style={{ flex: 1, padding: '12px 8px', borderRadius: 10, background: isActive ? D.plum : D.paper, color: isActive ? D.paper : D.ink, border: `1px solid ${isActive ? D.plum : D.line}`, cursor: 'pointer', fontFamily: D.sans }}>
                            <div style={{ fontSize: 12, opacity: .7 }}>{range}</div>
                            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{fmt.money(t.unit_price)}</div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: `1px solid ${D.line}`, borderRadius: 999, padding: 4 }}>
                  <button aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))} style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}><Icon.minus /></button>
                  <div style={{ minWidth: 40, textAlign: 'center', fontWeight: 600 }}>{qty}</div>
                  <button aria-label="Increase quantity" onClick={() => setQty(qty + 1)} style={{ background: 'none', border: 'none', padding: 8, cursor: 'pointer' }}><Icon.plus /></button>
                </div>
                <button
                  onClick={() => {
                    cartStore.add(
                      product.sku,
                      qty,
                      selectedVariant
                        ? { sku: selectedVariant.sku, title: selectedVariant.title, price: selectedVariant.price }
                        : undefined,
                    );
                    navigate('/cart');
                  }}
                  style={{ flex: '1 1 160px', background: D.ink, color: D.paper, border: 'none', padding: '14px', borderRadius: 999, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                >
                  Add to cart
                </button>
                <button onClick={() => navigate('/quote')} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '13px 18px', borderRadius: 999, cursor: 'pointer', fontSize: 14, flex: isMobile ? '1 1 160px' : '0 0 auto' }}>Request quote</button>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: D.ink3, fontFamily: D.mono, letterSpacing: 0.6 }}>
                NET 30 · ACH · WIRE · CARD · PO ACCEPTED
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 8 }}>
              {[
                ['In stock', `${stock.toLocaleString()} units across 3 DCs`],
                ['Ships today', 'if ordered by 3 PM ET'],
                ['Free freight', 'orders over $500'],
              ].map(([a, b]) => (
                <div key={a} style={{ border: `1px solid ${D.line}`, padding: 14, borderRadius: 10, background: D.paper }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: D.ink }}>{a}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{b}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DESCRIPTION + HIGHLIGHTS */}
        <section style={{ background: D.paperAlt, borderTop: `1px solid ${D.line}`, borderBottom: `1px solid ${D.line}`, padding: `${isMobile ? 48 : 80}px ${padX}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr', gap: isMobile ? 32 : 64 }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>OVERVIEW</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.4vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>What you&apos;re ordering.</h2>
              <div style={{ marginTop: 22 }}>
                {description.map((p, i) => (
                  <p key={i} style={{ fontSize: 15.5, lineHeight: 1.7, color: D.ink2, margin: i === 0 ? 0 : '14px 0 0' }}>{p}</p>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 14 }}>WHY IT MATTERS</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                {highlights.map((h) => (
                  <div key={h.title} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: D.paper, color: D.plum, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon.check /></div>
                    <div style={{ fontFamily: D.display, fontSize: 18, letterSpacing: -0.2, color: D.ink, lineHeight: 1.2 }}>{h.title}</div>
                    <div style={{ fontSize: 13.5, color: D.ink2, marginTop: 8, lineHeight: 1.55 }}>{h.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* COMPLIANCE BAND */}
        <section style={{ padding: `${isMobile ? 48 : 72}px ${padX}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
              <div>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 10 }}>COMPLIANCE</div>
                <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.4vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>Paperwork, kept clean.</h2>
              </div>
              <Link to="/compliance" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '10px 18px', borderRadius: 999, fontSize: 13 }}>View full credentials →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 12 }}>
              {compliance.map((c) => (
                <div key={c.id} style={{ background: c.available ? D.card : D.paperAlt, border: `1px solid ${c.available ? D.line : D.line}`, borderRadius: 12, padding: 18, opacity: c.available ? 1 : 0.45 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: c.available ? D.plum : D.ink3 }}><Icon.shield /></span>
                    <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: c.available ? '#3b8760' : D.ink3 }}>{c.available ? 'YES' : 'N/A'}</span>
                  </div>
                  <div style={{ fontFamily: D.display, fontSize: 16, letterSpacing: -0.2, color: D.ink, lineHeight: 1.2 }}>{c.label}</div>
                  <div style={{ fontSize: 12, color: D.ink2, marginTop: 6, lineHeight: 1.5 }}>{c.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* STOCK + DELIVERY */}
        <section style={{ background: D.paperAlt, borderTop: `1px solid ${D.line}`, borderBottom: `1px solid ${D.line}`, padding: `${isMobile ? 48 : 72}px ${padX}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 32 : 56 }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 10 }}>STOCK BY WAREHOUSE</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.4vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>Live across {stockByWh.length} DCs.</h2>
              <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${stockByWh.length}, 1fr)`, gap: 12 }}>
                {stockByWh.map((w) => {
                  const low = w.on_hand <= w.reorder_at;
                  return (
                    <div key={w.warehouse_id} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: 20 }}>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plum }}>{w.code}</div>
                      <div style={{ fontFamily: D.display, fontSize: 28, letterSpacing: -0.5, color: D.ink, marginTop: 8 }}>{w.on_hand.toLocaleString()}</div>
                      <div style={{ fontSize: 12, color: D.ink2, marginTop: 4 }}>{w.name?.split(' · ')[0]}</div>
                      <div style={{ marginTop: 10, fontSize: 11, color: low ? D.terra : '#3b8760', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon.dot /> {low ? 'Below reorder' : 'In stock'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 10 }}>DELIVERY ESTIMATE</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.4vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>To your zone.</h2>
              <div style={{ marginTop: 22, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
                {DELIVERY_BY_ZONE.map((z, i) => (
                  <div key={z.zone} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                    <span style={{ fontSize: 14 }}>{z.zone}</span>
                    <span style={{ fontFamily: D.mono, fontSize: 12, letterSpacing: 0.8, color: D.plum }}>{z.eta}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: D.ink2, lineHeight: 1.6 }}>
                Estimates assume order placed by 3 PM ET on a business day. Same-day available for Atlanta metro on stocked items.
              </div>
            </div>
          </div>
        </section>

        {/* SPECS + DOCUMENTS */}
        <section style={{ padding: `${isMobile ? 48 : 72}px ${padX}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: isMobile ? 32 : 56 }}>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 10 }}>SPECIFICATIONS</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.4vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>The technical sheet.</h2>
              <div style={{ marginTop: 22, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['SKU', product.sku],
                      ['HCPCS', product.hcpcs || '—'],
                      ['Category', product.category],
                      ['Pack size', product.pack_size],
                      ['Minimum order qty', String(product.moq)],
                      ['Country of origin', product.country_of_origin],
                      ['HTS code', product.hts_code],
                      ['FDA product code', product.fda_product_code],
                      ['PDAC determination', product.pdac_approved ? 'Approved · letter on file' : 'Not applicable'],
                      ['TAA compliance', product.taa_compliant ? 'Documented' : 'No'],
                      ['Berry compliance', product.berry_compliant ? 'Documented' : 'No'],
                      ['MSPV listed', product.mspv_listed ? 'Yes' : 'No'],
                    ].map(([k, v], i) => (
                      <tr key={k} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                        <td style={{ padding: '12px 18px', color: D.ink2, width: '40%', fontFamily: D.mono, fontSize: 12, letterSpacing: 0.6 }}>{k.toUpperCase()}</td>
                        <td style={{ padding: '12px 18px', color: D.ink, fontWeight: 500 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 10 }}>DOCUMENTATION</div>
              <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.4vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>What we&apos;ll send.</h2>
              <ul style={{ marginTop: 22, listStyle: 'none', padding: 0, background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden' }}>
                {documents.map((doc, i) => (
                  <li key={doc.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: i === 0 ? 'none' : `1px solid ${D.line}`, gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span style={{ color: D.plum, flexShrink: 0 }}><Icon.upload /></span>
                      <span style={{ fontSize: 13.5, color: D.ink, lineHeight: 1.4 }}>{doc.label}</span>
                    </div>
                    <span style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 0.8, color: D.ink3, flexShrink: 0 }}>{doc.kind} · {doc.size}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 14, fontSize: 12, color: D.ink2, lineHeight: 1.6 }}>
                All documents are auto-generated from your portal in under a minute. Need something specific? <Link to="/contact" style={{ color: D.plum, textDecoration: 'underline' }}>Ask compliance</Link>.
              </div>
            </div>
          </div>
        </section>

        {/* REVIEWS */}
        <section style={{ background: D.paperAlt, borderTop: `1px solid ${D.line}`, borderBottom: `1px solid ${D.line}`, padding: `${isMobile ? 48 : 72}px ${padX}px` }}>
          <div style={{ maxWidth: 1360, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
              <div>
                <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 10 }}>CUSTOMERS, IN THEIR OWN WORDS</div>
                <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.4vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>4.8 / 5 average · {reviews.length * 47} reviews.</h2>
              </div>
              <Link to="/portfolio" style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '10px 18px', borderRadius: 999, fontSize: 13 }}>Read case studies →</Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 14 }}>
              {reviews.map((r) => (
                <figure key={r.name} style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 14, padding: 24, margin: 0, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', gap: 4, color: D.plum, marginBottom: 12 }}>
                    {Array.from({ length: r.rating }).map((_, i) => <Icon.star key={i} />)}
                  </div>
                  <blockquote style={{ fontFamily: D.display, fontSize: 18, letterSpacing: -0.2, color: D.ink, margin: 0, flex: 1, lineHeight: 1.35, fontStyle: 'italic' }}>
                    &ldquo;{r.body}&rdquo;
                  </blockquote>
                  <figcaption style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${D.line}` }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: D.ink }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: D.ink2, marginTop: 2 }}>{r.role}</div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* RELATED PRODUCTS */}
        {related.length > 0 && (
          <section style={{ padding: `${isMobile ? 48 : 72}px ${padX}px ${isMobile ? 56 : 96}px` }}>
            <div style={{ maxWidth: 1360, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'end', marginBottom: 22, flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum, marginBottom: 10 }}>FREQUENTLY BUNDLED</div>
                  <h2 style={{ fontFamily: D.display, fontSize: 'clamp(28px, 4.4vw, 40px)', fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.1, margin: 0 }}>Complete the formulary.</h2>
                </div>
                <Link to={`/catalog?cat=${encodeURIComponent(product.category)}`} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}`, padding: '10px 18px', borderRadius: 999, fontSize: 13 }}>See all in {product.category} →</Link>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : isTablet ? 'repeat(3, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 12 : 18 }}>
                {related.map((p) => (
                  <article key={p.sku} className="um-card" style={{ background: D.card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${D.line}`, display: 'flex', flexDirection: 'column' }}>
                    <Link to={`/products/${p.sku}`} style={{ display: 'block' }}>
                      <PhotoPlaceholder src={PRODUCT_IMG[p.sku]} caption={p.img} height={isMobile ? 140 : 200} stripeFrom="#ebe3d3" stripeTo="#ddd1b7" textColor={D.plum} />
                    </Link>
                    <div style={{ padding: isMobile ? 14 : 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 0.8, color: D.ink3 }}>{p.sku}</div>
                      <Link to={`/products/${p.sku}`} style={{ fontFamily: D.display, fontSize: isMobile ? 15 : 18, color: D.ink, marginTop: 8, lineHeight: 1.25, minHeight: isMobile ? 38 : 46 }}>{p.name}</Link>
                      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginTop: 14 }}>
                        <div style={{ fontFamily: D.display, fontSize: isMobile ? 18 : 22, color: D.plum, letterSpacing: -0.3 }}>{fmt.money(p.price)}</div>
                        <button aria-label={`Add ${p.name}`} onClick={() => cartStore.add(p.sku)} style={{ background: D.ink, color: D.paper, border: 'none', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon.plus />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
      <Lightbox
        open={lightboxIdx >= 0}
        startIndex={Math.max(0, lightboxIdx)}
        images={gallery}
        onClose={() => setLightboxIdx(-1)}
      />
    </div>
  );
}
