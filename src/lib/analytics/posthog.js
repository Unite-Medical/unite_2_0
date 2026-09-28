import { enabledFor } from './posthog-core.js';
const env = import.meta.env ?? {};
const config = { token: env.VITE_UNITE_POSTHOG_KEY, host: env.VITE_UNITE_POSTHOG_HOST, enabled: env.VITE_UNITE_ANALYTICS_ENABLED, production: env.PROD };
let analytics;
function dispatch(method, ...args) {
  if (typeof window === 'undefined' || !enabledFor(config, window.location)) return;
  const path = window.location.pathname;
  analytics ||= Promise.all([import('posthog-js'), import('./posthog-core.js')]).then(([{default:client},{createUniteAnalytics}]) => createUniteAnalytics(client,config,()=>window.location));
  analytics.then(instance => {
    // Do not attribute an event to a different page while the SDK was loading.
    if (window.location.pathname === path) instance[method](...args);
  }).catch(() => { analytics = null; });
}
export const captureUniteEvent = (...args) => dispatch('capture', ...args);
export const captureUnitePage = () => dispatch('page');
