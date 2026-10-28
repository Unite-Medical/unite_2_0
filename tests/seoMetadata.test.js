import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveMetadata,productMetadata,organizationSchema,shareImagePath} from '../src/lib/seoMetadata.js';
import {renderRoute} from '../scripts/prerender.mjs';
import {STATIC_ROUTES} from '../src/data/seoRoutes.js';
import {REAL_PRODUCTS} from '../src/data/publicCatalog.js';
const base=await readFile(new URL('../index.html',import.meta.url),'utf8');
test('crawler HTML has one canonical and complete, unique social metadata before JS',()=>{
 for(const route of Object.keys(STATIC_ROUTES)){
  const html=renderRoute(base,route,{}, {staging:false});
  assert.equal((html.match(/<title>/g)||[]).length,1,route);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1,route);
  for(const property of ['og:title','og:description','og:image','og:image:width','og:image:height','og:image:alt'])assert.equal((html.match(new RegExp(`property="${property}"`,'g'))||[]).length,1,`${route} ${property}`);
  assert(html.includes(`https://unitemedical.net${shareImagePath(route)}`));
  assert(html.includes('max-image-preview:large'));
  assert(html.includes('<main id="main"'));
  assert.equal((html.match(/type="application\/ld\+json"/g)||[]).length,1);
 }
});
test('staging shares staging image URLs but cannot be indexed; canonical remains production',()=>{
 const meta=resolveMetadata('/welllink?utm_source=email',{}, {staging:true});
 assert.equal(meta.canonical,'https://unitemedical.net/welllink');
 assert.equal(meta.url,'https://staging.unitemedical.net/welllink');
 assert.equal(meta.image,'https://staging.unitemedical.net/images/social/v2/welllink.jpg');
 assert.equal(meta.robots,'noindex,nofollow');
});
test('quote, private and missing pages are noindex and query secrets never enter tags',()=>{
 for(const path of ['/admin','/account/orders','/q/secret','/portal/quote','/missing'])assert.equal(resolveMetadata(path).robots,'noindex,nofollow');
 assert.equal(resolveMetadata('/portal/quote').image,'https://unitemedical.net/images/social/v1/portal/quote.jpg');
 assert(!JSON.stringify(resolveMetadata('/catalog?token=SECRET')).includes('SECRET'));
});
test('every public SKU has an encoded product route and custom card, without invented price or reviews',()=>{
 assert.equal(REAL_PRODUCTS.length,118);
 for(const p of REAL_PRODUCTS){const meta=productMetadata(p);assert.equal(meta.canonical,`/products/${encodeURIComponent(p.sku)}`);assert(meta.ogImage.endsWith('.jpg'));assert(!JSON.stringify(meta).includes('aggregateRating'));}
 assert.equal(productMetadata({sku:'Binax-COV/FLU',name:'BinaxNOW'}).canonical,'/products/Binax-COV%2FFLU');
 assert(!JSON.stringify(organizationSchema()).includes('555'));
});
test('HTML and JSON-LD escape injection and 404 schema can be omitted',()=>{
 const html=renderRoute(base,'/test',{title:'<hello>',jsonLd:{name:'</script><script>alert(1)</script>'}},{staging:false});
 assert(html.includes('&lt;hello&gt;'));
 assert(!html.includes('</script><script>alert'));
 assert(html.includes('\\u003c/script>'));
 assert(!renderRoute(base,'/404',{noindex:true,jsonLd:null}).includes('application/ld+json'));
});

test('Sales deep links and reloads use the protected workspace shell, not the public 404 document',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
 for(const path of ['/sales/orders','/sales/orders/new','/sales/orders/qa-order','/sales/purchase-orders','/sales/purchase-orders/new','/sales/purchase-orders/qa-po']){
  const route=config.rewrites.find(rule=>rule.source.endsWith('/:path*')&&(path===rule.source.slice(0,-8)||path.startsWith(rule.source.slice(0,-7))));
  assert.equal(route?.destination,'/workspace.html',path);
  assert.equal(resolveMetadata(path).robots,'noindex,nofollow',path);
  assert(config.headers.some(rule=>new RegExp('^'+rule.source+'$').test(path)&&rule.headers.some(h=>h.key==='X-Robots-Tag'&&h.value==='noindex, nofollow')),path);
 }
 assert(!config.rewrites.some(rule=>rule.source==='/api/:path*'));
});
