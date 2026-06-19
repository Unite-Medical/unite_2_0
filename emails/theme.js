/**
 * Shared email design tokens — mirrors src/tokens.js so transactional mail
 * matches the Unite Medical web app. Email-safe values only (flat colors,
 * web-safe fallbacks, no unsupported CSS).
 */
export const C = {
  paper: '#f7f2ea',
  paperAlt: '#ede5d6',
  card: '#fbf7ef',
  ink: '#241a28',
  inkDeep: '#18101b',
  ink2: '#564b5c',
  ink3: '#8f8490',
  line: '#e3dacd',
  plum: '#5e2963',
  plumSoft: '#c8a4cd',
  terra: '#b8502c',
  green: '#3b8760',
  white: '#ffffff',
};

export const FONTS = {
  display: 'Fraunces, Georgia, "Times New Roman", serif',
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  mono: '"IBM Plex Mono", "Courier New", monospace',
};

export const COMPANY = {
  name: 'Unite Medical',
  legal: 'Unite Medical Supply',
  tagline: 'The supply chain your suppliers use.',
  site: 'https://unitemedical.net',
  phone: '833.868.6483',
  phoneHref: 'tel:+18338686483',
  address: '1487 Trae Lane · Lithia Springs, GA 30122',
  credentials: 'FDA 3015727296 · CAGE 8MK70 · DUNS 117553945 · Veteran-Owned',
};
