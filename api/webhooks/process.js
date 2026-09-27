import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { safeEqual, sendJson } from '../_lib/http.js';

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = String(req.headers.authorization || '');
  return auth.startsWith('Bearer ') && safeEqual(auth.slice(7), secret);
}
function taskId(eventId) {
  return `task_${crypto.createHash('sha256').update(`${eventId}:webhook-review`).digest('hex').slice(0, 20)}`;
}

export default async function handler(req, res) {
  if(process.env.UNITE_ENVIRONMENT==='staging')return sendJson(res,200,{ok:true,skipped:'staging_no_webhook_processing'});
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    if (!cronAuthorized(req)) {
      const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
      if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
    }
    const candidates = await sql`SELECT id,data FROM um_rows WHERE tbl='webhook_events' AND deleted=false
      AND (data->>'status' IN ('pending','retry')
        OR (data->>'status'='in_flight' AND COALESCE((data->>'claimed_at')::timestamptz,to_timestamp(0))<now()-interval '15 minutes'))
      ORDER BY updated_at ASC LIMIT 50`;
    let claimedCount = 0;
    for (const candidate of candidates) {
      const claimedAt = new Date().toISOString();
      const claimed = await sql`UPDATE um_rows SET
        data=jsonb_set(jsonb_set(data,'{status}','"in_flight"'::jsonb,true),'{claimed_at}',${JSON.stringify(claimedAt)}::jsonb,true),updated_at=now()
        WHERE tbl='webhook_events' AND id=${candidate.id} AND deleted=false
          AND (data->>'status' IN ('pending','retry')
            OR (data->>'status'='in_flight' AND COALESCE((data->>'claimed_at')::timestamptz,to_timestamp(0))<now()-interval '15 minutes'))
        RETURNING data`;
      if (!claimed.length) continue;
      claimedCount += 1;
      const event = claimed[0].data;
      const at = new Date().toISOString();
      const task = {
        id: taskId(event.id), kind: 'webhook_event_review', status: 'open',
        ref_type: 'webhook_event', ref_id: event.id, owner_email: 'ops@unitemedical.net',
        subject: `${event.source} webhook requires server workflow review`,
        payload: { source: event.source, type: event.type, received_at: event.received_at },
        created_at: at,
      };
      await sql.transaction((txn) => [
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          VALUES ('tasks',${task.id},${JSON.stringify(task)}::jsonb,false,now())
          ON CONFLICT (tbl,id) DO NOTHING`,
        txn`UPDATE um_rows SET data=data || ${JSON.stringify({
          status: 'requires_review', processed_at: at, claimed_at: null,
          attempts: Number(event.attempts || 0) + 1,
          last_error: 'dedicated_server_handler_required', updated_at: at,
        })}::jsonb,updated_at=now() WHERE tbl='webhook_events' AND id=${event.id} AND data->>'status'='in_flight'`,
      ]);
    }
    return sendJson(res, 200, { ok: true, claimed: claimedCount });
  } catch {
    return sendJson(res, 503, { error: 'webhook_worker_failed' });
  }
}
