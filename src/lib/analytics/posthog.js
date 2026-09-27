import posthog from 'posthog-js';
import { createUniteAnalytics } from './posthog-core.js';

const env = import.meta.env ?? {};
const analytics = createUniteAnalytics(posthog, {
  token: env.VITE_UNITE_POSTHOG_KEY,
  host: env.VITE_UNITE_POSTHOG_HOST,
  enabled: env.VITE_UNITE_ANALYTICS_ENABLED,
  production: env.PROD,
}, () => typeof window === 'undefined' ? null : window.location);

export const captureUniteEvent = analytics.capture;
export const captureUnitePage = analytics.page;
