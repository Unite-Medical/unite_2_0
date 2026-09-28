// Run with sharp installed, or SHARP_MODULE pointing to the local sharp package.
// Version the output directory before replacing cards with long-lived CDN caching.
import {createRequire} from 'node:module';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STATIC_ROUTES} from '../src/data/seoRoutes.js';
import {REAL_PRODUCTS} from '../src/data/publicCatalog.js';
import {shareImagePath,productMetadata} from '../src/lib/seoMetadata.js';
const require=createRequire(import.meta.url), sharp=require(process.env.SHARP_MODULE||'sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), pub=path.join(root,'public');
const cutouts=JSON.parse(await readFile(path.join(root,'src/data/productCutouts.json')));
const art={
 '/':'/media/homepage-film/hero-poster.webp',
 '/robotics':'/images/robotics/da-vinci-xi-system.jpg',
 '/welllink':'/images/program-films/welllink-poster.jpg',
 '/case-studies/tjs':'/images/program-films/tjs-poster.jpg',
 '/regenicool':'/media/regenicool/red-device.webp',
 '/about':'/images/generated/ABOUT-01-v1.webp',
 '/diagnostics':'/images/generated/EDU-02-v1.webp',
 '/government':'/images/generated/GOV-01-v1.webp',
 '/compliance':'/images/generated/COMP-01-v1.webp',
 '/services/distribution':'/images/generated/SVC-01-v1.webp',
 '/services/pdac':'/images/generated/SVC-02-v1.webp',
 '/segments/asc':'/images/generated/SOL-01-v1.webp',
 '/segments/pharmacy':'/images/generated/SOL-02-v1.webp',
 '/segments/ems':'/images/generated/SOL-04-v1.webp',
};
const headlines={'/':'Care starts with\nthe right supply.','/catalog':'The products\nbehind better care.','/portal/quote':'Your next order\nstarts here.','/quote':'Tell us what\nyou need.','/welllink':'Small essentials.\nA stronger connection.','/robotics':'A smarter cycle\nfor surgical robotics.','/case-studies/tjs':'A recovery store.\nFully supported.'};
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function wrap(text,max=24){return text.split('\n').flatMap(p=>{const lines=[''];for(const w of p.split(/\s+/)){const i=lines.length-1;if(lines[i]&&(lines[i]+' '+w).length>max)lines.push(w);else lines[i]+=(lines[i]?' ':'')+w;}return lines;});}
async function exists(file){try{await readFile(path.join(pub,file));return true;}catch{return false;}}
async function productArt(p){
 if(cutouts[p.sku])return cutouts[p.sku];
 try{const files=(await readdir(path.join(pub,'images/products',p.handle))).filter(f=>/\.(png|jpg|jpeg|webp)$/i.test(f)).sort();if(files.length)return `/images/products/${p.handle}/${files[0]}`;}catch{}
 if(p.hero_image?.startsWith('/'))return p.hero_image;
 return null;
}
const logo=await sharp(path.join(pub,'brand/unite-medical-logo.png')).resize({width:230}).png().toBuffer();
const cards=[...Object.entries(STATIC_ROUTES).map(([route,meta])=>({route,...meta})),{route:'/portal/quote',title:'Quick quote'},...REAL_PRODUCTS.map(p=>({route:productMetadata(p).canonical,title:p.name,product:p}))];
const manifest=[];
for(const c of cards){
 let photo=c.product?await productArt(c.product):art[c.route];
 if(!photo||!await exists(photo))photo=c.product?null:'/media/homepage-film/hero-poster.webp';
 const lines=wrap(headlines[c.route]||c.title,c.product?22:24), size=c.product?44:lines.length>5?38:lines.length>3?47:58, step=size*1.08;
 const label=c.product?'PRODUCT CATALOG':c.route==='/case-studies/tjs'?'TOTAL JOINT SPECIALISTS':c.route==='/welllink'?'WELLLINK MEMBER PROGRAM':c.route==='/robotics'?'RESTORE ROBOTICS':'BUILT AROUND YOUR BUSINESS';
 const text=lines.map((line,i)=>`<text x="62" y="${246+i*step}" font-size="${size}">${xml(line)}</text>`).join('');
 const sub=c.product?`SKU ${c.product.sku}`:'Medical supplies. Thoughtfully connected.';
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#f3f1e9"/><rect x="692" width="508" height="630" fill="${c.product?'#fff':'#153d31'}"/><path d="M62 164H630" stroke="#c6cbbd"/><g fill="#163e32" font-family="Helvetica,Arial,sans-serif"><text x="62" y="196" font-size="12" letter-spacing="2.2">${label}</text><g font-weight="500" letter-spacing="-1.6">${text}</g><text x="62" y="552" font-size="16">${xml(sub)}</text><text x="62" y="593" font-size="13" letter-spacing="1">UNITEMEDICAL.NET</text><text x="629" y="596" font-size="34">↗</text></g>${!photo?'<g fill="none" stroke="#b8c6ad" stroke-width="2"><circle cx="945" cy="308" r="166"/><circle cx="945" cy="308" r="126"/><path d="M945 233V383M870 308H1020" stroke-width="6"/></g>':''}</svg>`);
 const layers=[];
 if(photo){const bytes=await sharp(path.join(pub,photo)).rotate().resize(c.product?430:508,c.product?440:630,{fit:c.product?'contain':'cover',background:'#ffffff',position:c.route==='/welllink'?'right':'centre'}).png().toBuffer();layers.push({input:bytes,left:c.product?730:692,top:c.product?95:0});}
 layers.push({input:logo,left:62,top:55});
 const output=path.join(pub,decodeURIComponent(shareImagePath(c.route)));await mkdir(path.dirname(output),{recursive:true});await sharp(svg).composite(layers).jpeg({quality:86,mozjpeg:true}).toFile(output);
 const info=await sharp(output).metadata();manifest.push({route:c.route,image:shareImagePath(c.route),width:info.width,height:info.height,source:photo});
}
await mkdir(path.join(root,'artifacts/seo-performance'),{recursive:true});await writeFile(path.join(root,'artifacts/seo-performance/social-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Generated ${cards.length} branded sharing images.`);
