import { captureUniteEvent as posthogEvent, captureUnitePage as posthogPage } from './posthog.js';
import { createGoogleAnalytics, createGoogleTransport } from './ga4-core.js';

const env = import.meta.env ?? {};
const google = typeof window === 'undefined' ? null : createGoogleAnalytics(
  createGoogleTransport(window, env.VITE_UNITE_GA4_ID),
  { measurementId: env.VITE_UNITE_GA4_ID, enabled: env.VITE_UNITE_GA4_ENABLED, production: env.PROD },
  () => window.location,
  () => document.referrer,
);

export function captureUniteEvent(event, properties) {
  posthogEvent(event, properties);
  google?.capture(event, properties);
}
export function captureUnitePage() {
  posthogPage();
  google?.page();
}
