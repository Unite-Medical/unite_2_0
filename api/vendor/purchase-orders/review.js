import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { logEvent, readRawBody, safeEqual, sendJson } from '../../_lib/http.js';

const ACTIONS = new Set(['acknowledge', 'request_changes', 'cannot_fulfill']);

export function hashVendorReviewToken(token, poId, revision = 1) {
  return crypto.createHash('sha256').update(`${poId}:${revision}:${token}`).digest('hex');
}

export function authorizeVendorPurchaseOrder(po, token) {
  const given = String(token || '');
  if (!po || !given || po.status !== 'sent') return false;
  const revision = Number(po.vendor_review_revision || po.revision || 1);
  if (Number(po.revision || 1) !== revision) return false;
  if (po.vendor_review_token_hash) {
    return safeEqual(po.vendor_review_token_hash, hashVendorReviewToken(given, po.id, revision));
  }
  return process.env.NODE_ENV !== 'production' && Boolean(po.vendor_review_token) && safeEqual(po.vendor_review_token, given);
}

export function sanitizePurchaseOrderForVendor(po = {}) {
  return {
    id: po.id,
    vendor_name: po.vendor_name || null,
    status: po.status,
    revision: po.revision || 1,
    expected_delivery: po.expected_delivery || null,
    warehouse_delivery: po.vendor_delivery_instructions || null,
    line_items: (po.line_items || []).map((line) => ({
      sku: line.sku,
      name: line.name || line.sku,
      qty: Number(line.qty || 0),
      cost: Number(line.cost || 0),
    })),
    total_cost: Number(po.total_cost || 0),
    currency: po.currency || po.settlement_currency || 'USD',
    vendor_response: po.vendor_response || 'pending',
    vendor_response_note: po.vendor_response_note || null,
    vendor_responded_at: po.vendor_responded_at || null,
    sent_at: po.sent_at || null,
  };
}

export function validateVendorPurchaseOrderAction(input = {}) {
  const action = String(input.action || '').trim();
  const responder = String(input.responder || '').trim();
  const note = String(input.note || '').trim().slice(0, 2000);
  if (!ACTIONS.has(action)) return { ok: false, reason: 'invalid_action' };
  if (!responder) return { ok: false, reason: 'responder_required' };
  if (action !== 'acknowledge' && !note) return { ok: false, reason: 'note_required' };
  return { ok: true, action, responder, note };
}

export function applyVendorPurchaseOrderResponse(po, { action, responder, note = '', now = new Date() } = {}) {
  const responseMap = {
    acknowledge: 'acknowledged',
    request_changes: 'changes_requested',
    cannot_fulfill: 'cannot_fulfill',
  };
  const response = responseMap[action];
  if (!response) return { ok: false, reason: 'invalid_action' };
  const current = po?.vendor_response || 'pending';
  if (current !== 'pending') {
    return current === response
      ? { ok: true, duplicate: true, purchase_order: po }
      : { ok: false, reason: 'response_already_final', purchase_order: po };
  }
  const respondedAt = now.toISOString();
  return {
    ok: true,
    duplicate: false,
    purchase_order: {
      ...po,
      vendor_response: response,
      vendor_response_note: note || null,
      vendor_responded_by: responder,
      vendor_responded_at: respondedAt,
      vendor_acknowledged_at: response === 'acknowledged' ? respondedAt : null,
    },
  };
}

function client() {
  return process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
}

async function findPurchaseOrder(sql, poId) {
  const rows = await sql`
    SELECT data FROM um_rows
    WHERE tbl='purchase_orders' AND id=${String(poId)} AND deleted=false
    LIMIT 1`;
  return rows[0]?.data || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const sql = client();
  if (!sql) return sendJson(res, 503, { error: 'not_configured' });
  let body = {};
  if (req.method === 'POST') {
    try {
      body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    } catch {
      return sendJson(res, 400, { error: 'invalid_payload' });
    }
  }
  const poId = String(req.query?.po_id || body.po_id || '');
  const token = String(req.query?.token || body.token || '');
  if (!poId || !token) return sendJson(res, 404, { error: 'not_found' });

  try {
    const po = await findPurchaseOrder(sql, poId);
    if (!authorizeVendorPurchaseOrder(po, token)) return sendJson(res, 404, { error: 'not_found' });

    if (req.method === 'GET') {
      return sendJson(res, 200, { purchase_order: sanitizePurchaseOrderForVendor(po) });
    }

    if (req.method === 'POST') {
      const action = validateVendorPurchaseOrderAction(body);
      if (!action.ok) return sendJson(res, 400, { error: action.reason });
      const applied = applyVendorPurchaseOrderResponse(po, action);
      if (!applied.ok) return sendJson(res, 409, { error: applied.reason });
      if (applied.duplicate) return sendJson(res, 200, { purchase_order: sanitizePurchaseOrderForVendor(po), duplicate: true });
      const updated = applied.purchase_order;
      const response = updated.vendor_response;
      const respondedAt = updated.vendor_responded_at;
      const responsePatch = {
        vendor_response: updated.vendor_response,
        vendor_response_note: updated.vendor_response_note,
        vendor_responded_by: updated.vendor_responded_by,
        vendor_responded_at: updated.vendor_responded_at,
        vendor_acknowledged_at: updated.vendor_acknowledged_at || null,
      };
      const revision = Number(po.revision || 1);
      const tokenHash = String(po.vendor_review_token_hash);
      const communicationId = `poc_${crypto.createHash('sha256').update(`${poId}:${revision}:${response}`).digest('hex').slice(0, 20)}`;
      const communication = {
        id: communicationId,
        po_id: poId,
        po_revision: revision,
        kind: `vendor_${response}`,
        actor: action.responder,
        provider: 'hosted_review',
        payload: { response, note: action.note || null },
        occurred_at: respondedAt,
      };
      const results = await sql.transaction((txn) => [
        txn`UPDATE um_rows SET data=data || ${JSON.stringify(responsePatch)}::jsonb,updated_at=now()
          WHERE tbl='purchase_orders' AND id=${poId} AND deleted=false
            AND data->>'status'='sent'
            AND COALESCE((data->>'revision')::int,1)=${revision}
            AND COALESCE((data->>'vendor_review_revision')::int,1)=${revision}
            AND data->>'vendor_review_token_hash'=${tokenHash}
            AND COALESCE(data->>'vendor_response','pending')='pending'
          RETURNING id`,
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'po_communications',${communicationId},${JSON.stringify(communication)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='purchase_orders' AND p.id=${poId}
            AND COALESCE((p.data->>'revision')::int,1)=${revision}
            AND p.data->>'vendor_response'=${response})
          ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
        txn`SELECT 1 / CASE WHEN
          EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='purchase_orders' AND p.id=${poId}
            AND COALESCE((p.data->>'revision')::int,1)=${revision} AND p.data->>'vendor_response'=${response})
          AND EXISTS (SELECT 1 FROM um_rows c WHERE c.tbl='po_communications' AND c.id=${communicationId})
          THEN 1 ELSE 0 END AS committed`,
      ]);
      if (!results[0]?.length) {
        const latest = await findPurchaseOrder(sql, poId);
        if (!authorizeVendorPurchaseOrder(latest, token)) return sendJson(res, 409, { error: 'purchase_order_revision_changed' });
        const replay = applyVendorPurchaseOrderResponse(latest, action);
        if (!replay.ok) return sendJson(res, 409, { error: replay.reason });
        return sendJson(res, 200, { purchase_order: sanitizePurchaseOrderForVendor(latest), duplicate: true });
      }
      logEvent('vendor.po_review', response, { po_id: poId, revision });
      return sendJson(res, 200, { purchase_order: sanitizePurchaseOrderForVendor(updated) });
    }

    return sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    logEvent('vendor.po_review', 'error', { po_id: poId, error: error.message });
    return sendJson(res, 500, { error: 'review_failed' });
  }
}
