// Approved public facts from Damon's September 22, 2026 handoff. No rates,
// contract dates, executed documents, or roster data belong in this module.
export const WELL_CONTRACT = 'CC-NS-0052';
export const WELL_PUBLIC_PRODUCTS = [
  ['1', '21IN-0103000012', 3200],
  ['3', '21IN-0303000002', 2400],
  ['5', '21IN-0503000010', 1600],
  ['10', '21IN-1003000008', 1200],
  ['20', '21IN-2003000002', 600],
  ['50/60', '21IN-5023000001', 240],
].map(([size, base, eachPerCase]) => ({ size, sku: `${base}-C`, sampleSku: `${base}-B`, eachPerCase }));
export const WELL_REQUEST_STATES = {
  requested: 'Request received',
  verifying: 'We are verifying your facility',
  cpf_pending: 'Participation form pending',
  review_required: 'Additional review needed',
  suspended: 'Please contact our team',
};
