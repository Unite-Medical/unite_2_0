import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../../_lib/auth.js';
import { readRawBody, sendJson } from '../../_lib/http.js';

function stableId(value) {
  return `aud_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}
async function getRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${id} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}

export function planPurchaseOrderAction(po, { action, actorId, reason = null, now = new Date() } = {}, related = {}) {
  if (!po) return { ok: false, reason: 'po_not_found' };
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  if (action === 'approve') {
    if (po.status !== 'draft') return { ok: false, reason: `cannot_approve_from_${po.status}` };
    return { ok: true, purchase_order: { ...po, status: 'approved', revision: Number(po.revision || 1), approved_at: at, approved_by: actorId, updated_at: at } };
  }
  if (action === 'cancel') {
    if (!['draft', 'approved', 'sent'].includes(po.status)) return { ok: false, reason: `cannot_cancel_from_${po.status}` };
    if (po.vendor_response === 'acknowledged') return { ok: false, reason: 'acknowledged_po_cannot_be_cancelled' };
    return {
      ok: true,
      purchase_order: {
        ...po, status: 'cancelled', revision: Number(po.revision || 1) + 1,
        vendor_review_token: null, vendor_review_token_hash: null, vendor_review_revision: null,
        cancelled_at: at, cancelled_by: actorId, cancel_reason: reason || 'manual', updated_at: at,
      },
    };
  }
  if (action === 'revise') {
    if (po.status !== 'sent' || po.vendor_response !== 'changes_requested') return { ok: false, reason: 'supplier_change_request_required' };
    const sentSnapshot = {
      revision: Number(po.revision || 1), sent_at: po.sent_at || null, sent_to: po.sent_to || null,
      line_items: po.line_items || [], total_cost: po.total_cost || 0,
      currency: po.currency || po.settlement_currency || 'USD', vendor_response: po.vendor_response,
      vendor_response_note: po.vendor_response_note || null,
    };
    return {
      ok: true,
      purchase_order: {
        ...po, status: 'draft', revision: Number(po.revision || 1) + 1,
        sent_revisions: [...(po.sent_revisions || []), sentSnapshot],
        vendor_review_token: null, vendor_review_token_hash: null, vendor_review_revision: null,
        vendor_response: 'pending', vendor_response_note: null, vendor_responded_by: null,
        vendor_responded_at: null, vendor_acknowledged_at: null,
        sent_at: null, sent_by: null, sent_to: null,
        revised_at: at, revised_by: actorId, updated_at: at,
      },
    };
  }
  if (action === 'close') {
    if (po.po_type === 'consignment_settlement') {
      if (!po.paid_at || Number(po.paid_amount || 0) + 0.001 < Number(po.total_cost || 0)) return { ok: false, reason: 'settlement_payment_evidence_required' };
    } else {
      if (po.status !== 'received') return { ok: false, reason: `cannot_close_from_${po.status}` };
      const unbilled = (po.line_items || []).some((line) => Number(line.accepted_qty ?? line.received_qty ?? 0) > Number(line.billed_qty || 0));
      const pendingBill = (related.vendor_bills || []).some((bill) => !['approved', 'cancelled'].includes(bill.status));
      const openVariance = (related.variances || []).some((variance) => variance.status === 'open');
      if (po.ap_posting_lock || unbilled || pendingBill || openVariance) return { ok: false, reason: 'ap_unresolved' };
    }
    return { ok: true, purchase_order: { ...po, status: 'closed', closed_at: at, closed_by: actorId, updated_at: at } };
  }
  return { ok: false, reason: 'invalid_action' };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['admin', 'sourcing_manager', 'finance'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const poId = String(body.po_id || '').trim();
    const action = String(body.action || '').trim();
    const expectedRevision = Number(body.expected_revision);
    if (!poId || !action || !Number.isInteger(expectedRevision)) return sendJson(res, 400, { error: 'po_action_and_revision_required' });
    const po = await getRow(sql, 'purchase_orders', poId);
    if (po && expectedRevision !== Number(po.revision || 1)) return sendJson(res, 409, { error: 'purchase_order_revision_changed' });
    const [bills, variances] = await Promise.all([
      sql`SELECT data FROM um_rows WHERE tbl='vendor_bills' AND deleted=false AND data->>'po_id'=${poId}`,
      sql`SELECT data FROM um_rows WHERE tbl='vendor_bill_variances' AND deleted=false AND data->>'po_id'=${poId}`,
    ]);
    const plan = planPurchaseOrderAction(po, {
      action, actorId: live.session.user_id, reason: body.reason,
    }, { vendor_bills: bills.map((row) => row.data), variances: variances.map((row) => row.data) });
    if (!plan.ok) return sendJson(res, 409, { error: plan.reason });
    const actionPatch = Object.fromEntries(Object.entries(plan.purchase_order)
      .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(po?.[key])));
    const audit = {
      id: stableId(`${poId}:${expectedRevision}:${action}`),
      kind: `purchase_order.${action}`, ref_id: poId, actor_id: live.session.user_id,
      payload: { from_status: po.status, to_status: plan.purchase_order.status, expected_revision: expectedRevision, reason: body.reason || null },
      created_at: new Date().toISOString(),
    };
    const results = await sql.transaction((txn) => [
      txn`UPDATE um_rows SET data=data || ${JSON.stringify(actionPatch)}::jsonb,updated_at=now()
        WHERE tbl='purchase_orders' AND id=${poId} AND deleted=false
          AND data->>'status'=${po.status}
          AND COALESCE((data->>'revision')::int,1)=${expectedRevision}
          AND (${action}<>'cancel' OR COALESCE(data->>'vendor_response','pending')<>'acknowledged')
        RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='purchase_orders' AND p.id=${poId} AND p.data->>'status'=${plan.purchase_order.status})
        ON CONFLICT (tbl,id) DO NOTHING`,
    ]);
    if (!results[0]?.length) return sendJson(res, 409, { error: 'purchase_order_state_changed' });
    return sendJson(res, 200, { ok: true, purchase_order: plan.purchase_order });
  } catch (error) {
    return sendJson(res, 500, { error: 'purchase_order_action_failed', detail: error.message });
  }
}
