/** Metadata is emitted into HTML at build time, then updated on SPA navigation. */
import { useEffect } from 'react';
import { resolveMetadata, routeSchema, SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION, shareImagePath } from './seoMetadata.js';
export { organizationSchema, websiteSchema, breadcrumbSchema } from './seoMetadata.js';

/** Idempotently replaces (or creates) a meta tag. */
function setMeta({ name, property, content }) {
  if (content == null) return;
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    if (name) tag.setAttribute('name', name);
    if (property) tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', String(content));
}

/** Idempotently replaces (or creates) a <link rel="X"> tag. */
function setLink(rel, href) {
  if (!href) return;
  let tag = document.head.querySelector(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement('link');
    tag.setAttribute('rel', rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute('href', href);
}

/** Idempotently replaces (or creates) the JSON-LD script tag for the page. */
function setJsonLd(jsonLd) {
  const id = 'um-jsonld';
  let tag = document.head.querySelector(`script#${id}`);
  if (!jsonLd) {
    if (tag) tag.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement('script');
    tag.setAttribute('type', 'application/ld+json');
    tag.id = id;
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(jsonLd);
}


export function useSEO(options = {}) {
  const path = options.canonical || (typeof window !== 'undefined' ? window.location.pathname : '/');
  const staging = import.meta.env?.VITE_UNITE_ENVIRONMENT === 'staging' || (typeof window !== 'undefined' && window.location.hostname === 'staging.unitemedical.net');
  const meta = resolveMetadata(path, options, { staging });
  const schema = JSON.stringify(options.jsonLd ?? (meta.robots.startsWith('noindex') && !staging ? null : routeSchema(path, meta)));
  useEffect(() => {
    document.title = meta.title;
    setMeta({name:'description',content:meta.description});
    setMeta({name:'robots',content:meta.robots});
    setLink('canonical',meta.canonical);
    for (const [property,content] of Object.entries({
      'og:title':meta.title,'og:description':meta.description,'og:type':meta.type,'og:url':meta.url,
      'og:image':meta.image,'og:image:secure_url':meta.image,'og:image:type':'image/jpeg',
      'og:image:width':'1200','og:image:height':'630','og:image:alt':meta.imageAlt,
      'og:site_name':SITE_NAME,'og:locale':'en_US',
    })) setMeta({property,content});
    for (const [name,content] of Object.entries({'twitter:card':'summary_large_image','twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':meta.image,'twitter:image:alt':meta.imageAlt})) setMeta({name,content});
    setJsonLd(JSON.parse(schema));
  },[meta.title,meta.description,meta.robots,meta.canonical,meta.url,meta.type,meta.image,meta.imageAlt,schema]);
}

export function productSchema(product, { stock = 0, image, includePricing = true } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    description: `${product.category} — pack of ${product.pack_size}. ${product.hcpcs && product.hcpcs !== '—' ? `HCPCS ${product.hcpcs}.` : ''}`.trim(),
    image: image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : undefined,
    category: product.category,
    gtin: undefined,
    additionalProperty: [
      product.hcpcs && product.hcpcs !== '—' && {
        '@type': 'PropertyValue', name: 'HCPCS', value: product.hcpcs,
      },
      product.hts_code && {
        '@type': 'PropertyValue', name: 'HTS', value: product.hts_code,
      },
      product.country_of_origin && {
        '@type': 'PropertyValue', name: 'Country of origin', value: product.country_of_origin,
      },
      product.pdac_approved && {
        '@type': 'PropertyValue', name: 'PDAC approved', value: 'Yes',
      },
      product.taa_compliant && {
        '@type': 'PropertyValue', name: 'TAA compliant', value: 'Yes',
      },
      product.berry_compliant && {
        '@type': 'PropertyValue', name: 'Berry compliant', value: 'Yes',
      },
      product.mspv_listed && {
        '@type': 'PropertyValue', name: 'MSPV listed', value: 'Yes',
      },
    ].filter(Boolean),
    // Quote-only products (no public price) get no Offer / rating markup —
    // never advertise a null price or a fabricated rating for them.
    ...(!includePricing || product.quote_only || product.price == null ? {} : {
      offers: {
        '@type': 'Offer',
        priceCurrency: 'USD',
        price: product.price,
        availability: stock > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: SITE_NAME },
        url: `${SITE_URL}/products/${product.sku}`,
      },
    }),
  };
}

export function articleSchema(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    author: { '@type': 'Person', name: post.author },
    datePublished: post.posted_at,
    dateModified: post.posted_at,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/unite-medical-logo.png` },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/blog/${post.slug}`,
    },
  };
}


export const SEO_DEFAULTS = {siteName:SITE_NAME,siteUrl:SITE_URL,defaultDescription:DEFAULT_DESCRIPTION,defaultOgImage:shareImagePath('/')};
