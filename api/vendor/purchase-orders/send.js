import {orderApprovalGate} from '../../_lib/orderApproval.js';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../../_lib/auth.js';
import { sendCustomerIoTransactional } from '../../_lib/customerio.js';
import { readRawBody, sendJson } from '../../_lib/http.js';
import { hashVendorReviewToken } from './review.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function tokenKey() {
  const secret = process.env.VENDOR_PO_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) throw new Error('vendor_po_token_secret_required');
  return crypto.createHash('sha256').update(secret).digest();
}
function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decryptToken(value) {
  const [iv, tag, encrypted] = String(value || '').split('.');
  if (!iv || !tag || !encrypted) throw new Error('invalid_retry_token');
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
}
async function getRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${id} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}
async function linkedOrderApproval(sql,po){
 let orderId=po?.order_id;
 if(!orderId&&po?.sourcing_request_id){const request=await getRow(sql,'sourcing_requests',po.sourcing_request_id);orderId=request?.order_id;if(!orderId&&request?.quote_id){const quote=await getRow(sql,'quotes',request.quote_id);orderId=quote?.accepted_order_id;}}
 return orderId?orderApprovalGate(await getRow(sql,'orders',orderId)):{ok:true};
}
export function validateVendorPurchaseOrderDelivery(po, outbox) {
  if (!po) return { ok: false, reason: 'purchase_order_not_found' };
  if (po.status !== 'sent') return { ok: false, reason: 'purchase_order_not_sent' };
  if (Number(po.revision || 1) !== Number(outbox.po_revision || 0)) return { ok: false, reason: 'purchase_order_revision_changed' };
  if (!outbox.vendor_review_token_hash || po.vendor_review_token_hash !== outbox.vendor_review_token_hash) {
    return { ok: false, reason: 'vendor_review_token_changed' };
  }
  if (po.vendor_response && po.vendor_response !== 'pending') return { ok: false, reason: 'vendor_response_final' };
  return { ok: true };
}
export function isVendorPurchaseOrderOutboxClaimable(outbox) {
  return ['queued', 'retry'].includes(String(outbox?.status || ''));
}
export function buildVendorPurchaseOrderReviewLink({ poId, token, origin } = {}) {
  const base = new URL(String(origin || ''));
  if (base.protocol !== 'https:') throw new Error('https_origin_required');
  const root = base.origin;
  return `${root}/vendor/purchase-orders/${encodeURIComponent(poId)}?token=${encodeURIComponent(token)}`;
}
function publicAppOrigin() {
  if (process.env.PUBLIC_APP_ORIGIN) return process.env.PUBLIC_APP_ORIGIN;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'https://unitemedical.net';
}
export async function retryVendorPurchaseOrderOutbox(sql, outbox, { claimed = false } = {}) {
  let current = outbox;
  if (!claimed) {
    const claimToken = crypto.randomBytes(16).toString('hex');
    const claimedAt = new Date().toISOString();
    const claimedRows = await sql`UPDATE um_rows SET
        data=data || ${JSON.stringify({ status: 'in_flight', claimed_at: claimedAt, claim_token: claimToken })}::jsonb,updated_at=now()
      WHERE tbl='gmail_outbox' AND id=${outbox.id} AND deleted=false
        AND data->>'provider'='customerio'
        AND data->>'status' IN ('queued','retry')
        AND COALESCE((data->>'next_retry_at')::timestamptz,now())<=now()
      RETURNING data`;
    if (!claimedRows.length) {
      const latest = await getRow(sql, 'gmail_outbox', outbox.id);
      return { purchase_order: await getRow(sql, 'purchase_orders', outbox.ref_id), outbox: latest || outbox, claimed: false };
    }
    current = claimedRows[0].data;
  } else if (current.status !== 'in_flight' || !current.claim_token) {
    return { purchase_order: null, outbox: current, claimed: false };
  }
  const po = await getRow(sql, 'purchase_orders', current.ref_id);
  const approval=await linkedOrderApproval(sql,po);
  const validation = approval.ok?validateVendorPurchaseOrderDelivery(po, current):approval;
  if (!validation.ok) {
    const cancelled = {
      ...current, status: 'cancelled', last_error: validation.reason,
      next_retry_at: null, secure_token_ciphertext: null, updated_at: new Date().toISOString(),
    };
    await sql`UPDATE um_rows SET data=${JSON.stringify(cancelled)}::jsonb,updated_at=now()
      WHERE tbl='gmail_outbox' AND id=${current.id} AND data->>'status'='in_flight'
        AND data->>'claim_token'=${String(current.claim_token || '')}`;
    return { purchase_order: po, outbox: cancelled, claimed: true };
  }
  if (!current.secure_token_ciphertext) throw new Error('send_retry_material_missing');
  const token = decryptToken(current.secure_token_ciphertext);
  const link = buildVendorPurchaseOrderReviewLink({ poId: po.id, token, origin: publicAppOrigin() });
  const delivery = await sendCustomerIoTransactional({
    to: current.to_address,
    transactional_message_id: 'supplier_purchase_order',
    subject: current.subject,
    body: `${current.body}\n\nReview and respond: ${link}`,
    message_data: { po_id: po.id, po_revision: Number(po.revision || 1), unite_outbox_id: current.id },
    idempotency_key: current.id,
  });
  return { ...(await persistDelivery(sql, po, current, delivery)), claimed: true };
}
async function persistDelivery(sql, po, outbox, delivery) {
  const now = new Date().toISOString();
  const sent = Boolean(delivery.ok);
  const attempts = Number(outbox.attempts || 0) + 1;
  const terminal = !sent && attempts >= 8;
  const unknown = delivery.reason === 'customerio_unreachable';
  const failureStatus = terminal ? 'dead_letter' : unknown ? 'provider_unknown' : 'retry';
  const backoffMs = Math.min(6 * 60 * 60 * 1000, 30_000 * (2 ** Math.max(0, attempts - 1)));
  const updatedOutbox = {
    ...outbox,
    status: sent ? 'sent' : failureStatus,
    provider: sent ? 'customerio' : outbox.provider || 'customerio',
    provider_message_id: delivery.provider_message_id || null,
    customerio_message_id: delivery.provider_message_id || null,
    attempts,
    last_attempt_at: now,
    next_retry_at: sent || terminal || unknown ? null : new Date(Date.now() + backoffMs).toISOString(),
    dead_lettered_at: terminal ? now : null,
    last_error: sent ? null : delivery.reason || 'delivery_failed',
    secure_token_ciphertext: sent ? null : outbox.secure_token_ciphertext,
    claimed_at: null,
    claim_token: null,
    updated_at: now,
  };
  const poPatch = {
    outbound_message_id: delivery.provider_message_id || po.outbound_message_id || null,
    outbound_message_status: updatedOutbox.status,
    outbound_message_provider: sent ? 'customerio' : po.outbound_message_provider || 'customerio',
    updated_at: now,
  };
  const results = await sql.transaction((txn) => [
    txn`UPDATE um_rows SET data=${JSON.stringify(updatedOutbox)}::jsonb,updated_at=now()
      WHERE tbl='gmail_outbox' AND id=${outbox.id} AND data->>'status'='in_flight'
        AND data->>'claim_token'=${String(outbox.claim_token || '')} RETURNING id`,
    txn`UPDATE um_rows SET data=data || ${JSON.stringify(poPatch)}::jsonb,updated_at=now()
      WHERE tbl='purchase_orders' AND id=${po.id} AND deleted=false
        AND data->>'status'='sent'
        AND COALESCE((data->>'revision')::int,1)=${Number(outbox.po_revision || 0)}
        AND data->>'vendor_review_token_hash'=${String(outbox.vendor_review_token_hash || '')} RETURNING id`,
  ]);
  let finalOutbox = updatedOutbox;
  if (sent && (!results[0]?.length || !results[1]?.length)) {
    finalOutbox = { ...updatedOutbox, status: 'sent_stale_revision', last_error: 'purchase_order_changed_after_provider_send' };
    await sql`UPDATE um_rows SET data=${JSON.stringify(finalOutbox)}::jsonb,updated_at=now() WHERE tbl='gmail_outbox' AND id=${outbox.id}`;
  }
  return { purchase_order: await getRow(sql, 'purchase_orders', po.id), outbox: finalOutbox };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin', 'sourcing_manager'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const poId = String(body.po_id || '').trim();
    const idempotencyKey = String(body.idempotency_key || '').trim();
    const expectedRevision = Number(body.expected_revision);
    if (!poId || idempotencyKey.length < 8 || !Number.isInteger(expectedRevision)) return sendJson(res, 400, { error: 'po_idempotency_and_revision_required' });
    let po = await getRow(sql, 'purchase_orders', poId);
    if (!po) return sendJson(res, 404, { error: 'po_not_found' });
    const approval=await linkedOrderApproval(sql,po);if(!approval.ok)return sendJson(res,409,{error:approval.reason});
    const revision = Number(po.revision || 1);
    if (expectedRevision !== revision) return sendJson(res, 409, { error: 'purchase_order_revision_changed' });
    const sendId = stableId('posend', `${poId}:${revision}`);
    let outbox = await getRow(sql, 'gmail_outbox', sendId);
    if (outbox) {
      if (outbox.idempotency_key !== idempotencyKey) return sendJson(res, 409, { error: 'idempotency_key_conflict' });
      if (outbox.status === 'sent') return sendJson(res, 200, { ok: true, duplicate: true, purchase_order: po, delivery_status: 'sent' });
      if (!outbox.secure_token_ciphertext) return sendJson(res, 409, { error: 'send_retry_material_missing' });
      const persisted = await retryVendorPurchaseOrderOutbox(sql, outbox);
      const sent = persisted.outbox.status === 'sent';
      return sendJson(res, sent ? 200 : 202, { ok: sent, duplicate: true, purchase_order: persisted.purchase_order, delivery_status: persisted.outbox.status });
    }

    if (po.status !== 'approved') return sendJson(res, 409, { error: `cannot_send_from_${po.status}` });
    const recipient = String(po.vendor_email || '').trim().toLowerCase();
    if (!recipient) return sendJson(res, 400, { error: 'vendor_email_missing' });
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashVendorReviewToken(token, poId, revision);
    const sentAt = new Date().toISOString();
    const updatedPo = {
      ...po,
      status: 'sent',
      sent_at: sentAt,
      sent_by: live.session.user_id,
      sent_to: recipient,
      vendor_review_token: null,
      vendor_review_token_hash: tokenHash,
      vendor_review_revision: revision,
      vendor_response: 'pending',
      outbound_message_status: 'queued',
      updated_at: sentAt,
    };
    outbox = {
      id: sendId,
      idempotency_key: idempotencyKey,
      to_address: recipient,
      from_address: 'suppliers@unitemedical.net',
      subject: `Purchase order ${poId}`,
      body: `Please review purchase order ${poId}, revision ${revision}.`,
      template_key: 'supplier_purchase_order',
      ref_type: 'purchase_order',
      ref_id: poId,
      po_revision: revision,
      vendor_review_token_hash: tokenHash,
      status: 'queued',
      provider: 'customerio',
      attempts: 0,
      secure_token_ciphertext: encryptToken(token),
      created_at: sentAt,
      updated_at: sentAt,
    };
    const communication = {
      id: stableId('poc', `${sendId}:queued`), po_id: poId, po_revision: revision,
      kind: 'send_queued', actor: live.session.user_id, provider: 'customerio',
      payload: { to: recipient, outbox_id: sendId }, occurred_at: sentAt,
    };
    const results = await sql.transaction((txn) => [
      txn`UPDATE um_rows SET data=${JSON.stringify(updatedPo)}::jsonb,updated_at=now()
        WHERE tbl='purchase_orders' AND id=${poId} AND deleted=false
          AND data->>'status'='approved' AND COALESCE((data->>'revision')::int,1)=${revision}
        RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'gmail_outbox',${sendId},${JSON.stringify(outbox)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='purchase_orders' AND p.id=${poId}
          AND p.data->>'vendor_review_token_hash'=${tokenHash})
        ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'po_communications',${communication.id},${JSON.stringify(communication)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='gmail_outbox' AND o.id=${sendId})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length || !results[1]?.length) return sendJson(res, 409, { error: 'purchase_order_send_conflict' });
    po = updatedPo;
    const persisted = await retryVendorPurchaseOrderOutbox(sql, outbox);
    const sent = persisted.outbox.status === 'sent';
    return sendJson(res, sent ? 200 : 202, { ok: sent, duplicate: false, purchase_order: persisted.purchase_order, delivery_status: persisted.outbox.status });
  } catch (error) {
    return sendJson(res, 500, { error: error.message === 'vendor_po_token_secret_required' ? error.message : 'purchase_order_send_failed' });
  }
}
