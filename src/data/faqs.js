// Canonical FAQ copy — consumed by /support and the FAQPage JSON-LD emitted
// from the same page. Reworked per PRD-29 §6.4: every section the Support
// page filters on has real FAQs, held to the truthfulness standard.
// Section ids must match SUPPORT_SECTIONS below.

export const SUPPORT_SECTIONS = [
  'Ordering & MOQ',
  'Shipping & freight',
  'Billing & terms',
  'Returns',
  'Compliance',
  'Integrations & EDI',
  'Private label',
];

export const FAQS = [
  // ── Ordering & MOQ ────────────────────────────────────────────────
  {
    section: 'Ordering & MOQ',
    question: 'Do you have minimum order quantities?',
    answer:
      'No minimum order quantities on stocked items. Every SKU in our catalog can be ordered in single units. Volume pricing is available at tier breaks but never as a hard floor.',
  },
  {
    section: 'Ordering & MOQ',
    question: 'Can I get a quote on something not in your catalog?',
    answer:
      'Yes. Use our Source & Quote tool to search and price non-stock items from our vetted manufacturer network, or submit a custom quote request and our sourcing team will price it for you.',
  },
  {
    section: 'Ordering & MOQ',
    question: 'What if an item shows out of stock?',
    answer:
      'Out-of-stock items stay visible in the catalog with a "Source it" path — we find them through our vetted manufacturer network and come back with a firm price and delivery window instead of leaving you with a dead end.',
  },

  // ── Shipping & freight ────────────────────────────────────────────
  {
    section: 'Shipping & freight',
    question: 'How fast do you ship?',
    answer:
      'Same-day shipping on all orders placed before 2pm EST, Monday\u2013Friday. We ship from our Lithia Springs, Georgia warehouse to all 50 states and territories.',
  },
  {
    section: 'Shipping & freight',
    question: 'How is shipping priced?',
    answer:
      'Shipping is calculated at checkout or quoted on your order based on weight, destination, and service level. Freight options are available for pallet orders \u2014 talk to your rep for a freight quote.',
  },
  {
    section: 'Shipping & freight',
    question: 'Do you drop-ship?',
    answer:
      'Yes. For distributors and pharmacies, we drop-ship to your patient or store with your packing slip and your branding \u2014 blind-shipped, your customers never see us.',
  },

  // ── Billing & terms ───────────────────────────────────────────────
  {
    section: 'Billing & terms',
    question: 'Do you bill net-30?',
    answer:
      'New accounts start with credit card, wire, or ACH. Terms (Net-30 and, for qualifying/government accounts, Net-60) require prior credit approval.',
  },
  {
    section: 'Billing & terms',
    question: 'Do you accept purchase orders?',
    answer:
      'Yes. We accept POs from established accounts and government buyers. New commercial accounts pay by card, wire, or ACH until credit is approved.',
  },

  // ── Returns ───────────────────────────────────────────────────────
  {
    section: 'Returns',
    question: 'What is your return policy?',
    answer:
      'Returns are accepted in two cases: manufacturer defect, and unopened items in original packaging returned within 30 days of the original purchase order. Sterile and single-use items are non-returnable once opened, for patient-safety reasons.',
  },
  {
    section: 'Returns',
    question: 'What if my order arrives damaged or incorrect?',
    answer:
      'Email support@unitemedical.net within 72 hours of delivery with your PO number and photos. We\u2019ll arrange a replacement or credit \u2014 defective items are handled at no cost to you.',
  },

  // ── Compliance ────────────────────────────────────────────────────
  {
    section: 'Compliance',
    question: 'How does PDAC approval work for orthotics?',
    answer:
      'All Unite Medical orthotics and our RegeniCool™ Pro line carry current PDAC approval letters. You can download the letter directly from the product page. Need PDAC consulting for your own products? Visit our PDAC consulting page to book a review.',
  },
  {
    section: 'Compliance',
    question: 'What compliance documentation can you provide?',
    answer:
      'FDA registration (establishment #3015727296), country-of-origin per case, TAA and Berry attestations on flagged SKUs, PDAC determination letters on approved products, and lot-level traceability records. Ask your rep or use the documentation request form on the Compliance page.',
  },

  // ── Integrations & EDI ────────────────────────────────────────────
  {
    section: 'Integrations & EDI',
    question: 'Do you support EDI?',
    answer:
      'Yes. We support EDI transactions (850, 810, 856). Contact us for integration details.',
  },
  {
    section: 'Integrations & EDI',
    question: 'Can you integrate with my storefront or purchasing system?',
    answer:
      'Distributors can integrate our catalog into their own site with drop-ship fulfillment behind it, and manage everything from a dedicated distributor dashboard. For purchasing-system integrations beyond EDI, contact us with your setup and we\u2019ll scope it.',
  },

  // ── Private label ─────────────────────────────────────────────────
  {
    section: 'Private label',
    question: 'Do you offer private labeling?',
    answer:
      'Yes. Diagnostics, PPE, and orthotics can be produced under your brand through our network of vetted domestic and overseas manufacturers, with the QA paperwork to back it up \u2014 packaging, inserts, and branding handled.',
  },
  {
    section: 'Private label',
    question: 'How do I get samples?',
    answer:
      'Use the "Request samples" path on the Private Label & Manufacturing page or contact your rep. We\u2019ll confirm the product line, quantities, and branding details before anything goes to production.',
  },
];

// schema.org FAQPage JSON-LD per spec §4n.
export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}
