import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { captureUniteEvent } from '../lib/analytics/index.js';
import { Nav } from '../components/layout/Nav.jsx';
import { HomepageFooter } from '../components/layout/HomepageFooter.jsx';
import { PhotoPlaceholder } from '../components/shared/PhotoPlaceholder.jsx';
import { Lightbox } from '../components/shared/Lightbox.jsx';
import { cartStore } from '../store/cart.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { PRODUCT_IMG } from '../lib/imageMap.js';
import { productDescription, productDocuments, relatedProducts } from '../lib/productCopy.js';
import { useSEO, productSchema, breadcrumbSchema } from '../lib/seo.js';
import { categorize } from '../lib/taxonomy.js';
import { auth } from '../lib/auth.js';
import { commerceAccessFor } from '../lib/accessPolicy.js';
import './commerce-public.css';
import './commerce-editorial.css';

export function ProductDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const product = db.useRow('products', id);
  const session = auth.use();
  const organization = db.useRow('organizations', session?.org_id || '__anonymous__');
  const commerce = commerceAccessFor(session, organization);
  const accountPrices = db.useTable('account_prices');
  const [selection, setSelection] = useState({ productId: id, index: 0 });
  const variantIdx = selection.productId === id ? selection.index : 0;
  const variants = product?.variants || [];
  const selectedVariant = variants.length > 1 ? variants[variantIdx] : null;
  const priceSku = selectedVariant?.sku || product?.sku || id;
  const [qty, setQty] = useState(1);
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const [imageIndex, setImageIndex] = useState({ productId: id, index: 0 });
  const gallery = useMemo(() => {
    if (!product) return [];
    const images = product.images?.length ? product.images : [PRODUCT_IMG[product.sku]].filter(Boolean);
    return [...new Set(images)].map((src, i) => ({ src, alt: `${product.name} — view ${i + 1}` }));
  }, [product]);
  const heroIndex = imageIndex.productId === id ? imageIndex.index : 0;
  const tiers = accountPrices.filter(row => row.ok !== false && row.sku === priceSku && (!row.org_id || row.org_id === session?.org_id))
    .sort((a,b) => Number(a.quantity || 1) - Number(b.quantity || 1));
  const price = tiers.filter(row => Number(row.quantity || 1) <= qty).at(-1)?.unit_price ?? null;
  const hasPrice = commerce.can_view_prices && price > 0 && !product?.quote_only;
  const internal = session && !['customer','distributor'].includes(session.role);
  const sourcing = product?.quote_only || selectedVariant?.available === false || internal;
  const quotePath = sourcing ? `/quote?sku=${encodeURIComponent(priceSku)}&path=source` : `/portal/quote?sku=${encodeURIComponent(priceSku)}&qty=${qty}`;
  const category = categorize(product);
  const categoryPath = `/catalog?cat=${encodeURIComponent(category)}`;
  const description = useMemo(() => product ? productDescription(product) : [], [product]);
  const documents = useMemo(() => product ? productDocuments(product) : [], [product]);
  const related = useMemo(() => product ? relatedProducts(product, 4) : [], [product]);
  const tracked = useRef(null);
  useEffect(() => {
    if (product?.id && tracked.current !== product.id) {
      tracked.current = product.id;
      captureUniteEvent('product_view', { product_id: product.id });
    }
  }, [product?.id]);
  useSEO(product ? {
    title: product.name, description: `${product.name}. Explore product details and request business pricing from Unite Medical.`,
    canonical: `/products/${encodeURIComponent(product.sku)}`, type: 'product', ogImage: PRODUCT_IMG[product.sku],
    jsonLd: [productSchema(product, { image: PRODUCT_IMG[product.sku], includePricing: false }), breadcrumbSchema([{ name:'Catalog',path:'/catalog' },{name:category,path:categoryPath},{name:product.name,path:`/products/${encodeURIComponent(product.sku)}`}])],
  } : { title:'Product not found', noindex:true });

  if (!product) return <div className="uc-page"><Nav/><main id="main" className="uc-wrap uc-empty"><h1>Let’s find what you need.</h1><p>This product isn’t in the current catalog.</p><Link className="uc-button" to="/catalog">Explore the catalog ↗</Link></main><HomepageFooter/></div>;

  // Exact stock counts, reservations, and allocation details remain private.
  // Product-specific credentials are shown only when present in catalog data.
  const credentials = [[product.pdac_approved,'PDAC approved'],[product.taa_compliant,'TAA compliant'],[product.berry_compliant,'Berry compliant'],[product.latex_free,'Latex-free']].filter(([available])=>available);
  return <div className="uc-page up-page"><Nav/><main id="main">
    <nav className="uc-wrap up-breadcrumb" aria-label="Breadcrumb"><Link to="/catalog">All products</Link><span>/</span><Link to={categoryPath}>{category}</Link></nav>
    <section className="uc-wrap up-product-hero">
      <div className="up-gallery"><button className="up-image-stage" disabled={!gallery.length} aria-label={`Open ${product.name} gallery`} onClick={()=>setLightboxIdx(heroIndex)}><span className="up-image-label">UNITE MEDICAL / {category}</span><PhotoPlaceholder src={gallery[heroIndex]?.src} alt={product.name} caption="Product photography coming soon" height={620} stripeFrom="#eeeee6" stripeTo="#eeeee6" eager/><span className="up-zoom">{gallery.length?'Explore product image ↗':'Ask us for product images ↗'}</span></button>
        {gallery.length>1&&<div className="up-thumbnails" aria-label="Product images">{gallery.map((image,i)=><button key={image.src} aria-label={`Show product image ${i+1}`} aria-pressed={heroIndex===i} onClick={()=>setImageIndex({productId:id,index:i})}><img src={image.src} alt="" loading="lazy"/></button>)}</div>}
      </div>
      <div className="up-product-copy"><p className="uc-eyebrow">{category}</p><h1>{product.name}</h1><p className="up-product-code">SKU {priceSku}{product.hcpcs&&product.hcpcs!=='—'?` / HCPCS ${product.hcpcs}`:''}</p>
        <div className="up-pricing"><p className="uc-eyebrow">{hasPrice?'YOUR ACCOUNT PRICE':'LET’S GET YOU THE RIGHT PRICE'}</p><h2>{hasPrice?fmt.money(price):'Pricing for your business.'}</h2><p>{hasPrice?'Your account price for the selected quantity. Shipping and tax are confirmed before ordering.':'Tell us what you need and how much. We’ll help you confirm pricing, pack size, and availability.'}</p></div>
        {variants.length>1&&<fieldset className="up-variants"><legend>Select an option</legend><div>{variants.map((v,i)=><button key={v.variant_id||v.sku||i} aria-pressed={variantIdx===i} onClick={()=>setSelection({productId:id,index:i})}>{v.title}{v.available===false&&<small>Ask about availability</small>}</button>)}</div></fieldset>}
        <div className="up-order-row"><label>Quantity<input aria-label="Order quantity" type="number" min="1" max="1000000" step="1" value={qty} onChange={e=>setQty(Math.min(1000000,Math.max(1,Math.round(Number(e.target.value)||1))))}/></label>
          {hasPrice&&commerce.can_use_cart?<button className="uc-button" onClick={()=>{const added=cartStore.add(product.sku,qty,selectedVariant?{sku:selectedVariant.sku,title:selectedVariant.title}:undefined);if(added.ok)navigate('/cart');}}>Add to cart <span>↗</span></button>:<Link className="uc-button" to={quotePath}>Request pricing <span>↗</span></Link>}
        </div>
        <div className="up-order-links">{hasPrice?<Link to={quotePath}>Build a quote instead ↗</Link>:!session?<Link to={`/login?next=${encodeURIComponent(`/products/${id}`)}`}>Already a customer? Sign in ↗</Link>:<Link to="/contact">Talk to your Unite team ↗</Link>}<a href="tel:+18338686483">833.868.6483</a></div>
        <dl className="up-specs"><div><dt>Pack size</dt><dd>{product.pack_size&&product.pack_size!=='1 ea'?product.pack_size:'Confirmed with your quote'}</dd></div>{product.moq>1&&<div><dt>Minimum order</dt><dd>{product.moq}</dd></div>}<div><dt>Availability</dt><dd>Confirmed for your order</dd></div>{credentials.map(([,label])=><div key={label}><dt>{label}</dt><dd>✓</dd></div>)}</dl>
      </div>
    </section>
    <section className="up-details"><div className="uc-wrap up-detail-grid"><div><p className="uc-eyebrow">01 / THE DETAILS</p><h2>Know what<br/>you’re ordering.</h2><Link className="uc-text-link" to={quotePath}>Ask a product question ↗</Link></div><div className="up-description">{description.map((paragraph,i)=><p key={i}>{paragraph}</p>)}<div className="up-document-list"><h3>Product documentation</h3>{documents.map(doc=><Link to={doc.href||'/contact'} key={doc.label}><span>{doc.label}</span><small>Request ↗</small></Link>)}</div></div></div></section>
    <section className="uc-wrap up-support"><p className="uc-eyebrow">02 / THE PEOPLE BEHIND YOUR ORDER</p><div><h2>A supply partner.<br/>A real conversation.</h2><div><p>Need to confirm a size, compare options, or plan a recurring order? Our team can help you work through the details.</p><p>Serving you from Lithia Springs, Georgia.</p><a className="uc-text-link" href="tel:+18338686483">Talk to our team · 833.868.6483 ↗</a></div></div></section>
    {related.length>0&&<section className="uc-wrap up-related"><div className="up-section-heading"><div><p className="uc-eyebrow">CONTINUE EXPLORING</p><h2>More for your care team.</h2></div><Link className="uc-text-link" to={categoryPath}>Explore {category.toLowerCase()} ↗</Link></div><div className="up-related-grid">{related.map(p=><article key={p.sku}><Link className="up-related-image" to={`/products/${encodeURIComponent(p.sku)}`}><PhotoPlaceholder src={PRODUCT_IMG[p.sku]} alt={p.name} caption="Product image coming soon" height={260} stripeFrom="#eeeee6" stripeTo="#eeeee6"/></Link><p className="uc-eyebrow">{categorize(p)}</p><h3><Link to={`/products/${encodeURIComponent(p.sku)}`}>{p.name}</Link></h3><Link className="uc-product-action" to={`/products/${encodeURIComponent(p.sku)}`}>Explore product <span>↗</span></Link></article>)}</div></section>}
  </main><HomepageFooter/><Lightbox open={lightboxIdx>=0} startIndex={Math.max(0,lightboxIdx)} images={gallery} onClose={()=>setLightboxIdx(-1)}/></div>;
}
