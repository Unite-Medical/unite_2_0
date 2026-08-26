import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';
import { planInvoicePayment } from '../_lib/arPayment.js';

async function row(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const profile = await row(sql, 'profiles', session.user_id);
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'finance'] });
    if (!live.ok) {
      return sendJson(res, 403, { error: live.reason });
    }
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const invoice = await row(sql, 'invoices', body.invoice_id);
    if (!invoice) return sendJson(res, 404, { error: 'invoice_not_found' });
    const order = invoice.order_id ? await row(sql, 'orders', invoice.order_id) : null;
    const plan = planInvoicePayment({
      invoice,
      order,
      input: { ...body, provider: body.provider === 'accounting' ? 'qbo' : body.provider },
      actorId: session.user_id,
    });
    if (!plan.ok) return sendJson(res, 400, { error: plan.reason });
    if (plan.idempotent) return sendJson(res, 200, { ok: true, duplicate: true, invoice: plan.invoice, order: plan.order, payment: plan.payment });

    const nonce = crypto.randomBytes(12).toString('hex');
    const expectedPaid = Number(invoice.paid_amount || 0);
    const updatedInvoice = { ...plan.invoice, payment_commit_nonce: nonce };
    const audit = {
      id: stableId('audit', plan.payment.id),
      kind: 'finance.payment_evidence_recorded',
      ref_id: invoice.id,
      actor_id: session.user_id,
      payload: { payment_id: plan.payment.id, provider: plan.payment.provider, amount: plan.payment.amount },
      created_at: new Date().toISOString(),
    };
    const queries = [
      (txn) => txn`UPDATE um_rows SET data=${JSON.stringify(updatedInvoice)}::jsonb,updated_at=now()
        WHERE tbl='invoices' AND id=${invoice.id} AND deleted=false
          AND COALESCE((data->>'paid_amount')::numeric,0)=${expectedPaid}
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(data->'payment_evidence','[]'::jsonb)) evidence
            WHERE evidence->>'id'=${plan.payment.id})
        RETURNING id`,
      (txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'payments',${plan.payment.id},${JSON.stringify(plan.payment)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='invoices' AND i.id=${invoice.id}
          AND i.data->>'payment_commit_nonce'=${nonce})
        ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
    ];
    if (plan.order) {
      queries.push((txn) => txn`UPDATE um_rows SET data=${JSON.stringify(plan.order)}::jsonb,updated_at=now()
        WHERE tbl='orders' AND id=${plan.order.id} AND deleted=false
          AND EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='invoices' AND i.id=${invoice.id}
            AND i.data->>'payment_commit_nonce'=${nonce})
        RETURNING id`);
    }
    queries.push((txn) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
      WHERE EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='invoices' AND i.id=${invoice.id}
        AND i.data->>'payment_commit_nonce'=${nonce})
      ON CONFLICT (tbl,id) DO NOTHING RETURNING id`);
    if (plan.order) {
      queries.push((txn) => txn`SELECT 1 / CASE WHEN
        EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='invoices' AND i.id=${invoice.id} AND i.data->>'payment_commit_nonce'=${nonce})
        AND EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='payments' AND p.id=${plan.payment.id})
        AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${plan.order.id} AND o.data->>'payment_status'=${plan.order.payment_status})
        THEN 1 ELSE 0 END AS committed`);
    } else {
      queries.push((txn) => txn`SELECT 1 / CASE WHEN
        EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='invoices' AND i.id=${invoice.id} AND i.data->>'payment_commit_nonce'=${nonce})
        AND EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='payments' AND p.id=${plan.payment.id})
        THEN 1 ELSE 0 END AS committed`);
    }

    let results;
    try {
      results = await sql.transaction((txn) => queries.map((query) => query(txn)));
    } catch {
      return sendJson(res, 409, { error: 'payment_state_changed_retry' });
    }
    if (!results[0]?.length || !results[1]?.length) return sendJson(res, 409, { error: 'payment_state_changed_retry' });
    return sendJson(res, 200, { ok: true, invoice: updatedInvoice, order: plan.order, payment: plan.payment });
  } catch {
    return sendJson(res, 500, { error: 'payment_evidence_failed' });
  }
}
