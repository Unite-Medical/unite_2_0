import crypto from 'node:crypto';

export const RECOVERY_TTL_MS = 30 * 60 * 1000;
export const recoveryDigest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export const validRecoveryToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
export const validNewPassword = password => typeof password === 'string' && password.length >= 12 && password.length <= 256;
export function recoveryOrigin(req) {
  const host = String(req.headers?.host || '').toLowerCase();
  return host === 'staging.unitemedical.net' ? 'https://staging.unitemedical.net' : 'https://unitemedical.net';
}
export async function ensureRecoverySchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS um_password_resets (token_hash text PRIMARY KEY, user_id text NOT NULL, revision integer NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS um_password_reset_limits (key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL)`;
}
export async function reserveRecoveryAttempt(sql, key, limit) {
  const rows = await sql`INSERT INTO um_password_reset_limits(key,attempts,window_start) VALUES (${key},1,now())
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN um_password_reset_limits.window_start < now()-interval '1 hour' THEN 1 ELSE um_password_reset_limits.attempts+1 END,
    window_start=CASE WHEN um_password_reset_limits.window_start < now()-interval '1 hour' THEN now() ELSE um_password_reset_limits.window_start END
    RETURNING attempts`;
  return rows[0].attempts <= limit;
}
// One SQL statement: concurrent submissions cannot consume a link twice. A password
// change or account revocation invalidates every outstanding link and session.
export async function redeemRecovery(sql, token, passwordRecord) {
  return sql`WITH consumed AS (
    DELETE FROM um_password_resets r WHERE token_hash=${recoveryDigest(token)} AND expires_at>now()
    RETURNING user_id,revision
  ) UPDATE um_rows p SET data=(p.data-'password') || ${JSON.stringify(passwordRecord)}::jsonb || jsonb_build_object('session_revision',COALESCE((p.data->>'session_revision')::int,0)+1,'password_changed_at',now()),updated_at=now()
    FROM consumed r WHERE p.tbl='profiles' AND p.id=r.user_id AND p.deleted=false AND p.data->>'status'='active'
      AND COALESCE((p.data->>'session_revision')::int,0)=r.revision RETURNING p.id`;
}
