import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { planSettlementPayment } from '../_lib/settlementPayment.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const profiles = await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${session.user_id} AND deleted=false LIMIT 1`;
    const profile = profiles[0]?.data;
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'finance'] });
    if (!live.ok) {
      return sendJson(res, 403, { error: live.reason });
    }
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');
    const poId = String(body.settlement_po_id || '').trim();
    const [poRows, movementRows] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='purchase_orders' AND id=${poId} AND deleted=false LIMIT 1`,
      sql`SELECT data FROM um_rows WHERE tbl='consignment_movements' AND deleted=false AND data->>'settlement_po_id'=${poId}`,
    ]);
    const po = poRows[0]?.data;
    const movements = movementRows.map((row) => row.data);
    const plan = planSettlementPayment({
      purchaseOrder: po,
      movements,
      input: { ...body, provider: body.provider === 'accounting' ? 'qbo' : body.provider },
      actorId: session.user_id,
    });
    if (!plan.ok) return sendJson(res, 409, { error: plan.reason });
    if (plan.idempotent) return sendJson(res, 200, { ok: true, duplicate: true, purchase_order: plan.purchase_order });
    const audit = {
      id: stableId('aud', `${poId}:payment:${plan.payment.id}`),
      kind: 'settlement.payment_recorded', ref_id: poId, actor_id: session.user_id,
      payload: {
        payment_id: plan.payment.id,
        provider: plan.payment.provider,
        payment_reference: plan.payment.payment_reference,
        amount: plan.payment.amount,
        fully_paid: plan.purchase_order.status === 'closed',
      },
      created_at: plan.payment.created_at,
    };
    const results = await sql.transaction((txn) => [
      txn`UPDATE um_rows SET data=${JSON.stringify(plan.purchase_order)}::jsonb,updated_at=now()
        WHERE tbl='purchase_orders' AND id=${poId} AND deleted=false AND data->>'po_type'='consignment_settlement'
          AND COALESCE((data->>'paid_amount')::numeric,0)=${Number(po?.paid_amount || 0)}
        RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'settlement_payments',${plan.payment.id},${JSON.stringify(plan.payment)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows po WHERE po.tbl='purchase_orders' AND po.id=${poId}
          AND po.data->'payment_evidence' @> ${JSON.stringify([plan.payment])}::jsonb)
        ON CONFLICT (tbl,id) DO NOTHING`,
      ...plan.movements.map((movement) => txn`UPDATE um_rows SET data=${JSON.stringify(movement)}::jsonb,updated_at=now()
        WHERE tbl='consignment_movements' AND id=${movement.id} AND deleted=false
          AND EXISTS (SELECT 1 FROM um_rows po WHERE po.tbl='purchase_orders' AND po.id=${poId}
            AND po.data->'payment_evidence' @> ${JSON.stringify([plan.payment])}::jsonb)`),
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows po WHERE po.tbl='purchase_orders' AND po.id=${poId}
          AND po.data->'payment_evidence' @> ${JSON.stringify([plan.payment])}::jsonb)
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'settlement_payment_conflict' });
    logEvent('ap.settlement_payment', 'recorded', { settlement_po_id: poId, payment_id: plan.payment.id });
    return sendJson(res, 200, { ok: true, purchase_order: plan.purchase_order, payment: plan.payment });
  } catch (error) {
    logEvent('ap.settlement_payment', 'error', { actor_id: session.user_id, error: error.message });
    return sendJson(res, 500, { error: 'settlement_payment_failed' });
  }
}
