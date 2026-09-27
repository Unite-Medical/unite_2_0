function cryptoApi() {
  const api = globalThis.crypto;
  if (!api?.getRandomValues || !api?.subtle) throw new Error('secure_crypto_unavailable');
  return api;
}

export function createVendorReviewToken() {
  const bytes = cryptoApi().getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function hashVendorReviewToken(token, poId, revision = 1) {
  const input = new TextEncoder().encode(`${poId}:${revision}:${token}`);
  const digest = new Uint8Array(await cryptoApi().subtle.digest('SHA-256', input));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyVendorReviewToken(po, token) {
  if (!po?.vendor_review_token_hash || !token) return false;
  const revision = Number(po.vendor_review_revision || po.revision || 1);
  if (Number(po.revision || 1) !== revision) return false;
  return (await hashVendorReviewToken(token, po.id, revision)) === po.vendor_review_token_hash;
}
