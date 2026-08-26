import crypto from 'node:crypto';

const ROW_TABLE = 'service_credentials';
const ROW_ID = 'qbo';
const REFRESH_LEASE_MS = 5 * 60 * 1000;
const ACCESS_SKEW_MS = 2 * 60 * 1000;

function iso(value = new Date()) { return (value instanceof Date ? value : new Date(value)).toISOString(); }
function keyBytes(secret) {
  const value = String(secret || '');
  if (value.length < 32) throw new Error('qbo_token_encryption_key_required');
  return crypto.createHash('sha256').update(value).digest();
}

export function encryptQboSecret(value, encryptionKey) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({ v: 1, iv: iv.toString('base64url'), tag: tag.toString('base64url'), data: ciphertext.toString('base64url') })).toString('base64url');
}

export function decryptQboSecret(sealed, encryptionKey) {
  if (!sealed) return null;
  const payload = JSON.parse(Buffer.from(String(sealed), 'base64url').toString('utf8'));
  if (payload.v !== 1) throw new Error('unsupported_qbo_ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBytes(encryptionKey), Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64url')), decipher.final()]).toString('utf8');
}

export function planQboCredential({ realmId, environment = 'production', tokens, encryptionKey, actorId, now = new Date(), prior = null } = {}) {
  if (!realmId || !tokens?.access_token || !tokens?.refresh_token) throw new Error('complete_qbo_tokens_required');
  const at = iso(now);
  const timestamp = new Date(at).getTime();
  return {
    id: ROW_ID,
    service: 'qbo',
    realm_id: String(realmId),
    environment: environment === 'production' ? 'production' : 'sandbox',
    status: 'active',
    access_token_ciphertext: encryptQboSecret(tokens.access_token, encryptionKey),
    refresh_token_ciphertext: encryptQboSecret(tokens.refresh_token, encryptionKey),
    access_token_expires_at: new Date(timestamp + Number(tokens.expires_in || 3600) * 1000).toISOString(),
    refresh_token_expires_at: new Date(timestamp + Number(tokens.x_refresh_token_expires_in || 8640000) * 1000).toISOString(),
    revision: Number(prior?.revision || 0) + 1,
    refresh_claim_token: null,
    refresh_claimed_at: null,
    connected_by: actorId || prior?.connected_by || null,
    connected_at: prior?.connected_at || at,
    updated_at: at,
    last_error: null,
  };
}

export function planQboRefreshResult(prior, tokens, { encryptionKey, claimToken, now = new Date() } = {}) {
  if (!prior || prior.refresh_claim_token !== claimToken) throw new Error('qbo_refresh_claim_mismatch');
  return planQboCredential({
    realmId: prior.realm_id,
    environment: prior.environment,
    tokens: { ...tokens, refresh_token: tokens.refresh_token || decryptQboSecret(prior.refresh_token_ciphertext, encryptionKey) },
    encryptionKey,
    actorId: prior.connected_by,
    now,
    prior,
  });
}

export function qboAccessTokenUsable(credential, now = new Date()) {
  return credential?.status === 'active'
    && Boolean(credential.access_token_ciphertext)
    && new Date(credential.access_token_expires_at || 0).getTime() > new Date(now).getTime() + ACCESS_SKEW_MS;
}

export function qboRefreshClaimable(credential) {
  return credential?.status === 'active' && !credential.refresh_claim_token && Boolean(credential.refresh_token_ciphertext);
}

export function qboRefreshClaimStale(credential, now = new Date()) {
  return Boolean(credential?.refresh_claim_token)
    && new Date(credential.refresh_claimed_at || 0).getTime() < new Date(now).getTime() - REFRESH_LEASE_MS;
}

export async function readQboCredential(sql) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${ROW_TABLE} AND id=${ROW_ID} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}

export async function saveQboCredential(sql, credential) {
  await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES (${ROW_TABLE},${ROW_ID},${JSON.stringify(credential)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
  return credential;
}

async function setProviderUnknown(sql, credential, reason) {
  const next = {
    ...credential,
    status: 'provider_unknown',
    last_error: String(reason || 'qbo_refresh_outcome_unknown').slice(0, 300),
    updated_at: new Date().toISOString(),
  };
  await sql`UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now()
    WHERE tbl=${ROW_TABLE} AND id=${ROW_ID} AND data->>'refresh_claim_token'=${credential.refresh_claim_token}`;
}

export async function qboAccessContext(sql, { now = new Date() } = {}) {
  const encryptionKey = process.env.QBO_TOKEN_ENCRYPTION_KEY;
  let credential = await readQboCredential(sql);
  if (!credential) throw new Error('qbo_not_connected');
  if (qboAccessTokenUsable(credential, now)) {
    return { accessToken: decryptQboSecret(credential.access_token_ciphertext, encryptionKey), realmId: credential.realm_id, environment: credential.environment };
  }
  if (credential.status === 'provider_unknown') throw new Error('qbo_reauthorization_required');
  if (qboRefreshClaimStale(credential, now)) {
    await setProviderUnknown(sql, credential, 'stale_refresh_claim_requires_reauthorization');
    throw new Error('qbo_reauthorization_required');
  }
  if (!qboRefreshClaimable(credential, now)) throw new Error('qbo_refresh_in_progress');

  const claimToken = crypto.randomBytes(18).toString('hex');
  const claimedAt = iso(now);
  const claimedRows = await sql`UPDATE um_rows SET
      data=data || ${JSON.stringify({ status: 'refreshing', refresh_claim_token: claimToken, refresh_claimed_at: claimedAt, updated_at: claimedAt })}::jsonb,
      updated_at=now()
    WHERE tbl=${ROW_TABLE} AND id=${ROW_ID} AND deleted=false
      AND data->>'status'='active' AND COALESCE(data->>'refresh_claim_token','')=''
      AND COALESCE((data->>'revision')::int,0)=${Number(credential.revision || 0)}
    RETURNING data`;
  if (!claimedRows.length) {
    credential = await readQboCredential(sql);
    if (qboAccessTokenUsable(credential, new Date())) {
      return { accessToken: decryptQboSecret(credential.access_token_ciphertext, encryptionKey), realmId: credential.realm_id, environment: credential.environment };
    }
    throw new Error('qbo_refresh_in_progress');
  }
  credential = claimedRows[0].data;

  let response;
  try {
    const basic = Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64');
    response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptQboSecret(credential.refresh_token_ciphertext, encryptionKey) }),
    });
  } catch (error) {
    await setProviderUnknown(sql, credential, `refresh_network_unknown:${error.message}`);
    throw new Error('qbo_reauthorization_required');
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    const restored = { ...credential, status: 'active', refresh_claim_token: null, refresh_claimed_at: null, last_error: `refresh_rejected:${response.status}:${detail}`, updated_at: new Date().toISOString() };
    await sql`UPDATE um_rows SET data=${JSON.stringify(restored)}::jsonb,updated_at=now()
      WHERE tbl=${ROW_TABLE} AND id=${ROW_ID} AND data->>'refresh_claim_token'=${claimToken}`;
    throw new Error(`qbo_token_refresh_failed:${response.status}`);
  }

  const tokens = await response.json();
  const refreshed = planQboRefreshResult(credential, tokens, { encryptionKey, claimToken, now: new Date() });
  const persisted = await sql`UPDATE um_rows SET data=${JSON.stringify(refreshed)}::jsonb,updated_at=now()
    WHERE tbl=${ROW_TABLE} AND id=${ROW_ID} AND deleted=false AND data->>'refresh_claim_token'=${claimToken}
    RETURNING id`;
  if (!persisted.length) {
    await setProviderUnknown(sql, credential, 'refreshed_token_persistence_unknown').catch(() => {});
    throw new Error('qbo_reauthorization_required');
  }
  return { accessToken: decryptQboSecret(refreshed.access_token_ciphertext, encryptionKey), realmId: refreshed.realm_id, environment: refreshed.environment };
}

export async function markQboDisconnected(sql, { actorId, reason = 'operator_disconnect', now = new Date() } = {}) {
  const current = await readQboCredential(sql);
  if (!current) return null;
  const next = {
    ...current,
    status: 'disconnected',
    access_token_ciphertext: null,
    refresh_token_ciphertext: null,
    refresh_claim_token: null,
    refresh_claimed_at: null,
    disconnected_by: actorId || null,
    disconnected_at: iso(now),
    disconnect_reason: reason,
    revision: Number(current.revision || 0) + 1,
    updated_at: iso(now),
  };
  await saveQboCredential(sql, next);
  return next;
}
