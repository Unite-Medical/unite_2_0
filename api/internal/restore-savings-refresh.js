import { neon } from '@neondatabase/serverless';
import { safeEqual, sendJson } from '../_lib/http.js';
import { refreshRestoreSavings } from '../_lib/restoreFeed.js';

export function createRestoreRefreshHandler({ environment = process.env, connect = neon, refresh = refreshRestoreSavings } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!environment.CRON_SECRET || !safeEqual(req.headers.authorization || '', `Bearer ${environment.CRON_SECRET}`)) {
      return sendJson(res, 401, { error: 'unauthorized' });
    }
    if (!environment.DATABASE_URL || !environment.RESTORE_API_TOKEN) {
      return sendJson(res, 503, { error: 'restore_feed_not_configured' });
    }
    try {
      return sendJson(res, 200, await refresh(connect(environment.DATABASE_URL), environment.RESTORE_API_TOKEN));
    } catch (error) {
      // Only bounded error categories/codes are logged, never raw errors or response bodies.
      const reason = /^(restore_feed_(http_\d{3}|timeout|network_error|oversized|invalid_json)|invalid_restore_amount)$/.test(error.message)
        ? error.message : error.name === 'NeonDbError' ? 'restore_database_error'
          : error.name === 'TimeoutError' ? 'restore_feed_timeout' : 'restore_refresh_failed';
      const databaseCode = /^[A-Z0-9]{5}$/.test(error.code || '') ? error.code : undefined;
      console.error('restore_savings_refresh_failed', { reason, databaseCode });
      return sendJson(res, 502, { error: reason, previous_snapshot_preserved: true });
    }
  };
}

export default createRestoreRefreshHandler();
