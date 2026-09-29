import { STATIC_ROUTES } from '../data/seoRoutes.js';

export const SITE_NAME = 'Unite Medical';
export const SITE_URL = 'https://unitemedical.net';
export const STAGING_URL = 'https://staging.unitemedical.net';
export const DEFAULT_DESCRIPTION = STATIC_ROUTES['/'].description;
export const SHARE_VERSION = 'v1';

export function formatTitle(title) {
  if (!title || title === SITE_NAME) return SITE_NAME;
  return `${title} · ${SITE_NAME}`;
}
export function routePath(value = '/') {
  try { return new URL(value, SITE_URL).pathname.replace(/\/+$/, '') || '/'; }
  catch { return '/'; }
}
export function shareImagePath(route = '/') {
  const path = routePath(route);
  if (path === '/welllink') return '/images/social/v2/welllink.jpg';
  return `/images/social/${SHARE_VERSION}/${path === '/' ? 'home' : path.slice(1)}.jpg`;
}
export function isPrivateRoute(path) {
  return /^\/(?:admin|staff|account|dashboard|cart|checkout|orders|invoices|quotes|q|vendor|rep|warehouse|work|distributor|activate|login|register)(?:\/|$)/.test(path)
    || path === '/quote/engine' || path === '/quote/new';
}
export function productMetadata(product) {
  return {
    title: product.name,
    description: `${product.name}. Explore specifications and request business pricing from Unite Medical.`,
    canonical: `/products/${encodeURIComponent(product.sku)}`,
    type: 'website',
    ogImage: shareImagePath(`/products/${encodeURIComponent(product.sku)}`),
    imageAlt: `${product.name} — Unite Medical product catalog`,
  };
}
export function resolveMetadata(path, overrides = {}, { staging = false, origin = staging ? STAGING_URL : SITE_URL } = {}) {
  const route = routePath(overrides.canonical || path);
  const known = STATIC_ROUTES[route] || (route === '/portal/quote' ? {title:'Quick quote',description:'Build a medical supply quote. Choose products, set quantities and send your request to Unite Medical.'} : undefined);
  const title = known?.title ?? overrides.title ?? SITE_NAME;
  const description = known?.description ?? overrides.description ?? DEFAULT_DESCRIPTION;
  const image = overrides.ogImage || shareImagePath(known || route.startsWith('/products/') ? route : '/');
  const noindex = staging || route === '/portal/quote' || overrides.noindex || isPrivateRoute(route) || (!known && !route.startsWith('/products/') && !route.startsWith('/blog/') && route !== '/portal/quote');
  return {
    title: formatTitle(title), description,
    canonical: new URL(route, SITE_URL).href,
    url: new URL(route, origin).href,
    image: new URL(image, origin).href,
    imageAlt: overrides.imageAlt || `${title} — ${SITE_NAME}`,
    type: overrides.type === 'article' ? 'article' : 'website',
    robots: noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large',
    jsonLd: overrides.jsonLd,
  };
}
export function organizationSchema() {
  return {
    '@context':'https://schema.org', '@type':'Organization', '@id':`${SITE_URL}/#organization`,
    name:SITE_NAME, url:SITE_URL, logo:`${SITE_URL}/brand/unite-medical-logo.png`,
    description:'Veteran-owned medical supplies, product sourcing and private-label programs.',
    address:{'@type':'PostalAddress',streetAddress:'1487 Trae Lane',addressLocality:'Lithia Springs',addressRegion:'GA',postalCode:'30122',addressCountry:'US'},
    contactPoint:[{'@type':'ContactPoint',telephone:'+1-833-868-6483',email:'support@unitemedical.net',contactType:'customer support',areaServed:'US',availableLanguage:'English'}],
  };
}
export function websiteSchema() {
  return {'@context':'https://schema.org','@type':'WebSite','@id':`${SITE_URL}/#website`,name:SITE_NAME,url:SITE_URL,publisher:{'@id':`${SITE_URL}/#organization`}};
}
export function breadcrumbSchema(items) {
  if (!items?.length) return null;
  return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map((item,index)=>({'@type':'ListItem',position:index+1,name:item.name,item:new URL(item.path,SITE_URL).href}))};
}
export function routeSchema(path, meta) {
  const route = routePath(path);
  const page = {'@context':'https://schema.org','@type':route==='/about'?'AboutPage':route==='/contact'?'ContactPage':'WebPage','@id':`${SITE_URL}${route}#webpage`,url:`${SITE_URL}${route}`,name:meta.title,description:meta.description,isPartOf:{'@id':`${SITE_URL}/#website`}};
  return route==='/' ? [organizationSchema(),websiteSchema(),page] : [page,breadcrumbSchema([{name:'Home',path:'/'},{name:meta.title,path:route}])];
}
