import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureUnitePage } from '../lib/analytics/posthog.js';

export function PostHogPageTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => { captureUnitePage(); }, [pathname, search]);
  return null;
}
