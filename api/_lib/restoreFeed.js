import { restoreHttp2Response } from './restoreHttp2.js';

const RESTORE_FEED_URL = 'https://restorerobotics.net/unite-savings.json';

export function parseRestoreFeed(body, checkedAt = new Date()) {
  const amount = body?.savings;
  // Accept only the documented dollar format, including correctly grouped commas.
  if (typeof amount !== 'string' || !/^\$(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)\.\d{2}$/.test(amount)) {
    throw new Error('invalid_restore_amount');
  }
  const cents = Number(amount.replace(/[$,.]/g, ''));
  if (!Number.isSafeInteger(cents)) throw new Error('invalid_restore_amount');
  return { total_savings_usd: cents / 100, checked_at: checkedAt.toISOString() };
}

export async function fetchRestoreFeed(token, fetcher = restoreHttp2Response) {
  const response = await fetcher(RESTORE_FEED_URL, {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Mozilla' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`restore_feed_http_${response.status}`);
  return parseRestoreFeed(await response.json());
}

export async function ensureRestoreSavingsSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS um_metrics (
    key TEXT PRIMARY KEY, data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
}

export async function storeRestoreSavings(sql, snapshot) {
  await sql.transaction([
    sql`INSERT INTO um_metrics (key, data, updated_at)
      VALUES ('restore_savings', ${JSON.stringify(snapshot)}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    sql`INSERT INTO um_metrics (key, data, updated_at)
      VALUES ('restore_savings_refresh', jsonb_build_object('successful_day', ${snapshot.checked_at.slice(0, 10)}::text), now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
  ]);
}

export async function refreshRestoreSavings(sql, token, fetcher = restoreHttp2Response) {
  await ensureRestoreSavingsSchema(sql);
  // A persisted lease prevents overlapping jobs and limits failure retries to 15 minutes.
  // Once successful, skip subsequent invocations on the same UTC calendar day.
  const claimed = await sql`
    INSERT INTO um_metrics (key, data, updated_at)
    VALUES ('restore_savings_refresh', '{}'::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET updated_at = now()
    WHERE um_metrics.updated_at <= now() - interval '15 minutes'
      AND COALESCE(um_metrics.data->>'successful_day', '') < to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    RETURNING key`;
  if (!claimed.length) return { ok: true, updated: false, reason: 'already_refreshed_or_recent_attempt' };

  // Fetch and validate before replacing anything: failures leave the last good value intact.
  const snapshot = await fetchRestoreFeed(token, fetcher);
  await storeRestoreSavings(sql, snapshot);
  return { ok: true, updated: true, ...snapshot };
}
