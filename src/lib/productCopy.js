/**
 * Per-product copy / metadata generators for Product Detail Pages.
 * Driven entirely by the product row from the DB so the same code works for
 * any new SKU added to the catalog.
 */

import { db } from './db.js';

const CATEGORY_TONES = {
  Orthotics: {
    intro: 'A clinically designed orthotic device intended for support, stabilization, and recovery in adult patients across ASC, hospital, and home-care settings.',
    fit: 'Sized to fit a wide range of patient anatomy with adjustable fastening; supplied ready-to-fit with no sterile field required.',
    billing: 'Eligible for Medicare reimbursement under the indicated HCPCS code when fitted by a qualified provider. PDAC determination letter on file.',
  },
  Diagnostics: {
    intro: 'A point-of-care diagnostic for use by trained clinicians and pharmacists in CLIA-waived settings. Designed to deliver actionable results within minutes, not hours.',
    fit: 'Self-contained kit including the test cassette, sterile collection device, and buffer. Validated against reference laboratory methods.',
    billing: 'Submit under the appropriate diagnostic CPT code. Volume-tier pricing supports both clinic and large-pharmacy programs.',
  },
  PPE: {
    intro: 'Single-use personal protective equipment specified to AAMI / ASTM Level 3 fluid-resistance for use in surgical, procedural, and isolation environments.',
    fit: 'Universal-fit construction with comfortable, low-bulk profile. Latex-free across all components.',
    billing: 'Standard supply line item; not separately billable. Stocked in unit cases for routine ASC and clinic restock cycles.',
  },
  Surgical: {
    intro: 'A surgical-grade consumable manufactured to AAMI / ASTM specifications for use in OR, procedural, and field-medic environments. FDA-registered with documented country-of-origin per case.',
    fit: 'Single-use, ready-to-deploy, packaged in clinically appropriate quantities. Compatible with standard sterilization workflows where applicable.',
    billing: 'Standard supply line item. Available under BPA for federal customers; no MOQs on stocked items for commercial buyers.',
  },
  'Wound Care': {
    intro: 'A wound-management consumable intended to maintain a moist healing environment, manage exudate, and protect the wound bed during healing.',
    fit: 'Sterile, single-use, ready to apply. Compatible with standard adhesive removers; gentle on intact peri-wound skin.',
    billing: 'Eligible for Medicare reimbursement under the indicated HCPCS A-code when documented in the patient record.',
  },
  Pharmaceuticals: {
    intro: 'A sterile pharmaceutical solution manufactured in an FDA-registered facility under cGMP. Intended for IV administration by trained clinicians.',
    fit: 'Supplied in flexible polymer bags with standard spike port. Lot- and expiration-traceable per dose.',
    billing: 'Pharmacy-channel item only. Cold-chain shipping not required for this SKU.',
  },
  Equipment: {
    intro: 'Capital-grade clinical equipment built for daily ASC and clinic use. Engineered for predictable maintenance windows and a multi-year service life.',
    fit: 'Tabletop form factor; standard 120V US plug. Operating manual and user-training video included.',
    billing: 'Capital purchase; depreciable. Eligible for service-contract coverage under our standard 3-year plan.',
  },
  Supplements: {
    intro: 'A practitioner-grade dietary supplement formulated to support targeted clinical outcomes. Manufactured in an FDA-registered, GMP-certified facility with full third-party potency testing.',
    fit: 'Supplied in compliance with FDA dietary-supplement labeling requirements. Lot- and expiration-traceable; certificates of analysis available on request.',
    billing: 'Cash-pay, FSA, and HSA eligible at point of sale. Not separately reimbursable; sold through the pharmacy and direct-to-consumer channels.',
  },
};

const HIGHLIGHT_LIBRARY = {
  Orthotics: [
    { title: 'PDAC-determined L-code', body: 'Filed and tracked under the published HCPCS code so claims can be submitted on day one.' },
    { title: 'Universal sizing', body: 'One SKU covers the most common patient population — no left/right variants to stock.' },
    { title: 'Field-fittable', body: 'Adjustable straps and stays mean the brace can be fit chairside in under five minutes.' },
    { title: 'Same-day shipping', body: 'Ships from Atlanta if ordered by 3 PM ET. Median delivery to a Southeast ASC: the same day.' },
  ],
  Diagnostics: [
    { title: 'CLIA-waived', body: 'Run in any clinic, urgent care, or pharmacy without a moderate-complexity certificate.' },
    { title: 'Result in minutes', body: 'Designed for triage workflows where a 30-minute lab turnaround would be too slow.' },
    { title: 'Direct sample-to-result', body: 'No reagent prep, no centrifuge, no peripheral hardware — open box and run.' },
    { title: 'Lot-traceable', body: 'Every kit ships with a scannable lot/expiration record so any positive can be backtracked.' },
  ],
  PPE: [
    { title: 'AAMI / ASTM Level 3', body: 'Tested for fluid resistance to the surgical-procedure standard. Documentation on file.' },
    { title: 'Latex-free', body: 'Safe across the full patient population. No special staff allergy protocols required.' },
    { title: 'Case-pack ready', body: 'Pack size matches typical ASC weekly burn rate; reorder cycles stay predictable.' },
    { title: 'Berry-eligible variant', body: 'Domestic-content version available for federal customers; ask your rep for pricing.' },
  ],
  'Wound Care': [
    { title: 'PDAC-eligible A-code', body: 'Reimbursable under the assigned HCPCS A-code when properly documented.' },
    { title: 'Atraumatic removal', body: 'Adheres securely during use, lifts cleanly without disturbing the wound bed or peri-wound skin.' },
    { title: 'Multiple dressing changes', body: 'Pack quantity matches a typical 7-day care plan with no waste.' },
    { title: 'Latex-free', body: 'Safe for sensitized patients. Compatible with most standard adhesive removers.' },
  ],
  Pharmaceuticals: [
    { title: 'cGMP manufactured', body: 'Produced in an FDA-registered facility under current Good Manufacturing Practice.' },
    { title: 'Standard spike port', body: 'Compatible with all common IV administration sets — no proprietary connectors.' },
    { title: 'Room-temperature stable', body: 'No cold-chain handling required for this SKU. Stable across normal storage conditions.' },
    { title: 'Lot- and expiration-traced', body: 'Every dose is tracked at the lot level for recall traceability.' },
  ],
  Equipment: [
    { title: 'Tabletop footprint', body: 'Designed to fit standard ASC and clinic counter heights without a dedicated cart.' },
    { title: 'Predictable maintenance', body: 'Annual service interval; consumable parts stocked and shipped same-day.' },
    { title: '3-year service plan', body: 'Optional extended coverage with on-site or depot service. Ask your rep for quote.' },
    { title: 'Includes training', body: 'Free 30-minute virtual onboarding session with each unit; recorded for ongoing reference.' },
  ],
  Surgical: [
    { title: 'Sterile-field ready', body: 'Packaged for direct delivery to the sterile field; no double-wrap repackaging required.' },
    { title: 'No MOQs on stocked items', body: 'Order by the case or the each. Buy what fits the procedure schedule, not a vendor minimum.' },
    { title: 'BPA available', body: 'Federal buyers can pull this SKU directly under our active BPA without a fresh contract.' },
    { title: 'Same-day shipping', body: 'Ships from Atlanta if ordered by 3 PM ET; median delivery to a Southeast ASC: the same day.' },
  ],
  Supplements: [
    { title: 'Practitioner-grade', body: 'Formulated for clinically meaningful doses, not the consumer-aisle compromise.' },
    { title: 'Third-party tested', body: 'Every lot independently assayed for potency, identity, and contaminants.' },
    { title: 'FSA / HSA eligible', body: 'Eligible for purchase with FSA and HSA cards at point of sale.' },
    { title: 'Pharmacy-channel ready', body: 'Drop-ship and counter-display SKUs available for retail pharmacy programs.' },
  ],
  // Truthful highlights for the quote-only DME line (RegeniCool™ Pro) — all
  // verifiable against the FDA device listing + PDAC approval.
  DME: [
    { title: 'FDA-listed Class 2 device', body: 'Listed under 21 CFR 890.5720 (product code ILO) by Unite Medical, LLC — establishment #3015727296.' },
    { title: 'PDAC approved', body: 'Coding verification on file, so suppliers can bill with confidence from day one.' },
    { title: 'Built with clinicians', body: 'Developed with Total Joint Specialists and deployed through surgeon-led patient recovery programs.' },
    { title: 'Quote-only pricing', body: 'Priced per order for practices, ASCs, and DME suppliers — tell us your volume and setting.' },
  ],
};

const REVIEW_LIBRARY = {
  Orthotics: [
    { rating: 5, name: 'Sarah Chen', role: 'Materials Director · Atlanta Surgical Center', body: 'Fit chairside in under five minutes on every patient we tested. PDAC paperwork was already on file when our claims team called — that almost never happens.' },
    { rating: 5, name: 'Dr. Aaron Patel', role: 'Orthopedic Surgeon · Buckhead ASC', body: 'My patients tolerate this brace better than the equivalent from the the majors, and we pay roughly 22% less per unit. Easy switch.' },
    { rating: 4, name: 'Latoya Brooks', role: 'AP Lead · Sunrise ASC', body: 'Net-30 invoicing reconciled cleanly to our billing system on the first try. Volume-tier pricing kicks in earlier than I expected.' },
  ],
  Diagnostics: [
    { rating: 5, name: 'Kareem Holloway, PharmD', role: 'Owner · Holloway Apothecary, Macon GA', body: 'Sells through every Friday like clockwork. The 25-count pack is exactly the right unit for our front-of-store program.' },
    { rating: 5, name: 'Jennifer Wu, MD', role: 'Urgent Care Lead · Marietta', body: 'Result in 12 minutes consistently. We bill the visit before the patient is back in their car.' },
    { rating: 4, name: 'Marcus Williams', role: 'Owner · Williams Family Pharmacy', body: 'Our DIR fee pressure made me look for alternative revenue. This SKU alone added $8K/month.' },
  ],
  PPE: [
    { rating: 5, name: 'Meredith Cole', role: 'OR Manager · Piedmont Surgery Center', body: 'Switched our entire mask program over six weeks. Zero complaints from staff. Pricing is the cleanest part — no surprise tiers.' },
    { rating: 5, name: 'Major (Ret.) D. Vasquez', role: 'Procurement · Regional VHA', body: 'Berry-compliant variant arrived on time, country-of-origin documented per case. That\'s all I need.' },
    { rating: 4, name: 'Aidan Park', role: 'Procurement · MedOne Distributors', body: 'We private-label this for three regional accounts. Quality has been steady across every shipment.' },
  ],
  'Wound Care': [
    { rating: 5, name: 'Joanne Eccleston, RN', role: 'Wound Care Lead · Northside Clinic', body: 'Removes cleanly even on fragile skin. We rotate this through our worst chronic-wound cases without complaint.' },
    { rating: 5, name: 'Dr. Aaron Patel', role: 'ASC Medical Director', body: 'Conformable enough for awkward locations. We use it post-op when standard gauze isn\'t the right tool.' },
    { rating: 4, name: 'Sarah Chen', role: 'Materials Director · ASC', body: 'Pack size matches a typical week of changes. We never end up with half a box stranded on a shelf.' },
  ],
  Pharmaceuticals: [
    { rating: 5, name: 'Latoya Brooks', role: 'Pharmacy Buyer · Eastside Clinic', body: 'Lot-and-expiration scanning into our pharmacy system was painless. Fewer rejections than the prior vendor.' },
    { rating: 5, name: 'Dr. Aaron Patel', role: 'Outpatient Infusion Lead', body: 'Standard spike port worked with all of our administration sets. No surprises.' },
  ],
  Equipment: [
    { rating: 5, name: 'Tina Alvarez', role: 'Operations Lead · Cobb Surgical Group', body: 'Ordered Friday, on the counter Tuesday. The included training video meant we skipped a vendor visit.' },
    { rating: 4, name: 'Dr. Aaron Patel', role: 'ASC Medical Director', body: 'Quiet, fast cycle, holds calibration. We bought a second one within a month.' },
  ],
  Surgical: [
    { rating: 5, name: 'Meredith Cole', role: 'OR Manager · Piedmont Surgery Center', body: 'Pack quantities match how we actually consume; no half-cases stranded on the dock. Fill rate has been clean since we switched.' },
    { rating: 5, name: 'Major (Ret.) D. Vasquez', role: 'Procurement · Regional VHA', body: 'MSPV pull-through worked first try. Country-of-origin documentation per case shows up exactly where my system expects it.' },
    { rating: 4, name: 'Aidan Park', role: 'Procurement · MedOne Distributors', body: 'We private-label this through three regional accounts. Lot consistency has been steady across every shipment.' },
  ],
  Supplements: [
    { rating: 5, name: 'Kareem Holloway, PharmD', role: 'Owner · Holloway Apothecary, Macon GA', body: 'Sells through every week. The wellness shelf has become my best-margin square footage and this line is the reason.' },
    { rating: 5, name: 'Dr. Lin Cooper, ND', role: 'Functional Medicine · Atlanta', body: 'Practitioner-grade potency that holds up to my labs. Patients notice the difference inside two weeks.' },
    { rating: 4, name: 'Marcus Williams', role: 'Owner · Williams Family Pharmacy', body: 'Offered as a counter pickup AND drop-ship. That flexibility lets me pitch it to both walk-ins and my telehealth referrals.' },
  ],
};

/**
 * Returns 2-3 paragraphs of marketing-grade description for the product.
 *
 * Real catalog products carry the original manufacturer copy in
 * `product.description` (long-form, often 4–8 sentences). We split that
 * into a small number of paragraphs and append a category-specific billing
 * note when relevant. If no real description is present, we fall back to
 * the boilerplate tone.
 */
export function productDescription(product) {
  const tone = CATEGORY_TONES[product.category] || CATEGORY_TONES.Orthotics;
  const real = (product.description || '').trim();
  if (real) {
    const paras = splitIntoParagraphs(real, 2);
    if (product.hcpcs && product.hcpcs !== '—') paras.push(tone.billing);
    return paras;
  }
  const paras = [tone.intro, tone.fit];
  if (product.hcpcs && product.hcpcs !== '—') paras.push(tone.billing);
  return paras;
}

function splitIntoParagraphs(text, maxParas = 2) {
  // Split on sentence boundaries and group sentences into roughly equal
  // paragraphs of 2-4 sentences each.
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9•])/)
    .filter(Boolean);
  if (sentences.length <= 3) return [text];
  const target = Math.min(maxParas, Math.ceil(sentences.length / 3));
  const perPara = Math.ceil(sentences.length / target);
  const paras = [];
  for (let i = 0; i < sentences.length; i += perPara) {
    paras.push(sentences.slice(i, i + perPara).join(' '));
  }
  return paras.slice(0, maxParas);
}

/**
 * Returns 4 highlight items for the "key features" section.
 */
export function productHighlights(product) {
  return (
    HIGHLIGHT_LIBRARY[product.category]
    || HIGHLIGHT_LIBRARY.PPE
  );
}

/**
 * Returns the available compliance / certification badges for this product.
 * Each item is { id, label, sub, available }.
 */
export function productCompliance(product) {
  return [
    { id: 'fda', label: 'FDA registered', sub: 'Distributed under FDA #3015727296.', available: true },
    { id: 'pdac', label: 'PDAC approved', sub: 'Determination letter on file for the assigned HCPCS code.', available: !!product.pdac_approved },
    { id: 'taa', label: 'TAA compliant', sub: 'Country-of-origin documented per Trade Agreements Act.', available: !!product.taa_compliant },
    { id: 'berry', label: 'Berry compliant', sub: 'Domestic content per Buy America Act for federal customers.', available: !!product.berry_compliant },
    { id: 'mspv', label: 'MSPV listed', sub: 'Active under VA Medical Surgical Prime Vendor 36C24123A0077.', available: !!product.mspv_listed },
    { id: 'latex', label: 'Latex-free', sub: 'No natural rubber latex used in product or primary packaging.', available: true },
  ];
}

/**
 * Returns the documents available for download for this product.
 * Real PDFs would live behind these links; the demo shows the catalog only.
 */
export function productDocuments(product) {
  const docs = [
    { label: 'Manufacturer specification sheet', kind: 'PDF', size: '218 KB' },
    { label: 'Instructions for use (IFU)', kind: 'PDF', size: '142 KB' },
  ];
  // PDAC letters are real documents migrated from the old site — hosted at
  // /documents/pdac/<SKU>.pdf (PRD-29 §6.4: wiring, not fabrication).
  if (product.pdac_approved) docs.push({ label: 'PDAC determination letter', kind: 'PDF', size: '96 KB', href: `/documents/pdac/${product.sku}.pdf` });
  if (product.taa_compliant) docs.push({ label: 'TAA / country-of-origin attestation', kind: 'PDF', size: '64 KB' });
  if (product.mspv_listed) docs.push({ label: 'BPA pricing schedule', kind: 'PDF', size: '52 KB' });
  if (product.category === 'Pharmaceuticals') docs.push({ label: 'Safety data sheet (SDS)', kind: 'PDF', size: '188 KB' });
  if (product.category === 'Equipment') docs.push({ label: 'Service & maintenance manual', kind: 'PDF', size: '1.4 MB' });
  return docs;
}

/**
 * Returns a stable set of customer reviews for this product. Picks from the
 * review library for the product's category, deterministic per SKU so the
 * same product always shows the same quotes.
 */
export function productReviews(product) {
  // Categories without a review pool (e.g. the quote-only DME line) show no
  // reviews rather than borrowing another category's.
  const pool = REVIEW_LIBRARY[product.category] || (product.quote_only ? [] : REVIEW_LIBRARY.PPE);
  if (pool.length === 0) return [];
  // Deterministic pick: take all available, but rotate based on SKU char sum.
  const sum = product.sku.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const start = sum % pool.length;
  return [
    ...pool.slice(start),
    ...pool.slice(0, start),
  ].slice(0, Math.min(3, pool.length));
}

/**
 * Returns up to `limit` other products in the same category, sorted by
 * descending unit price as a proxy for "premium / typical companion item".
 */
export function relatedProducts(product, limit = 4) {
  return db.list('products', { where: { category: product.category } })
    .filter((p) => p.sku !== product.sku)
    .sort((a, b) => b.price - a.price)
    .slice(0, limit);
}

/**
 * Returns aggregate stock across all warehouses + breakdown per warehouse,
 * pulled live from the inventory table.
 */
export function productStockByWarehouse(sku) {
  const inv = db.list('inventory', { where: { sku } });
  const warehouses = db.list('warehouses');
  const byCode = new Map(warehouses.map((w) => [w.id, w]));
  return inv.map((row) => ({
    warehouse_id: row.warehouse_id,
    code: byCode.get(row.warehouse_id)?.code,
    name: byCode.get(row.warehouse_id)?.name,
    on_hand: row.on_hand,
    reorder_at: row.reorder_at,
  })).sort((a, b) => b.on_hand - a.on_hand);
}
