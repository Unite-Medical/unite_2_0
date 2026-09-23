import crypto from 'node:crypto';
import { hashStoredPassword } from './auth.js';
import { safeEqual } from './http.js';

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
export function hashActivationToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
export function planActivationIssue(profile, { token = crypto.randomBytes(32).toString('base64url'), now = new Date() } = {}) {
  if (!profile?.id || profile.status !== 'pending_activation' || !profile.activation_required) return { ok:false, reason:'profile_not_pending_activation' };
  if (!profile.email) return { ok:false, reason:'activation_email_missing' };
  const at = (now instanceof Date ? now : new Date(now));
  const tokenHash = hashActivationToken(token);
  return {
    ok:true,
    token,
    record:{
      id:`activation_${crypto.createHash('sha256').update(`${profile.id}:${tokenHash}`).digest('hex').slice(0,24)}`,
      profile_id:profile.id, org_id:profile.org_id, email:profile.email,
      token_hash:tokenHash, profile_revision:Number(profile.session_revision || 0),
      expires_at:new Date(at.getTime()+TOKEN_TTL_MS).toISOString(), consumed_at:null,
      created_at:at.toISOString(), status:'issued',
    },
  };
}
export function planActivationRedemption({ profile, tokenRecord, token, password, now = new Date() } = {}) {
  if (!profile?.id || profile.status !== 'pending_activation' || !profile.activation_required) return { ok:false, reason:'profile_not_pending_activation' };
  if (!tokenRecord || tokenRecord.profile_id !== profile.id) return { ok:false, reason:'activation_token_not_found' };
  if (tokenRecord.consumed_at) return { ok:false, reason:'activation_token_used' };
  if (Number(tokenRecord.profile_revision || 0) !== Number(profile.session_revision || 0)) return { ok:false, reason:'profile_changed' };
  const at = now instanceof Date ? now : new Date(now);
  if (!tokenRecord.expires_at || Date.parse(tokenRecord.expires_at) <= at.getTime()) return { ok:false, reason:'activation_token_expired' };
  const tokenHash = hashActivationToken(token);
  if (!safeEqual(tokenHash, tokenRecord.token_hash || '')) return { ok:false, reason:'activation_token_invalid' };
  let passwordRecord;
  try { passwordRecord = hashStoredPassword(password); } catch { return { ok:false, reason:'password_too_short' }; }
  return {
    ok:true,
    profile:{
      ...profile, ...passwordRecord, status:'active', activation_required:false,
      activated_at:at.toISOString(), session_revision:Number(profile.session_revision || 0)+1,
    },
    membership_status:'active',
    token:{ ...tokenRecord, status:'consumed', consumed_at:at.toISOString() },
  };
}
