// Audit the finished build, including crawler HTML and punctuation-bearing SKUs.
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {STATIC_ROUTES} from '../src/data/seoRoutes.js';
import {REAL_PRODUCTS} from '../src/data/publicCatalog.js';
import {shareImagePath} from '../src/lib/seoMetadata.js';
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
const routes=[...Object.keys(STATIC_ROUTES),'/portal/quote',...REAL_PRODUCTS.map(p=>`/products/${encodeURIComponent(p.sku)}`)];
for(const route of routes){
 const html=await readFile(path.join(dist,decodeURIComponent(route),'index.html'),'utf8');
 assert(html.includes(`https://unitemedical.net${route}`),route);
 assert.equal((html.match(/property="og:image"/g)||[]).length,1,route);
 const card=await readFile(path.join(dist,decodeURIComponent(shareImagePath(route))));
 assert.equal(card.readUInt16BE(0),0xffd8,`${route}: actual JPEG`);
 assert(card.length<200000,`${route}: sharing card exceeds 200kB`);
 assert(!html.includes('aggregateRating'));
 assert(!html.includes('fonts.googleapis.com'));
 assert(html.includes('og:image:alt'));
}
for(const file of ['404.html','workspace.html'])assert((await readFile(path.join(dist,file),'utf8')).includes('noindex,nofollow'));
const root=await readFile(path.join(dist,'index.html'),'utf8');
const files=[...root.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.js)"/g)].map(m=>m[1]);
let bytes=0,gzip=0;
for(const file of files){assert(!/(?:pdf-import|warehouse-3d|barcode-scanner|analytics-|vendor-)/.test(file),file);const data=await readFile(path.join(dist,file));bytes+=(await stat(path.join(dist,file))).size;gzip+=gzipSync(data).length;}
assert(bytes<800000,`Initial JS exceeded 800kB: ${bytes}`);
console.log(`PASS: ${routes.length} static pages and JPEG cards; canonical/metadata/noindex; punctuation URLs; initial JS ${bytes} bytes (${gzip} gzip).`);
