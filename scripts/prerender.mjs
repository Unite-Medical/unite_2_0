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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE_URL = 'https://unitemedical.net';
const SITE_NAME = 'Unite Medical';
const DEFAULT_OG_IMAGE = `${SITE_URL}/favicon-512.png`;

// Mirrors src/lib/seo.js useSEO() titles/descriptions per public page.
const STATIC_ROUTES = {
  '/catalog': {
    title: 'Catalog',
    description: 'Browse FDA-registered orthotics, diagnostics, PPE, wound care, pharmaceuticals, and equipment. No minimums on stocked items; same-day shipping before 2pm EST.',
  },
  '/quote': {
    title: 'Request a quote',
    description: 'Source a specific product, get a custom made-to-spec quote, or match a shortage list — tell us what you need and we come back with an all-in price.',
  },
  '/shortage-list': {
    title: 'Shortage list matching',
    description: 'Paste your backorder or shortage list — we instantly check each line against our stock, our vetted manufacturer network, and our sourcing desk. No EDI required.',
  },
  '/supply-risk': {
    title: 'Supply risk monitor',
    description: 'Live FDA enforcement, recall, and shortage signals mapped to the products your facility buys.',
  },
  '/surplus': {
    title: 'Move surplus inventory',
    description: 'List excess, near-expiry, or expired medical inventory with your target price. Unite brokers it to buyers across medical, veterinary, research, and overseas channels for a transparent fee.',
  },
  '/surplus/market': {
    title: 'Surplus marketplace',
    description: 'Browse surplus medical inventory Unite is brokering — sealed, in-date lots plus vet/research/export-eligible stock, direct from the seller at well below list.',
  },
  '/services': {
    title: 'Services',
    description: 'Wholesale distribution, PDAC consulting, distributor programs, and private labeling for healthcare suppliers and providers.',
  },
  '/services/distribution': {
    title: 'Wholesale distribution',
    description: 'FDA-registered national distribution from our Georgia warehouse — same-day shipping and no minimums on stocked items.',
  },
  '/services/pdac': {
    title: 'PDAC consulting',
    description: 'Get DME and orthotic products PDAC-approved: coding verification, documentation packages, and submission management by people who have done it before.',
  },
  '/robotics': {
    title: 'Restore Robotics program',
    description: 'FDA 510(k)-cleared remanufactured da Vinci instruments — significant savings per instrument with a closed-loop collection and remanufacturing program.',
  },
  '/diagnostics': {
    title: 'Diagnostic tests',
    description: 'Every major diagnostic test brand from one supplier — COVID, flu, strep, HIV, drug screening, and more. Wholesale, retail, and private label.',
  },
  '/services/distributors': {
    title: 'Distributor Program',
    description: 'Stock-feed pricing, drop-ship fulfillment, and marketing support for regional medical supply distributors.',
  },
  '/services/private-label': {
    title: 'Private labeling',
    description: 'Put your brand on proven, FDA-registered product lines — packaging, UDI/GS1 barcoding, and compliance handled.',
  },
  '/segments/asc': {
    title: 'Surgery centers',
    description: 'Case-cart-ready supply programs for ambulatory surgery centers: orthopedic soft goods, wound care, and PPE with same-day shipping.',
  },
  '/segments/pharmacy': {
    title: 'Pharmacies',
    description: 'DME and front-of-store medical supply programs for independent and LTC pharmacies, with HCPCS-coded products.',
  },
  '/segments/ems': {
    title: 'EMS agencies',
    description: 'First-response and rescue supplies for EMS agencies, with government pricing and blanket purchase agreements.',
  },
  '/segments/distributors': {
    title: 'Distributors',
    description: 'Wholesale stock-feed and drop-ship programs for regional medical supply distributors.',
  },
  '/government': {
    title: 'Government & VA',
    description: 'Veteran-owned, FDA-registered supplier on MSPV BPA 36C24123A0077. TAA and Berry compliant products for VA, DoD, and federal buyers.',
  },
  '/procurement': {
    title: 'Procurement credentials',
    description: 'CAGE 8MK70, DUNS 117553945, FDA establishment 3015727296, MSPV BPA 36C24123A0077 — everything your contracting officer needs.',
  },
  '/about': {
    title: 'About',
    description: 'Veteran-owned, FDA-registered wholesale medical supply distribution founded in 2018, shipping nationwide from our Georgia warehouse.',
  },
  '/compliance': {
    title: 'Compliance',
    description: 'FDA registration, UDI/GS1 barcoding, TAA/Berry compliance, and lot-level traceability across the catalog.',
  },
  '/portfolio': {
    title: 'Portfolio',
    description: 'The brands and product lines Unite Medical manufactures, imports, and distributes.',
  },
  '/locations': {
    title: 'Locations',
    description: 'One Lithia Springs, Georgia warehouse with same-day shipping to all 50 states and territories.',
  },
  '/careers': {
    title: 'Careers',
    description: 'Unite Medical is a veteran-owned medical supply and supply-chain company, always interested in great people — engineering, sales, ops, compliance. Get in touch.',
  },
  '/contact': {
    title: 'Contact',
    description: 'Talk to sales or support — phone, email, or the form. Same-day response during business hours.',
  },
  '/support': {
    title: 'Support',
    description: 'Order status, returns, documentation requests, and account help.',
  },
  '/blog': {
    title: 'Blog',
    description: 'Orthopedic insights, supply chain analysis, and reimbursement coding guides from the Unite Medical team.',
  },
  '/resources': {
    title: 'HCPCS Level II code reference',
    description: 'Free searchable HCPCS Level II reference — every CMS procedure and supply code with full descriptions, cross-linked to Unite Medical SKUs. Updated quarterly from the official CMS dataset.',
  },
  '/resources/coding': {
    title: 'HCPCS coding reference for Unite SKUs',
    description: 'The HCPCS Level II codes Unite Medical products bill against, with official CMS descriptions. PDAC-approved SKUs flagged; every SKU links to its product page.',
  },
  '/case-studies/tjs': {
    title: 'Case study · TJS',
    description: 'How a regional surgical group cut supply spend with consolidated distribution.',
  },
  '/privacy': { title: 'Privacy policy', description: 'How Unite Medical collects, uses, and protects your data.' },
  '/terms': { title: 'Terms of service', description: 'Terms governing purchases and use of unitemedical.net.' },
  '/returns': { title: 'Returns', description: 'Returns accepted for manufacturer defects, and for unopened items within 30 days of the original purchase order.' },
  '/shipping': { title: 'Shipping', description: 'Same-day order processing and shipping on orders before 2pm EST, from our Georgia warehouse to all 50 states and territories.' },
};

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

  console.log(`Prerendered ${count} routes into dist/ (${Object.keys(STATIC_ROUTES).length} static + ${count - Object.keys(STATIC_ROUTES).length} products).`);
}

main();
