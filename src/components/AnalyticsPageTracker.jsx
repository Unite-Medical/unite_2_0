import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { captureUnitePage } from '../lib/analytics/index.js';
import { beforeVercelSend } from '../lib/analytics/vercel.js';

export function AnalyticsPageTracker() {
  const { pathname, search } = useLocation();
  useEffect(() => { captureUnitePage(); }, [pathname, search]);
  return import.meta.env.PROD ? <Analytics beforeSend={beforeVercelSend} /> : null;
}
