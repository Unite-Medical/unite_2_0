import { deliverInquiryNotification } from '../_lib/inquiryDelivery.js';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { readRawBody, sendJson } from '../_lib/http.js';
import { planPublicInquiry } from '../_lib/publicInquiry.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'inquiry_storage_unavailable' });
  try {
    const raw = await readRawBody(req);
    if (raw.length > 256000) return sendJson(res, 413, { error: 'submission_too_large' });
    const input = JSON.parse(raw.toString('utf8'));
    const sql = neon(process.env.DATABASE_URL);
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0];
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex');
    const ownerEmail = input.kind==='contact'&&input.route_to_rep!==true?'support@unitemedical.net':process.env.UNITE_JACOBE_EMAIL || 'jacobe@unitemedical.net';
    const plan = planPublicInquiry(input, { ownerEmail, sourceIpHash: ipHash });
    if (!plan.ok) return sendJson(res, 400, { error: plan.reason });
    // Lock on source IP serializes rate-limit checks. Save request and notification
    // in one transaction; repeat submits cannot duplicate either record.
    const rows = [['public_inquiries', plan.inquiry], ['tasks', plan.task], ...(plan.outbox ? [['inquiry_notifications', plan.outbox]] : [])];
    const results = await sql.transaction(tx => [
      tx`SELECT pg_advisory_xact_lock(hashtext(${ipHash}))`,
      tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at)
         SELECT 'public_inquiries',${plan.inquiry.id},${JSON.stringify(plan.inquiry)}::jsonb,false,now()
         WHERE (SELECT count(*) FROM um_rows WHERE tbl='public_inquiries' AND deleted=false AND data->>'source_ip_hash'=${ipHash} AND (data->>'created_at')::timestamptz>now()-interval '1 hour')<10
         ON CONFLICT(tbl,id) DO NOTHING RETURNING id`,
      ...rows.slice(1).map(([table,row]) => tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at)
         SELECT ${table},${row.id},${JSON.stringify(row)}::jsonb,false,now()
         WHERE EXISTS(SELECT 1 FROM um_rows WHERE tbl='public_inquiries' AND id=${plan.inquiry.id} AND data->>'request_hash'=${plan.inquiry.request_hash} AND deleted=false)
         ON CONFLICT(tbl,id) DO NOTHING`),
      tx`SELECT data->>'request_hash' AS request_hash FROM um_rows WHERE tbl='public_inquiries' AND id=${plan.inquiry.id} AND deleted=false`,
    ]);
    const existing = results.at(-1)[0];
    if (!existing) return sendJson(res, 429, { error: 'inquiry_rate_limited' });
    if (existing.request_hash !== plan.inquiry.request_hash) return sendJson(res, 409, { error: 'request_reference_conflict' });
    const notification = await deliverInquiryNotification(sql, plan.inquiry.id);
    return sendJson(res, results[1].length ? 201 : 200, { ok: true, id: plan.inquiry.id, status: 'pending_review', notification_status: notification.status });
  } catch { return sendJson(res, 500, { error: 'inquiry_save_failed' }); }
}
