const GOOD = ['paid', 'fulfilled', 'complete', 'active', 'subscribed', 'verified'];
const WARN = ['payment_review_needed', 'unfulfilled', 'partially_paid', 'partial', 'partially_fulfilled', 'needs_review', 'held', 'missing'];

export const statusTone = (value) => (GOOD.includes(value) ? 'good' : WARN.includes(value) ? 'warn' : '');
