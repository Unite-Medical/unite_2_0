import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureUnitePage } from '../lib/analytics/index.js';

export function AnalyticsPageTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => { captureUnitePage(); }, [pathname, search]);
  return null;
}
