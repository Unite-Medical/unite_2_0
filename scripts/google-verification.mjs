/** Server-render the optional URL-prefix verification tag; no browser SDK needed. */
export function googleVerification(token) {
  if (token && !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('GOOGLE_SITE_VERIFICATION must contain only the verification token, not the full HTML tag.');
  return {
    name: 'google-site-verification',
    transformIndexHtml() {
      return token ? [{ tag: 'meta', attrs: { name: 'google-site-verification', content: token }, injectTo: 'head' }] : [];
    },
  };
}
