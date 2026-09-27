const store = 'https://admin.shopify.com/store/unite-medical';
function resourceId(value, type) {
  const text = String(value || '');
  if (/^[1-9]\d*$/.test(text)) return text;
  return text.match(new RegExp('^gid://shopify/' + type + '/([1-9]\\d*)$'))?.[1] || '';
}
export function shopifyRecordUrl(kind, record) {
  if (!record) return '';
  if (kind === 'products') {
    const product = resourceId(record.product_id, 'Product');
    const variant = resourceId(record.variant_id || record.id, 'ProductVariant');
    return product ? `${store}/products/${product}${variant ? `/variants/${variant}` : ''}` : '';
  }
  const type = {customers: 'Customer', orders: 'Order'}[kind];
  if (!type) return '';
  const id = resourceId(record.id, type);
  return id ? `${store}/${kind}/${id}` : '';
}
