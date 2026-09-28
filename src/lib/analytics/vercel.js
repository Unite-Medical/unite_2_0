import { isPublicPath } from './posthog-core.js';

// Public site totals only; authentication tokens and customer workspaces stay out.
export function beforeVercelSend(event) {
  try {
    const url = new URL(event.url);
    if (!isPublicPath(url.pathname) && url.pathname !== '/welllink') return null;
    return { ...event, url: url.origin + url.pathname };
  } catch {
    return null;
  }
}
