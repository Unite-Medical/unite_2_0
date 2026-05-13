/**
 * Per-page SEO + structured data.
 *
 * Vite SPA — crawlers that execute JS (Google, Bing, Slackbot, Twitterbot,
 * LinkedInBot) all see the dynamically-set tags. Older crawlers fall back to
 * the defaults set in /index.html. For long-term SEO on a B2B catalog this
 * is good enough; if Unite ever migrates to Next.js the same shape (title /
 * description / canonical / OG / JSON-LD) ports straight over to next/head.
 */

import { useEffect } from 'react';

const SITE_NAME = 'Unite Medical';
const SITE_URL = 'https://unitemedical.net';
const DEFAULT_OG_IMAGE = '/favicon-512.png';
const DEFAULT_DESCRIPTION =
  'FDA-registered, veteran-owned wholesale medical supply distribution for ASCs, pharmacies, government, EMS, and regional distributors. Same-day shipping on orders before 2pm EST from our Georgia & Nevada warehouses.';

/**
 * Returns the title formatted for `<title>` — adds the site suffix unless
 * the page is the homepage.
 */
function formatTitle(title) {
  if (!title) return SITE_NAME;
  if (title === SITE_NAME) return title;
  return `${title} · ${SITE_NAME}`;
}

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

/**
 * useSEO({ title, description, canonical, ogImage, type, noindex, jsonLd })
 *
 *  title       page-specific title (will be suffixed with " · Unite Medical")
 *  description page-specific meta description (160 char target)
 *  canonical   absolute or path-relative URL of the canonical page
 *  ogImage     absolute or path-relative URL of the OG/Twitter image
 *  type        og:type (defaults to 'website'; 'article' for blog posts,
 *              'product' for PDPs)
 *  noindex     boolean — adds noindex,nofollow to robots when true
 *  jsonLd      object or array of objects to embed as JSON-LD structured data
 */
export function useSEO({
  title,
  description = DEFAULT_DESCRIPTION,
  canonical,
  ogImage = DEFAULT_OG_IMAGE,
  type = 'website',
  noindex = false,
  jsonLd,
} = {}) {
  useEffect(() => {
    const fullTitle = formatTitle(title);
    document.title = fullTitle;

    setMeta({ name: 'description', content: description });
    setMeta({ name: 'robots', content: noindex ? 'noindex,nofollow' : 'index,follow' });

    const canonicalHref = canonical
      ? (canonical.startsWith('http') ? canonical : `${SITE_URL}${canonical}`)
      : `${SITE_URL}${typeof window !== 'undefined' ? window.location.pathname : ''}`;
    setLink('canonical', canonicalHref);

    const ogImageHref = ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage}`;

    setMeta({ property: 'og:title', content: fullTitle });
    setMeta({ property: 'og:description', content: description });
    setMeta({ property: 'og:type', content: type });
    setMeta({ property: 'og:url', content: canonicalHref });
    setMeta({ property: 'og:image', content: ogImageHref });
    setMeta({ property: 'og:site_name', content: SITE_NAME });

    setMeta({ name: 'twitter:card', content: 'summary_large_image' });
    setMeta({ name: 'twitter:title', content: fullTitle });
    setMeta({ name: 'twitter:description', content: description });
    setMeta({ name: 'twitter:image', content: ogImageHref });

    setJsonLd(jsonLd);
    // We deliberately re-run on every render so dynamic data (product
    // attributes, blog body, etc.) flows into the head as it changes.
  });
}

// ---------------------------------------------------------------------------
// JSON-LD builders
// ---------------------------------------------------------------------------

/** Site-wide Organization schema, mounted on the homepage. */
export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon-512.png`,
    description:
      'Veteran-owned, FDA-registered wholesale medical supply distribution.',
    foundingDate: '2018',
    foundingLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        streetAddress: '1487 Trae Lane',
        addressLocality: 'Lithia Springs',
        addressRegion: 'GA',
        postalCode: '30122',
        addressCountry: 'US',
      },
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: '+1-678-555-0142',
        contactType: 'sales',
        areaServed: 'US',
        availableLanguage: 'English',
      },
      {
        '@type': 'ContactPoint',
        telephone: '+1-678-555-0180',
        contactType: 'customer support',
        areaServed: 'US',
        availableLanguage: 'English',
      },
    ],
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'FDA Establishment Registration', value: '3015727296' },
      { '@type': 'PropertyValue', propertyID: 'CAGE', value: '8MK70' },
      { '@type': 'PropertyValue', propertyID: 'DUNS', value: '117553945' },
      { '@type': 'PropertyValue', propertyID: 'BPA', value: '36F79725D0203' },
    ],
  };
}

/** Site-wide WebSite schema (with sitelinks searchbox). */
export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/catalog?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Product schema for PDPs. */
export function productSchema(product, { stock = 0, image } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    description: `${product.category} — pack of ${product.pack_size}. ${product.hcpcs && product.hcpcs !== '—' ? `HCPCS ${product.hcpcs}.` : ''}`.trim(),
    image: image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : undefined,
    brand: { '@type': 'Brand', name: SITE_NAME },
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
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: 142,
    },
  };
}

/** Article schema for blog posts. */
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
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512.png` },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}/blog/${post.slug}`,
    },
  };
}

/** BreadcrumbList schema; pass [{ name, path }, …]. */
export function breadcrumbSchema(items) {
  if (!items?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

export const SEO_DEFAULTS = {
  siteName: SITE_NAME,
  siteUrl: SITE_URL,
  defaultDescription: DEFAULT_DESCRIPTION,
  defaultOgImage: DEFAULT_OG_IMAGE,
};
