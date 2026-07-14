/**
 * Public savings metric — PRD-28 §Robotics live counter.
 *
 *   GET /api/metrics/savings
 *
 * Serves the latest snapshot pushed by Restore (api/hooks/restore.js)
 * from our own Postgres, with CDN caching (s-maxage + SWR) so site
 * traffic hits Vercel's edge cache — not our function, and never
 * Restore's servers. Returns { ok:false } when no snapshot exists yet;
 * the page then falls back to the static "$900K+ to date" figure.
 */

import { neon } from '@neondatabase/serverless';
import { sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });

  // Edge-cache for 5 minutes; serve stale for a day while revalidating.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');

  const url = process.env.DATABASE_URL;
  if (!url) return sendJson(res, 200, { ok: false, reason: 'no_database' });

  try {
    const sql = neon(url);
    const rows = await sql`SELECT data, updated_at FROM um_metrics WHERE key = 'restore_savings'`;
    if (!rows.length) return sendJson(res, 200, { ok: false, reason: 'no_snapshot' });
    return sendJson(res, 200, { ok: true, ...rows[0].data, updated_at: rows[0].updated_at });
  } catch {
    // Table may not exist until the first push arrives.
    return sendJson(res, 200, { ok: false, reason: 'no_snapshot' });
  }
}
