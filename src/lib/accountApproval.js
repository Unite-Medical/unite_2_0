// Quick Account Approval helper — implements the confidence-scoring logic
// from Unite_CTO_Site_Document.md §6.2. Pure JS so it can be reused from the
// signup form, an admin review tool, or a serverless handler.
//
// Heuristics intentionally simple: commercial address, real website, and
// matching email domain each add one point. >=2 auto-approves; <2 routes to
// manual review (one-click email).

const RESIDENTIAL_PATTERNS = [
  /\bapt\b/i,
  /\bapartment\b/i,
  /\bunit\s*\d+/i,
  /\bp\.?o\.?\s*box\b/i,
  /\bbox\s*\d+/i,
];

// Conservative free-mail / personal-mail blocklist — we treat these as
// "doesn't match the business website" even when no website is provided.
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
  'live.com',
  'me.com',
  'msn.com',
]);

/** Heuristic: a commercial-looking street address. */
export function isCommercialAddress(address) {
  if (!address || typeof address !== 'string') return false;
  const a = address.trim();
  if (!a) return false;
  if (RESIDENTIAL_PATTERNS.some((rx) => rx.test(a))) return false;
  // Must include at least a number and a street/road keyword.
  return /\d/.test(a) && /\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|hwy|pkwy|parkway|ct|court|pl|place|sq|square|circle)\b/i.test(a);
}

/** Returns true if `website` looks like an actual URL we can dial. */
export function websiteExists(website) {
  if (!website || typeof website !== 'string') return false;
  try {
    const u = new URL(website.startsWith('http') ? website : `https://${website}`);
    return Boolean(u.hostname && u.hostname.includes('.'));
  } catch {
    return false;
  }
}

/** True when the email's host matches the website's host (effective domain). */
export function emailDomainMatchesWebsite(email, website) {
  if (!email || !website) return false;
  const match = /@([^\s@]+)$/.exec(email.toLowerCase());
  if (!match) return false;
  const emailHost = match[1];
  if (PERSONAL_EMAIL_DOMAINS.has(emailHost)) return false;
  let webHost;
  try {
    webHost = new URL(website.startsWith('http') ? website : `https://${website}`)
      .hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!webHost) return false;
  const stripWww = (h) => h.replace(/^www\./, '');
  return stripWww(emailHost).endsWith(stripWww(webHost))
    || stripWww(webHost).endsWith(stripWww(emailHost));
}

/**
 * Per spec §6.2: tally three confidence signals; >=2 auto-approves.
 * Returns `{ decision, score, reasons }` for downstream UI/email rendering.
 *
 * @param {{ address?: string, website?: string, email?: string }} application
 */
export function evaluateAccount(application = {}) {
  const reasons = [];
  let score = 0;
  if (isCommercialAddress(application.address)) {
    score += 1;
    reasons.push('commercial address');
  }
  if (websiteExists(application.website)) {
    score += 1;
    reasons.push('website looks valid');
  }
  if (
    application.website
    && application.email
    && emailDomainMatchesWebsite(application.email, application.website)
  ) {
    score += 1;
    reasons.push('email domain matches website');
  }
  const decision = score >= 2 ? 'AUTO_APPROVE' : 'MANUAL_REVIEW';
  return { decision, score, reasons };
}
