import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import {
  claimCustomerIoOutbox,
  deliverCustomerIoOutbox,
  nextStaleCustomerIoClaimState,
  recoverCustomerIoOutbox,
} from '../_lib/customerioOutbox.js';
import { readRawBody, safeEqual, sendJson } from '../_lib/http.js';
import { correlateCustomerIoEvent } from '../hooks/customerio.js';
import { retryVendorPurchaseOrderOutbox } from '../vendor/purchase-orders/send.js';

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') && safeEqual(header.slice(7), secret);
}
async function adminSession(req, sql) {
  const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
  return live.ok ? live.session : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const cron = cronAuthorized(req);
    const admin = cron ? null : await adminSession(req, sql);
    if (req.method === 'GET' && !cron) {
      if (!admin) return sendJson(res, 403, { error: 'forbidden' });
      const counts = await sql`SELECT data->>'status' AS status,COUNT(*)::int AS count
        FROM um_rows WHERE tbl='customerio_outbox' AND deleted=false GROUP BY data->>'status'`;
      const vendorCounts = await sql`SELECT data->>'status' AS status,COUNT(*)::int AS count
        FROM um_rows WHERE tbl='gmail_outbox' AND deleted=false AND data->>'template_key'='supplier_purchase_order'
        GROUP BY data->>'status'`;
      const oldest = await sql`SELECT MIN(data->>'created_at') AS oldest
        FROM um_rows WHERE tbl='customerio_outbox' AND deleted=false
          AND data->>'status' IN ('queued','retry','provider_unknown','in_flight')`;
      const uncorrelated = await sql`SELECT COUNT(*)::int AS count FROM um_rows
        WHERE tbl='customerio_events' AND deleted=false AND data->>'processing_status'='awaiting_correlation'`;
      const lastWebhook = await sql`SELECT MAX(data->>'received_at') AS at FROM um_rows
        WHERE tbl='customerio_events' AND deleted=false`;
      const awaitingOldest = await sql`SELECT MIN(data->>'received_at') AS at FROM um_rows
        WHERE tbl='customerio_events' AND deleted=false AND data->>'processing_status'='awaiting_correlation'`;
      const lastSend = await sql`SELECT MAX(data->>'sent_at') AS at FROM um_rows
        WHERE tbl IN ('customerio_outbox','gmail_outbox') AND deleted=false
          AND data->>'status'='sent' AND data->>'provider'='customerio'`;
      const worker = await sql`SELECT data FROM um_rows WHERE tbl='system_health' AND id='customerio_worker' AND deleted=false LIMIT 1`;
      return sendJson(res, 200, {
        configured: Boolean(process.env.CUSTOMERIO_APP_API_KEY),
        queue: Object.fromEntries(counts.map((row) => [row.status, row.count])),
        supplier_po_queue: Object.fromEntries(vendorCounts.map((row) => [row.status, row.count])),
        oldest_pending_at: oldest[0]?.oldest || null,
        awaiting_correlation: Number(uncorrelated[0]?.count || 0),
        oldest_awaiting_correlation_at: awaitingOldest[0]?.at || null,
        last_successful_send_at: lastSend[0]?.at || null,
        last_authenticated_webhook_at: lastWebhook[0]?.at || null,
        worker: worker[0]?.data || null,
      });
    }
    if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });
    if (!cron && !admin) return sendJson(res, 403, { error: 'forbidden' });

    if (req.method === 'POST' && admin) {
      const rawBody = await readRawBody(req);
      const payload = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
      if (payload.action === 'recover') {
        const table = payload.queue === 'supplier_purchase_order' ? 'gmail_outbox' : 'customerio_outbox';
        const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(payload.id || '')} AND deleted=false LIMIT 1`;
        if (!rows.length) return sendJson(res, 404, { error: 'customerio_outbox_not_found' });
        const prior = rows[0].data;
        if (table === 'gmail_outbox' && prior.template_key !== 'supplier_purchase_order') {
          return sendJson(res, 400, { error: 'customerio_outbox_kind_invalid' });
        }
        const recovered = recoverCustomerIoOutbox(prior, {
          action: payload.recovery_action,
          actor_id: admin.user_id,
          reason: payload.reason,
          evidence: payload.evidence,
          provider_message_id: payload.provider_message_id,
        });
        const patch = {
          status: recovered.status,
          provider: recovered.provider || prior.provider || null,
          provider_message_id: recovered.provider_message_id || null,
          customerio_message_id: recovered.customerio_message_id || null,
          sent_at: recovered.sent_at || null,
          last_error: recovered.last_error,
          next_retry_at: recovered.next_retry_at,
          claimed_at: null,
          claim_token: null,
          dead_lettered_at: recovered.dead_lettered_at || null,
          secure_token_ciphertext: recovered.status === 'sent' ? null : prior.secure_token_ciphertext || null,
          recovery: recovered.recovery,
          updated_at: recovered.updated_at,
        };
        const updateOutbox = (txn) => txn`UPDATE um_rows SET data=data || ${JSON.stringify(patch)}::jsonb,updated_at=now()
          WHERE tbl=${table} AND id=${prior.id} AND deleted=false
            AND data->>'status'=${prior.status} RETURNING data`;
        let updated;
        if (table === 'gmail_outbox') {
          const poPatch = {
            outbound_message_status: recovered.status,
            outbound_message_id: recovered.provider_message_id || prior.provider_message_id || null,
            updated_at: recovered.updated_at,
          };
          const transaction = await sql.transaction((txn) => [
            updateOutbox(txn),
            txn`UPDATE um_rows SET data=data || ${JSON.stringify(poPatch)}::jsonb,updated_at=now()
              WHERE tbl='purchase_orders' AND id=${String(prior.ref_id || '')} AND deleted=false`,
          ]);
          updated = transaction[0];
        } else {
          updated = await updateOutbox(sql);
        }
        if (!updated.length) return sendJson(res, 409, { error: 'customerio_outbox_changed' });
        return sendJson(res, 200, { ok: true, outbox: updated[0].data });
      }
    }

    const stale = await sql`SELECT id,data FROM um_rows WHERE tbl='customerio_outbox' AND deleted=false
      AND data->>'status'='in_flight'
      AND COALESCE((data->>'claimed_at')::timestamptz,to_timestamp(0))<now()-interval '15 minutes'
      ORDER BY data->>'claimed_at' ASC LIMIT 20`;
    const results = [];
    for (const candidate of stale) {
      const next = nextStaleCustomerIoClaimState(candidate.data);
      const moved = await sql`UPDATE um_rows SET data=data || ${JSON.stringify({
        status: next.status, last_error: next.last_error, next_retry_at: null,
        claimed_at: null, claim_token: null, reconciliation_required_at: next.reconciliation_required_at,
        updated_at: next.updated_at,
      })}::jsonb,updated_at=now()
        WHERE tbl='customerio_outbox' AND id=${candidate.id} AND deleted=false
          AND data->>'status'='in_flight' AND data->>'claim_token'=${String(candidate.data.claim_token || '')}
        RETURNING data`;
      if (moved.length) results.push({ id: candidate.id, status: 'provider_unknown', kind: 'stale_claim' });
    }
    const due = await sql`SELECT id,data FROM um_rows WHERE tbl='customerio_outbox' AND deleted=false
      AND data->>'status' IN ('queued','retry')
      AND COALESCE((data->>'next_retry_at')::timestamptz,now())<=now()
      ORDER BY COALESCE(data->>'next_retry_at',data->>'created_at') ASC LIMIT 20`;
    for (const candidate of due) {
      const claimed = await claimCustomerIoOutbox(sql, candidate.id);
      if (!claimed) continue;
      const final = await deliverCustomerIoOutbox(sql, claimed, { claimed: true });
      results.push({ id: final.id, status: final.status, attempts: final.attempts });
    }
    const vendorStale = await sql`SELECT id,data FROM um_rows WHERE tbl='gmail_outbox' AND deleted=false
      AND data->>'template_key'='supplier_purchase_order' AND data->>'status'='in_flight'
      AND COALESCE((data->>'claimed_at')::timestamptz,to_timestamp(0))<now()-interval '15 minutes'
      ORDER BY data->>'claimed_at' ASC LIMIT 20`;
    for (const candidate of vendorStale) {
      const moved = await sql`UPDATE um_rows SET data=data || ${JSON.stringify({
        status: 'provider_unknown', last_error: 'stale_claim_requires_reconciliation',
        next_retry_at: null, claimed_at: null, claim_token: null,
        reconciliation_required_at: new Date().toISOString(),
      })}::jsonb,updated_at=now()
        WHERE tbl='gmail_outbox' AND id=${candidate.id} AND deleted=false
          AND data->>'status'='in_flight' AND data->>'claim_token'=${String(candidate.data.claim_token || '')}
        RETURNING data`;
      if (moved.length) results.push({ id: candidate.id, status: 'provider_unknown', kind: 'supplier_purchase_order_stale_claim' });
    }
    const vendorDue = await sql`SELECT id,data FROM um_rows WHERE tbl='gmail_outbox' AND deleted=false
      AND data->>'template_key'='supplier_purchase_order'
      AND data->>'status' IN ('queued','retry')
      AND COALESCE((data->>'next_retry_at')::timestamptz,now())<=now()
      ORDER BY COALESCE(data->>'next_retry_at',data->>'created_at') ASC LIMIT 20`;
    for (const candidate of vendorDue) {
      const result = await retryVendorPurchaseOrderOutbox(sql, candidate.data);
      if (!result.claimed) continue;
      results.push({ id: result.outbox.id, status: result.outbox.status, attempts: result.outbox.attempts, kind: 'supplier_purchase_order' });
    }
    const awaiting = await sql`SELECT id,data FROM um_rows WHERE tbl='customerio_events' AND deleted=false
      AND data->>'processing_status'='awaiting_correlation' ORDER BY updated_at ASC LIMIT 100`;
    let correlations = 0;
    for (const event of awaiting) {
      const matches = await correlateCustomerIoEvent(sql, event.data);
      if (!matches) continue;
      correlations += matches;
      await sql`UPDATE um_rows SET
        data=jsonb_set(jsonb_set(data,'{processing_status}','"correlated"'::jsonb,true),'{processed_at}',${JSON.stringify(new Date().toISOString())}::jsonb,true),
        updated_at=now() WHERE tbl='customerio_events' AND id=${event.id}`;
    }
    const heartbeat = {
      id: 'customerio_worker', status: 'ok', last_run_at: new Date().toISOString(),
      processed: results.length, correlations,
    };
    await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
      VALUES ('system_health','customerio_worker',${JSON.stringify(heartbeat)}::jsonb,false,now())
      ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
    return sendJson(res, 200, { ok: true, processed: results.length, correlations, results });
  } catch (error) {
    return sendJson(res, 500, { error: 'customerio_outbox_failed', detail: error.message });
  }
}
