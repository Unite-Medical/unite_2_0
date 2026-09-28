#!/usr/bin/env node
// Public metadata and crawlable summaries are present before JavaScript runs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REAL_PRODUCTS } from '../src/data/publicCatalog.js';
import { STATIC_ROUTES } from './seo-routes.mjs';
import { buildSitemap } from './sitemap.mjs';
import { resolveMetadata, productMetadata, routeSchema, SITE_NAME, SITE_URL } from '../src/lib/seoMetadata.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT,'dist');
const staging = process.env.VITE_UNITE_ENVIRONMENT === 'staging';
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const json = value => JSON.stringify(value).replaceAll('<','\\u003c');

export function renderRoute(baseHtml, route, options = {}, environment = {staging}) {
  const meta = resolveMetadata(route, options, environment);
  let html = baseHtml.replace(/<title>[\s\S]*?<\/title>/g,'')
    .replace(/<meta\b[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g,'')
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/g,'')
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g,'');
  const tags = [`<title>${esc(meta.title)}</title>`,`<link rel="canonical" href="${esc(meta.canonical)}" />`];
  const names = {description:meta.description,robots:meta.robots,'twitter:card':'summary_large_image','twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':meta.image,'twitter:image:alt':meta.imageAlt};
  const properties = {'og:title':meta.title,'og:description':meta.description,'og:type':meta.type,'og:url':meta.url,'og:site_name':SITE_NAME,'og:locale':'en_US','og:image':meta.image,'og:image:secure_url':meta.image,'og:image:type':'image/jpeg','og:image:width':'1200','og:image:height':'630','og:image:alt':meta.imageAlt};
  for (const [name,content] of Object.entries(names)) tags.push(`<meta name="${name}" content="${esc(content)}" />`);
  for (const [property,content] of Object.entries(properties)) tags.push(`<meta property="${property}" content="${esc(content)}" />`);
  const schema = Object.hasOwn(options, 'jsonLd') ? options.jsonLd : routeSchema(route,meta);
  if (schema) tags.push(`<script id="um-jsonld" type="application/ld+json">${json(schema)}</script>`);
  const hero = {'/':'/media/homepage-film/hero-poster.webp','/robotics':'/images/mobile-v1/robotics-system.webp','/welllink':'/images/mobile-v1/welllink.webp','/case-studies/tjs':'/images/mobile-v1/tjs.webp'}[route];
  if (route === "/") tags.push('<link rel="preload" as="image" href="/images/mobile-v1/home-hero.webp" media="(max-width: 760px)" fetchpriority="high" />');
  if (hero) tags.push(`<link rel="preload" as="image" href="${hero}" ${route === "/" ? 'media="(min-width: 761px)"' : ""} fetchpriority="high" />`);
  html = html.replace('</head>',tags.join('\n')+'\n</head>');
  // Honest page summaries and real links, also usable when scripts cannot load.
  // React replaces this same-user-visible content on startup, rather than a blank root.
  const preview = `<main id="main" class="um-static-preview"><a href="/" aria-label="Unite Medical home"><img src="/images/mobile-v1/logo.webp" width="180" alt="Unite Medical" /></a><p class="um-static-label">UNITE MEDICAL</p><h1>${esc(options.title || STATIC_ROUTES[route]?.title || SITE_NAME)}</h1><p>${esc(meta.description)}</p><nav aria-label="Explore Unite Medical"><a href="/catalog">Explore products ↗</a><a href="/quote">Request a quote ↗</a><a href="/contact">Contact our team ↗</a></nav></main>`;
  return html.replace('<div id="root"></div>',`<div id="root">${preview}</div>`);
}

async function main() {
  const base = await readFile(path.join(DIST,'index.html'),'utf8');
  const manifest = JSON.parse(await readFile(path.join(DIST,'.vite/manifest.json'),'utf8'));
  const pageModules = {'/':'Homepage','/catalog':'Catalog','/portal/quote':'PortalQuote','/quote':'QuoteStart','/robotics':'Robotics','/welllink':'WellLink','/case-studies/tjs':'CaseStudyTJS'};
  function preloadPage(route) {
    const name = pageModules[route] || (route.startsWith('/products/') ? 'ProductDetail' : null);
    const seen = new Set(), tags=[];
    function visit(key) {
      if(seen.has(key))return;seen.add(key);
      const entry=manifest[key];if(!entry)return;
      if(!base.includes(`href="/${entry.file}"`)) tags.push(`<link rel="modulepreload" crossorigin href="/${entry.file}" />`);
      for(const css of entry.css||[]) if(!seen.has(css)){seen.add(css);if(!base.includes(`href="/${css}"`)) tags.push(`<link rel="stylesheet" crossorigin href="/${css}" />`);}
      for(const dependency of entry.imports||[])visit(dependency);
    }
    if(name)visit(`src/pages/${name}.jsx`);
    return base.replace('</head>',tags.join('\n')+'\n</head>');
  }
  let count=0;
  async function emit(route,options) {
    const dir=path.join(DIST,...route.split('/').filter(Boolean).map(decodeURIComponent));
    await mkdir(dir,{recursive:true});
    await writeFile(path.join(dir,'index.html'),renderRoute(preloadPage(route),route,options));count++;
  }
  for(const [route,meta] of Object.entries(STATIC_ROUTES)) await emit(route,meta);
  for(const p of REAL_PRODUCTS) {
    if(!p.sku)continue;
    const meta=productMetadata(p);
    const image=p.hero_image ? new URL(p.hero_image,SITE_URL).href : undefined;
    const product={'@context':'https://schema.org','@type':'Product',name:p.name,sku:p.sku,description:meta.description,category:p.category,url:`${SITE_URL}${meta.canonical}`,...(image?{image}:{})};
    await emit(meta.canonical,{...meta,jsonLd:[product,...routeSchema(meta.canonical,resolveMetadata(meta.canonical,meta))]});
  }
  // Quick Quote can be shared, but is a utility rather than a search landing page.
  await emit('/portal/quote',{title:'Quick quote',description:'Build a medical supply quote. Choose products, set quantities and send your request to Unite Medical.',noindex:true});
  const notFound=renderRoute(base,'/404',{title:'Page not found',description:'This page is unavailable. Explore the Unite Medical catalog or contact our team.',noindex:true,jsonLd:null});
  await writeFile(path.join(DIST,'404.html'),notFound);
  await writeFile(path.join(DIST,'workspace.html'),renderRoute(base,'/account',{title:'Account access',description:'Sign in to access your Unite Medical workspace.',noindex:true,jsonLd:null}));
  await writeFile(path.join(DIST,'sitemap.xml'),buildSitemap());
  await writeFile(path.join(DIST,'robots.txt'),`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  console.log(`Prerendered ${count} routes with social metadata and public summaries (${REAL_PRODUCTS.length} products).`);
}
if(process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) await main();
