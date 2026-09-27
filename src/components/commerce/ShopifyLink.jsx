import {shopifyRecordUrl} from '../../lib/shopifyLinks.js';
export function ShopifyLink({kind, record, className = '', compact = false}) {
  const href = shopifyRecordUrl(kind, record);
  if (!href) return null;
  return <a className={'cw-shopify-link ' + className} href={href} target="_blank" rel="noopener noreferrer" aria-label={'View ' + (record.number || record.name || record.sku || 'record') + ' in Shopify (opens in new tab)'}>{compact ? 'Shopify' : 'View in Shopify'} <span aria-hidden="true">↗</span></a>;
}
