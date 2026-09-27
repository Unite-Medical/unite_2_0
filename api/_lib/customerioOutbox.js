import crypto from 'node:crypto';
import { sendCustomerIoTransactional } from './customerio.js';

function stableId(value) {
  return `cio_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}
function iso(value) { return (value instanceof Date ? value : new Date(value)).toISOString(); }

export function buildCustomerIoOutbox({
  idempotency_key, to, transactional_message_id, subject, body,
  from = 'support@unitemedical.net', message_data = {}, ref_type = null, ref_id = null,
  now = new Date(),
} = {}) {
  const key = String(idempotency_key || '').trim();
  if (!key) throw new Error('customerio_idempotency_key_required');
  if (!String(to || '').trim()) throw new Error('customerio_recipient_required');
  const createdAt = iso(now);
  const id = stableId(key);
  return {
    id, idempotency_key: key, to_address: String(to).trim().toLowerCase(), from_address: from,
    transactional_message_id, subject, body,
    message_data: { ...message_data, unite_outbox_id: id }, ref_type, ref_id,
    status: 'queued', attempts: 0, provider_message_id: null, last_error: null,
    next_retry_at: createdAt, claimed_at: null, claim_token: null,
    created_at: createdAt, updated_at: createdAt,
  };
}

export function nextCustomerIoOutboxState(row, result, { now = new Date(), maxAttempts = 8 } = {}) {
  const at = iso(now);
  const attempts = Number(row.attempts || 0) + 1;
  if (result?.ok) {
    return {
      ...row, status: 'sent', attempts, provider: 'customerio',
      provider_message_id: result.provider_message_id || null,
      customerio_message_id: result.provider_message_id || null,
      last_error: null, next_retry_at: null, sent_at: at, last_attempt_at: at,
      claimed_at: null, claim_token: null, updated_at: at,
    };
  }
  const unknown = result?.reason === 'customerio_unreachable' || result?.unknown_outcome === true;
  const terminal = !unknown && attempts >= maxAttempts;
  const backoffMs = Math.min(6 * 60 * 60 * 1000, 30_000 * (2 ** Math.max(0, attempts - 1)));
  return {
    ...row,
    status: unknown ? 'provider_unknown' : terminal ? 'dead_letter' : 'retry',
    attempts, last_error: result?.reason || 'customerio_send_failed',
    next_retry_at: unknown || terminal ? null : new Date(new Date(now).getTime() + backoffMs).toISOString(),
    last_attempt_at: at, dead_lettered_at: terminal ? at : null,
    claimed_at: null, claim_token: null, updated_at: at,
  };
}

export function nextStaleCustomerIoClaimState(row, { now = new Date() } = {}) {
  const at = iso(now);
  if (row?.status !== 'in_flight') return row;
  return {
    ...row,
    status: 'provider_unknown',
    last_error: 'stale_claim_requires_reconciliation',
    next_retry_at: null,
    claimed_at: null,
    claim_token: null,
    reconciliation_required_at: at,
    updated_at: at,
  };
}

export function recoverCustomerIoOutbox(row, {
  action, actor_id, reason, evidence, provider_message_id = null, now = new Date(),
} = {}) {
  if (!['provider_unknown', 'dead_letter'].includes(row?.status)) throw new Error('customerio_recovery_terminal_state_required');
  if (!String(actor_id || '').trim()) throw new Error('customerio_recovery_actor_required');
  if (!String(reason || '').trim()) throw new Error('customerio_recovery_reason_required');
  if (!String(evidence || '').trim()) throw new Error('customerio_recovery_evidence_required');
  if (!['retry', 'mark_sent'].includes(action)) throw new Error('customerio_recovery_action_invalid');
  if (action === 'mark_sent' && !String(provider_message_id || '').trim()) throw new Error('customerio_provider_message_id_required');
  const at = iso(now);
  const recovery = {
    action, actor_id: String(actor_id), reason: String(reason), evidence: String(evidence), at,
    from_status: row.status,
  };
  if (action === 'mark_sent') {
    return {
      ...row, status: 'sent', provider: 'customerio', provider_message_id,
      customerio_message_id: provider_message_id, sent_at: at, last_error: null,
      next_retry_at: null, claimed_at: null, claim_token: null, recovery, updated_at: at,
    };
  }
  return {
    ...row, status: 'queued', last_error: null, next_retry_at: at,
    claimed_at: null, claim_token: null, dead_lettered_at: null, recovery, updated_at: at,
  };
}

export async function upsertCustomerIoOutbox(sql, row) {
  const rows = await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES ('customerio_outbox',${row.id},${JSON.stringify(row)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET deleted=false,updated_at=now()
    RETURNING data`;
  const persisted = rows[0]?.data;
  if (!persisted || persisted.idempotency_key !== row.idempotency_key) throw new Error('customerio_idempotency_conflict');
  return persisted;
}

export async function claimCustomerIoOutbox(sql, id, { now = new Date() } = {}) {
  const claimedAt = iso(now);
  const claimToken = crypto.randomBytes(16).toString('hex');
  const rows = await sql`UPDATE um_rows SET data=data || ${JSON.stringify({
    status: 'in_flight', claimed_at: claimedAt, claim_token: claimToken, updated_at: claimedAt,
  })}::jsonb,updated_at=now()
    WHERE tbl='customerio_outbox' AND id=${id} AND deleted=false
      AND data->>'status' IN ('queued','retry')
      AND COALESCE((data->>'next_retry_at')::timestamptz,now())<=now()
    RETURNING data`;
  return rows[0]?.data || null;
}

export async function deliverCustomerIoOutbox(sql, row, { claimed = false } = {}) {
  const persisted = await upsertCustomerIoOutbox(sql, row);
  if (['sent', 'dead_letter', 'provider_unknown'].includes(persisted.status)) return persisted;
  let current = persisted;
  if (!claimed) {
    current = await claimCustomerIoOutbox(sql, persisted.id);
    if (!current) {
      const latest = await sql`SELECT data FROM um_rows WHERE tbl='customerio_outbox' AND id=${persisted.id} AND deleted=false LIMIT 1`;
      return latest[0]?.data || persisted;
    }
  } else if (current.status !== 'in_flight' || !current.claim_token) {
    return current;
  }
  const claimToken = current.claim_token;
  const result = await sendCustomerIoTransactional({
    to: current.to_address, from: current.from_address,
    transactional_message_id: current.transactional_message_id,
    subject: current.subject, body: current.body, message_data: current.message_data,
    idempotency_key: current.id,
  });
  const next = nextCustomerIoOutboxState(current, result);
  const updated = await sql`UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now()
    WHERE tbl='customerio_outbox' AND id=${current.id} AND deleted=false
      AND data->>'status'='in_flight' AND data->>'claim_token'=${claimToken}
    RETURNING data`;
  if (updated.length) return updated[0].data;
  const latest = await sql`SELECT data FROM um_rows WHERE tbl='customerio_outbox' AND id=${current.id} AND deleted=false LIMIT 1`;
  return latest[0]?.data || { ...next, status: 'provider_unknown', last_error: 'claim_lost_after_provider_call' };
}

export async function queueCustomerIoTransactional(sql, args) {
  const outbox = buildCustomerIoOutbox(args);
  const result = await deliverCustomerIoOutbox(sql, outbox);
  return {
    ok: result.status === 'sent',
    queued: ['queued', 'retry', 'in_flight'].includes(result.status),
    status: result.status, reason: result.last_error || null,
    provider: result.provider || 'customerio', provider_message_id: result.provider_message_id || null,
    outbox_id: result.id,
  };
}
