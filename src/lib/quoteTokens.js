function cryptoApi() {
  if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) throw new Error('Web Crypto API required');
  return globalThis.crypto;
}

function base64Url(bytes) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeQuoteId(quoteId) {
  return base64Url(new TextEncoder().encode(String(quoteId)));
}

export function generateQuoteAcceptanceToken(quoteId, revision = 1) {
  const random = new Uint8Array(32);
  cryptoApi().getRandomValues(random);
  return `${encodeQuoteId(quoteId)}.${Number(revision || 1)}.${base64Url(random)}`;
}

export function parseQuoteAcceptanceToken(token) {
  try {
    const [encodedId, revisionText, secret, extra] = String(token || '').split('.');
    if (!encodedId || !secret || extra || !/^\d+$/.test(revisionText) || secret.length < 40) return null;
    const padded = encodedId.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encodedId.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const quoteId = new TextDecoder().decode(bytes);
    if (!quoteId) return null;
    return { quote_id: quoteId, revision: Number(revisionText), secret };
  } catch {
    return null;
  }
}

export async function hashQuoteAcceptanceToken(token, quoteId, revision = 1) {
  const input = new TextEncoder().encode(`${quoteId}:${Number(revision || 1)}:${token}`);
  const digest = new Uint8Array(await cryptoApi().subtle.digest('SHA-256', input));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createQuoteAcceptanceToken(quoteId, revision = 1) {
  const token = generateQuoteAcceptanceToken(quoteId, revision);
  return {
    token,
    token_hash: await hashQuoteAcceptanceToken(token, quoteId, revision),
    token_revision: Number(revision || 1),
  };
}
