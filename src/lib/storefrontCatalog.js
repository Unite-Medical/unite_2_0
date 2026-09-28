import { PUBLIC_CATALOG } from '../data/publicCatalog.generated.js';

// Public merchandising is an approved, price-free projection. A signed-in
// account's sparse legacy product snapshot must never replace it or publish
// internal records. Inventory and account prices remain separate live sources.
export const STOREFRONT_PRODUCTS = PUBLIC_CATALOG.products.map(product => ({ id: product.sku, ...product }));
export const SORTED_STOREFRONT_PRODUCTS = [...STOREFRONT_PRODUCTS].sort((a, b) => a.name.localeCompare(b.name));
export function storefrontProduct(sku) {
  return STOREFRONT_PRODUCTS.find(product => product.id === sku || product.sku === sku) || null;
}
