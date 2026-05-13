// Approved FAQ copy per Unite_CTO_Site_Document.md §4n.
// Consumed by /support and the FAQPage JSON-LD emitted from the same page.
export const FAQS = [
  {
    question: 'Do you have minimum order quantities?',
    answer:
      'No minimum order quantities on stocked items. Every SKU in our catalog can be ordered in single units. Volume pricing is available at tier breaks but never as a hard floor.',
  },
  {
    question: 'How fast do you ship?',
    answer:
      'Same-day shipping on all orders placed before 2pm EST, Monday\u2013Friday. We ship from two US warehouses in Georgia and Nevada to all 50 states and territories.',
  },
  {
    question: 'Do you bill net-30?',
    answer:
      'Net-30 is available for approved accounts. New accounts start with credit card at checkout. Net-60 is available on request for government and public entities.',
  },
  {
    question: 'Can I get a quote on something not in your catalog?',
    answer:
      'Yes. Use our Source & Quote tool to search and price non-stock items from our vetted manufacturer network, or submit a custom quote request and our sourcing team will price it for you.',
  },
  {
    question: 'Do you support EDI?',
    answer:
      'Yes. We support EDI transactions (850, 810, 856). Contact us for integration details.',
  },
  {
    question: 'How does PDAC approval work for orthotics?',
    answer:
      'All Unite Medical orthotics and our RegeniCool Pro line carry current PDAC approval letters. You can download the letter directly from the product page. Need PDAC consulting for your own products? Visit our PDAC consulting page to book a review.',
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
