import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { Resend } from 'resend';
import { readRawBody, sendJson } from '../_lib/http.js';
import { clearSessionCookie, hashStoredPassword } from '../_lib/auth.js';
import { RECOVERY_TTL_MS, recoveryDigest, validRecoveryToken, validNewPassword, recoveryOrigin, ensureRecoverySchema, reserveRecoveryAttempt, redeemRecovery } from '../_lib/passwordRecovery.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store, private');
  if (req.method !== 'POST') return sendJson(res,405,{error:'method_not_allowed'});
  if (!process.env.DATABASE_URL) return sendJson(res,503,{error:'recovery_unavailable'});
  try {
    const body = JSON.parse((await readRawBody(req)).toString('utf8'));
    const sql = neon(process.env.DATABASE_URL);
    await ensureRecoverySchema(sql);
    const ip = String(req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    if (!await reserveRecoveryAttempt(sql, `ip:${recoveryDigest(ip)}`, 20)) return sendJson(res,429,{error:'too_many_attempts_try_later'});
    if (body.action === 'complete') {
      if (!validRecoveryToken(body.token)) return sendJson(res,400,{error:'reset_link_expired_or_used'});
      if (!validNewPassword(body.password)) return sendJson(res,400,{error:'use_12_to_256_characters'});
      const changed = await redeemRecovery(sql, body.token, hashStoredPassword(body.password));
      if (!changed.length) return sendJson(res,400,{error:'reset_link_expired_or_used'});
      clearSessionCookie(res);
      return sendJson(res,200,{ok:true});
    }
    if (body.action !== 'request') return sendJson(res,400,{error:'invalid_request'});
    if (!process.env.RESEND_API_KEY) return sendJson(res,503,{error:'recovery_email_unavailable'});
    const email = String(body.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res,400,{error:'enter_a_valid_email'});
    const generic = {ok:true,message:'If an active account matches, a reset link is on its way. Check your inbox and spam folder.'};
    if (!await reserveRecoveryAttempt(sql, `email:${recoveryDigest(email)}`, 3)) return sendJson(res,200,generic);
    const rows = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND deleted=false AND data->>'status'='active' AND lower(data->>'email')=${email} LIMIT 1`;
    const profile = rows[0]?.data;
    if (!profile) return sendJson(res,200,generic);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = recoveryDigest(token);
    await sql`INSERT INTO um_password_resets(token_hash,user_id,revision,expires_at) VALUES (${tokenHash},${profile.id},${Number(profile.session_revision||0)},${new Date(Date.now()+RECOVERY_TTL_MS).toISOString()})`;
    const link = `${recoveryOrigin(req)}/login?reset=1#token=${token}`;
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.UNITE_INQUIRY_FROM || 'Unite Medical <support@unitemedical.net>', to: email,
      subject:'Reset your Unite Medical password',
      text:`Use this link to choose a new password for Unite Medical:\n\n${link}\n\nThis link expires in 30 minutes and works once. If you did not request this, you can ignore this email.`,
    },{idempotencyKey:`password-reset-${tokenHash}`});
    if (result.error) {
      await sql`DELETE FROM um_password_resets WHERE token_hash=${tokenHash}`;
      // Do not reveal account existence through provider-specific responses.
      console.error('password_reset_email_rejected',result.error.name);
    }
    return sendJson(res,200,generic);
  } catch { return sendJson(res,503,{error:'recovery_unavailable_try_again'}); }
}
