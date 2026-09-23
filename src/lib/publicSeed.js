import { PUBLIC_CATALOG } from '../data/publicCatalog.generated.js';

function upcForSku(sku) {
  let hash = 2166136261;
  for (let index = 0; index < String(sku).length; index += 1) {
    hash ^= String(sku).charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const body = String(hash).padStart(10, '0').slice(0, 4);
  const base = `0860093${body}`;
  let sum = 0;
  for (let index = 0; index < 11; index += 1) sum += Number(base[index]) * (index % 2 === 0 ? 3 : 1);
  return `${base}${(10 - (sum % 10)) % 10}`;
}

export function seed(db) {
  for (const category of PUBLIC_CATALOG.categories) {
    db.categories.push({ id: category.slug, ...category });
  }

  for (const product of PUBLIC_CATALOG.products) {
    const upc = upcForSku(product.sku);
    db.products.push({
      id: product.sku,
      ...product,
      upc,
      gtin: `00${upc}`,
      availability_status: product.quote_only ? 'quote_only' : 'available',
    });
    db.inventory.push({
      id: `public_availability_${product.sku}`,
      sku: product.sku,
      warehouse_id: 'public',
      on_hand: product.quote_only ? 0 : 1,
      public_projection: true,
    });
    for (const variant of product.variants || []) {
      db.product_variants.push({
        id: variant.variant_id || `${product.sku}_${variant.title}`,
        product_id: product.sku,
        ...variant,
      });
    }
  }

  for (const collection of PUBLIC_CATALOG.collections) {
    db.cms_pages.push({
      id: `collection_${collection.slug}`,
      slug: `/catalog/${collection.slug}`,
      title: collection.name,
      published: true,
      kind: 'collection',
      handles: collection.handles,
      category: collection.category,
    });
  }
}
