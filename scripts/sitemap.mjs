import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { STATIC_ROUTES } from './seo-routes.mjs';
import { REAL_PRODUCTS } from '../src/data/realCatalog.js';

export function buildSitemap() {
  // No public blog posts are currently seeded. Add published article metadata
  // to the shared route list when articles launch; never scrape source comments.
  const paths = new Set(['/', ...Object.keys(STATIC_ROUTES), ...REAL_PRODUCTS.filter(p => p.sku).map(p => `/products/${encodeURIComponent(p.sku)}`)]);
  const entries = [...paths].map(route => `  <url><loc>https://unitemedical.net${route}</loc></url>`);
  // Omit lastmod rather than claim that every page changed on every build.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(new URL('../public/sitemap.xml', import.meta.url), buildSitemap());
  console.log('Updated public/sitemap.xml from the prerendered public routes and catalog.');
}
