/** The migrated commerce catalog is the same source used by staff order drafts.
 * Once populated, it replaces the retired products table for self-serve pricing.
 * Only active, publicly listed SKUs with a positive retail price can be quoted.
 * Customer contract pricing continues through resolveAuthoritativePrice.
 */
import { PUBLIC_CATALOG } from '../../src/data/publicCatalog.generated.js';

export function buildQuickQuoteCatalog(legacyProducts = [], commerceProducts = [], publicProducts = PUBLIC_CATALOG.products) {
  if (!commerceProducts.length) return legacyProducts;
  const publicSkus = new Map();
  for (const product of publicProducts) {
    publicSkus.set(product.sku, product);
    for (const variant of product.variants || []) publicSkus.set(variant.sku, product);
  }
  return commerceProducts.flatMap(product => {
    const sku = String(product.sku || '').trim();
    const published = publicSkus.get(sku);
    if (!published) return [];
    const price = Number(product.retail);
    const quoteOnly = published.quote_only || product.status !== 'active' || !Number.isFinite(price) || price <= 0;
    return [{
      id: product.id, sku,
      name: product.name || published.name,
      price: quoteOnly ? null : price,
      quote_only: Boolean(quoteOnly),
      catalog_source: 'commerce_products',
    }];
  });
}

export async function loadQuickQuoteCatalog(sql) {
  const rows = await sql`SELECT tbl,data FROM um_rows WHERE tbl IN ('products','commerce_products') AND deleted=false`;
  return buildQuickQuoteCatalog(
    rows.filter(row => row.tbl === 'products').map(row => row.data),
    rows.filter(row => row.tbl === 'commerce_products').map(row => row.data),
  );
}
