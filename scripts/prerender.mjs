#!/usr/bin/env node
/**
 * Static prerender — the CTO brief's SSR/SEO decision, executed as
 * "Path B": keep the Vite SPA, emit a static HTML shell per public
 * route at build time with route-specific <title>, meta description,
 * canonical, OG/Twitter tags, and JSON-LD baked in.
 *
 * Crawlers that don't execute JS get correct head tags from the
 * static file; everything else hydrates into the normal SPA (the
 * useSEO hook overwrites the same tags at runtime). Vercel serves
 * filesystem matches before the SPA rewrite, so dist/<route>/index.html
 * wins for exactly the routes we emit.
 *
 * Runs automatically after `vite build` (see package.json "build").
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REAL_PRODUCTS } from '../src/data/realCatalog.js';
import { STATIC_ROUTES } from './seo-routes.mjs';
import { buildSitemap } from './sitemap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = 'https://unitemedical.net';
const SITE_NAME = 'Unite Medical';
const DEFAULT_OG_IMAGE = `${SITE_URL}/favicon-512.png`;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTitle(title) {
  return title ? `${title} · ${SITE_NAME}` : SITE_NAME;
}

/** Swap a meta tag's content in the built HTML (head only, idempotent). */
function setTag(html, selectorRe, replacement) {
  return selectorRe.test(html) ? html.replace(selectorRe, replacement) : html;
}

function renderRoute(baseHtml, route, { title, description, type = 'website', jsonLd = null }) {
  const fullTitle = formatTitle(title);
  const canonical = `${SITE_URL}${route}`;
  let html = baseHtml;

  html = setTag(html, /<title>[^<]*<\/title>/, `<title>${esc(fullTitle)}</title>`);
  html = setTag(html, /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(description)}" />`);
  html = setTag(html, /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(fullTitle)}" />`);
  html = setTag(html, /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${esc(description)}" />`);
  html = setTag(html, /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/, `<meta property="og:type" content="${esc(type)}" />`);
  html = setTag(html, /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${esc(canonical)}" />`);
  html = setTag(html, /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${esc(fullTitle)}" />`);
  html = setTag(html, /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${esc(description)}" />`);
  html = setTag(html, /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(canonical)}" />`);
  if (!/rel="canonical"/.test(html)) {
    html = html.replace('</head>', `  <link rel="canonical" href="${esc(canonical)}" />\n  </head>`);
  }
  if (jsonLd) {
    html = html.replace('</head>', `  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n  </head>`);
  }
  return html;
}

function productMeta(p) {
  const quoteOnly = p.quote_only || p.price == null;
  const desc = `${p.name} — ${p.category || 'medical supply'}, SKU ${p.sku}.`
    + (p.hcpcs && p.hcpcs !== '—' ? ` HCPCS ${p.hcpcs}.` : '')
    + (quoteOnly
      ? ' Quote-only — priced per order from Unite Medical.'
      : ' Wholesale pricing, same-day shipping before 2pm EST, no minimums on stocked items.');
  return {
    title: p.name,
    description: desc.slice(0, 300),
    type: 'product',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      sku: p.sku,
      category: p.category,
      brand: { '@type': 'Brand', name: SITE_NAME },
      image: DEFAULT_OG_IMAGE,
      // Quote-only products have no public price — omit the Offer rather
      // than emit a null price / false InStock signal.
      ...(quoteOnly ? {} : {
        offers: {
          '@type': 'Offer',
          priceCurrency: 'USD',
          price: p.price,
          availability: 'https://schema.org/InStock',
          seller: { '@type': 'Organization', name: SITE_NAME },
          url: `${SITE_URL}/products/${p.sku}`,
        },
      }),
    },
  };
}

async function main() {
  let baseHtml;
  try {
    baseHtml = await readFile(path.join(DIST, 'index.html'), 'utf8');
  } catch {
    console.error('dist/index.html not found — run `vite build` first.');
    process.exit(1);
  }

  let count = 0;
  async function emit(route, meta) {
    const dir = path.join(DIST, ...route.split('/').filter(Boolean));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), renderRoute(baseHtml, route, meta));
    count += 1;
  }

  for (const [route, meta] of Object.entries(STATIC_ROUTES)) {
    await emit(route, meta);
  }
  for (const p of REAL_PRODUCTS) {
    if (!p?.sku) continue;
    await emit(`/products/${p.sku}`, productMeta(p));
  }

  await writeFile(path.join(DIST, 'sitemap.xml'), buildSitemap());

  console.log(`Prerendered ${count} routes into dist/ (${Object.keys(STATIC_ROUTES).length} static + ${count - Object.keys(STATIC_ROUTES).length} products).`);
}

main();
