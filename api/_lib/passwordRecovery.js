import {authOrigin} from './authSecurity.js';
import crypto from 'node:crypto';

export const RECOVERY_TTL_MS = 30 * 60 * 1000;
export const recoveryDigest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export const validRecoveryToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
export const validNewPassword = password => typeof password === 'string' && Array.from(password).length >= 15 && Array.from(password).length <= 256 && password.trim().length > 0;
export const recoveryOrigin=(_req,env=process.env)=>authOrigin(env);
export async function ensureRecoverySchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS um_password_resets (token_hash text PRIMARY KEY, user_id text NOT NULL, revision integer NOT NULL, email text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE um_password_resets ADD COLUMN IF NOT EXISTS email text`;
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
export async function redeemRecovery(sql, token, passwordRecord, {notice=null}={}) {
  const auditId=crypto.randomUUID();
  return sql`WITH consumed AS (
    DELETE FROM um_password_resets WHERE token_hash=${recoveryDigest(token)} AND expires_at>now() RETURNING user_id,revision,email
  ), changed AS (
    UPDATE um_rows p SET data=(p.data-'password') || ${JSON.stringify(passwordRecord)}::jsonb || jsonb_build_object('session_revision',COALESCE((p.data->>'session_revision')::int,0)+1,'password_changed_at',now()),updated_at=now()
    FROM consumed r WHERE p.tbl='profiles' AND p.id=r.user_id AND p.deleted=false AND p.data->>'status'='active' AND COALESCE((p.data->>'session_revision')::int,0)=r.revision AND lower(p.data->>'email')=r.email RETURNING p.id,p.data
  ), audited AS (
    INSERT INTO um_rows(tbl,id,data) SELECT 'audit_log',${auditId},jsonb_build_object('id',${auditId}::text,'kind','auth.password_changed','actor_id',id,'ref_id',id,'created_at',now()) FROM changed RETURNING id
  ), notified AS (
    INSERT INTO um_auth_mail(id,user_id,kind,revision,payload,expires_at) SELECT ${notice?.id||auditId},id,'password_changed',COALESCE((data->>'session_revision')::int,0),${notice?.payload||''},${notice?.expires_at||new Date().toISOString()}::timestamptz FROM changed WHERE ${Boolean(notice)} ON CONFLICT(id) DO NOTHING RETURNING id
  ) SELECT id FROM changed`;
}
