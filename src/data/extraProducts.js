/* Hand-maintained products that are NOT in the Shopify store export.
   Merged into REAL_PRODUCTS (see realCatalog.js + scripts/import_catalog.py)
   so the importer never blows these away.

   Truthfulness standard: only verified facts. RegeniCool™ Pro specs come
   from the FDA establishment registration & device listing (Unite Medical,
   LLC · establishment #3015727296 · product code ILO · 21 CFR 890.5720).
   No public price exists — the listing is quote-only (price: null) until
   sales confirms one. HCPCS is left blank pending the PDAC approval letter
   (PRD-29 §2.2 / §6.4 wire-the-letter build). */

export const EXTRA_PRODUCTS = [
  {
    id: 'REGENICOOL-PRO',
    sku: 'REGENICOOL-PRO',
    handle: 'regenicool-pro-cold-compression-therapy-system',
    name: 'RegeniCool™ Pro Cold Compression Therapy System',
    vendor: 'Unite Medical',
    category: 'DME',
    product_type: 'Cold Compression Therapy',
    tier: 'DME',
    m6_category: 'Other / Medava',
    tags: ['DME', 'Cold Therapy', 'PDAC Approved'],
    collections: [],
    description:
      'The RegeniCool™ Pro is Unite Medical\u2019s cold compression therapy system for post-operative recovery, combining circulating cold-water therapy with compression to manage pain and swelling after orthopedic procedures. It is FDA-listed as a Class 2 water-circulating hot/cold therapy device (product code ILO, 21 CFR 890.5720), developed by Unite Medical, LLC with Total Joint Specialists, and carries PDAC approval. Deployed today through surgeon-led patient recovery programs, it is available to practices, ASCs, and DME suppliers through Unite Medical.',
    summary:
      'FDA-listed Class 2 cold compression therapy system for post-operative recovery — developed by Unite Medical with Total Joint Specialists, PDAC approved.',
    images: [],
    hero_image: '',
    price: null,
    price_min: null,
    price_max: null,
    pack_size: '1 system',
    moq: 1,
    hcpcs: '—',
    url: '',
    num_variants: 0,
    num_images: 0,
    variants: [],
    img: 'RegeniCool™ Pro Cold Compression Therapy System',
    quote_only: true,
    fda_registered: true,
    pdac_approved: true,
    taa_compliant: false,
    berry_compliant: false,
    mspv_listed: false,
    latex_free: false,
    country_of_origin: 'US',
  },
];
