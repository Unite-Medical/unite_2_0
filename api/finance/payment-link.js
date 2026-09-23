import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { sendJson } from '../_lib/http.js';

export function paymentLinkForInvoice({ invoice, session } = {}) {
  if (!invoice) return { ok: false, reason: 'invoice_not_found' };
  if (!session) return { ok: false, reason: 'authentication_required' };
  if (session.role === 'customer' && String(invoice.customer_id || invoice.org_id || '') !== String(session.org_id || '')) {
    return { ok: false, reason: 'invoice_owner_mismatch' };
  }
  if (invoice.status !== 'open' && invoice.status !== 'past_due') return { ok: false, reason: 'invoice_not_open' };
  const paymentUrl = invoice.payment_url || invoice.hosted_invoice_url || null;
  if (!paymentUrl) return { ok: false, reason: 'payment_link_not_ready' };
  return { ok: true, invoice_id: invoice.id, payment_url: paymentUrl };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const live = await authorizeLiveRequest(req, sql, { roles: ['customer', 'admin', 'finance'] });
    if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    const invoiceId = String(req.query?.invoice_id || '').trim();
    if (!invoiceId) return sendJson(res, 400, { error: 'invoice_id_required' });
    const rows = await sql`SELECT data FROM um_rows WHERE tbl='invoices' AND id=${invoiceId} AND deleted=false LIMIT 1`;
    const result = paymentLinkForInvoice({ invoice: rows[0]?.data || null, session: live.session });
    if (!result.ok) {
      const status = result.reason === 'invoice_not_found' ? 404
        : result.reason === 'invoice_owner_mismatch' ? 403
          : result.reason === 'payment_link_not_ready' ? 409 : 400;
      return sendJson(res, status, { error: result.reason });
    }
    return sendJson(res, 200, result);
  } catch {
    return sendJson(res, 500, { error: 'payment_link_failed' });
  }
}
