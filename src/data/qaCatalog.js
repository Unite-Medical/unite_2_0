// Staging-only storefront fixtures for end-to-end checkout tests. Never published in production.
export const QA_STOREFRONT_PRODUCTS = [{
  sku: 'TEST-QA-1', handle: 'test-qa-1', name: 'TEST QA $1 product', category: 'Test', pack_size: '1 ea', hcpcs: '—', moq: 1,
  img: 'TEST QA $1 product', summary: 'Staging-only QA test product.', description: 'Staging-only QA test product for checkout testing. Not for sale.',
  images: [], hero_image: '',
  variants: [{ variant_id: 'variant_test_qa_1', sku: 'TEST-QA-1', title: 'Default Title', available: true, weight_grams: 454, options: { Title: 'Default Title' }, image: '' }],
  tags: ['qa'], collections: [], product_type: null, m6_category: null, quote_only: false, fda_registered: false, pdac_approved: false,
  taa_compliant: false, berry_compliant: false, mspv_listed: false, latex_free: false, country_of_origin: null,
}];

export function withQaProducts(products, environment) {
  if (environment !== 'staging') return products;
  const skus = new Set(products.map((p) => p.sku));
  return [...products, ...QA_STOREFRONT_PRODUCTS.filter((p) => !skus.has(p.sku))];
}
