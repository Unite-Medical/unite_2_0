import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';
import { qboAccessContext } from '../_lib/qboTokens.js';
import { normalizePoDraft, draftFromQboPo, buildQboPo, poTransferId, qboPoRequest } from '../_lib/qboPurchaseOrders.js';

async function row(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${id} AND deleted=false LIMIT 1`;
  return rows[0]?.data;
}
async function saveDraft(sql, draft, actorId, identity) {
  const id = `po_import_${poTransferId(identity)}`;
  const at = new Date().toISOString();
  const po = { ...normalizePoDraft(draft), id, status: 'draft', po_type: 'inventory', revision: 1, receiving_revision: 0,
    created_by: actorId, created_at: at, updated_at: at, import_review_required: true,
    wms_po_id: id, warehouse_id: 'wh_atl' };
  await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('purchase_orders',${id},${JSON.stringify(po)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING`;
  return row(sql, 'purchase_orders', id);
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  if (!['GET', 'POST'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const auth = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
    if (!auth.ok) return sendJson(res, auth.reason === 'authentication_required' ? 401 : 403, { error: auth.reason });
    const actor = auth.session.user_id;
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) return sendJson(res, 415, { error: 'json_required' });
    if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return sendJson(res, 403, { error: 'same_origin_required' });
    const raw = req.method === 'POST' ? await readRawBody(req) : Buffer.from('{}');
    if (raw.length > 300000) return sendJson(res, 413, { error: 'purchase_order_too_large' });
    const input = JSON.parse(raw.toString());
    if (input.action === 'save_draft') {
      const draft = normalizePoDraft(input.draft);
      const po = await saveDraft(sql, draft, actor, ['file', draft]);
      return sendJson(res, 200, { purchase_order: po });
    }
    const context = await qboAccessContext(sql);
    if (req.method === 'GET') {
      const params = new URL(req.url, 'https://local').searchParams;
      const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
      if (!Number.isInteger(page)) return sendJson(res, 400, { error: 'invalid_page' });
      const payload = await qboPoRequest(context, 'query', { query: `select * from PurchaseOrder startposition ${(page - 1) * 50 + 1} maxresults 50` });
      return sendJson(res, 200, { purchase_orders: payload.QueryResponse?.PurchaseOrder || [], page, has_more: payload.QueryResponse?.PurchaseOrder?.length === 50, environment: context.environment });
    }
    if (input.action === 'read') {
      if (!/^\d+$/.test(String(input.qbo_id))) return sendJson(res, 400, { error: 'invalid_qbo_id' });
      const { PurchaseOrder: po } = await qboPoRequest(context, `purchaseorder/${input.qbo_id}`);
      return sendJson(res, 200, { draft: draftFromQboPo(po), qbo_id: po.Id, sync_token: po.SyncToken, environment: context.environment });
    }
    if (input.action === 'preview') {
      let existing = null;
      if (input.qbo_id) {
        if (!/^\d+$/.test(String(input.qbo_id))) return sendJson(res, 400, { error: 'invalid_qbo_id' });
        existing = (await qboPoRequest(context, `purchaseorder/${input.qbo_id}`)).PurchaseOrder;
        if (existing.SyncToken !== String(input.sync_token)) return sendJson(res, 409, { error: 'quickbooks_po_changed_reload_before_review' });
      }
      const draft = normalizePoDraft(input.draft);
      const payload = buildQboPo(draft, existing);
      // Validate references against the selected company; never substitute a default ID.
      if (!/^\d+$/.test(draft.vendor_qbo_id) || draft.line_items.some(line => !/^\d+$/.test(line.qbo_item_id))) return sendJson(res, 400, { error: 'numeric_quickbooks_vendor_and_item_ids_required' });
      const vendor = await qboPoRequest(context, 'query', { query: `select * from Vendor where Id = '${draft.vendor_qbo_id}'` });
      if (!vendor.QueryResponse?.Vendor?.[0]?.Active) return sendJson(res, 400, { error: 'active_quickbooks_vendor_required' });
      draft.vendor_name = vendor.QueryResponse.Vendor[0].DisplayName || draft.vendor_name;
      const ids = [...new Set(draft.line_items.map(line => line.qbo_item_id))];
      const items = (await qboPoRequest(context, 'query', { query: `select * from Item where Id IN (${ids.map(id => `'${id}'`).join(',')}) maxresults 1000` })).QueryResponse?.Item || [];
      for (const id of ids) {
        const item = items.find(item => item.Id === id);
        if (!item?.Active || !item.ExpenseAccountRef) return sendJson(res, 400, { error: 'active_item_with_expense_account_required', item_id: id });
      }
      if (!existing) {
        const escaped = draft.doc_number.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
        const duplicates = await qboPoRequest(context, 'query', { query: `select * from PurchaseOrder where DocNumber = '${escaped}' maxresults 1` });
        if (duplicates.QueryResponse?.PurchaseOrder?.length) return sendJson(res, 409, { error: 'po_number_already_exists_load_it_from_quickbooks_to_update' });
      }
      const id = poTransferId(context.realmId, context.environment, payload);
      const operation = { id, actor_id: actor, realm_id: context.realmId, environment: context.environment, status: 'review',
        draft, payload, qbo_id: existing?.Id || null, sync_token: existing?.SyncToken || null, created_at: new Date().toISOString() };
      await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('qbo_po_transfers',${id},${JSON.stringify(operation)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() WHERE um_rows.data->>'status'='review' AND um_rows.data->>'actor_id'=${actor}`;
      return sendJson(res, 200, { operation_id: id, draft, environment: context.environment, action: existing ? 'update' : 'create' });
    }
    if (input.action === 'publish') {
      if (input.confirmed !== true) return sendJson(res, 400, { error: 'review_confirmation_required' });
      const op = await row(sql, 'qbo_po_transfers', String(input.operation_id));
      if (!op || op.actor_id !== actor || op.realm_id !== context.realmId || op.environment !== context.environment) return sendJson(res, 409, { error: 'preview_again_for_current_user_and_company' });
      if (op.status === 'completed') return sendJson(res, 200, { qbo_id: op.result_id, already_completed: true });
      if (op.status !== 'review') return sendJson(res, 409, { error: 'transfer_outcome_requires_reconciliation_do_not_recreate' });
      if (Date.now() - Date.parse(op.created_at) > 30 * 60000) return sendJson(res, 409, { error: 'preview_expired' });
      if (op.qbo_id) {
        const current = (await qboPoRequest(context, `purchaseorder/${op.qbo_id}`)).PurchaseOrder;
        if (current.SyncToken !== op.sync_token || current.POStatus !== 'Open') return sendJson(res, 409, { error: 'quickbooks_po_changed_reload_before_review' });
      }
      const lockId = poTransferId(context.realmId, context.environment, op.qbo_id ? ['update', op.qbo_id, op.sync_token] : ['create', op.draft.doc_number]);
      const lock = await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('qbo_po_locks',${lockId},${JSON.stringify({ operation_id: op.id })}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`;
      if (!lock.length) return sendJson(res, 409, { error: 'po_transfer_already_started_reconcile_before_retry' });
      const claimed = await sql`UPDATE um_rows SET data=data || '{"status":"posting"}'::jsonb,updated_at=now() WHERE tbl='qbo_po_transfers' AND id=${op.id} AND data->>'status'='review' RETURNING id`;
      if (!claimed.length) return sendJson(res, 409, { error: 'transfer_already_started' });
      // A crash or ambiguous response stays blocked for reconciliation, never automatically reposted.
      const payload = await qboPoRequest(context, 'purchaseorder', { body: op.payload, requestId: op.id });
      if (!payload.PurchaseOrder?.Id) throw new Error('quickbooks_outcome_unknown');
      await sql`UPDATE um_rows SET data=data || ${JSON.stringify({ status: 'completed', result_id: payload.PurchaseOrder.Id, completed_at: new Date().toISOString() })}::jsonb,updated_at=now() WHERE tbl='qbo_po_transfers' AND id=${op.id}`;
      return sendJson(res, 200, { qbo_id: payload.PurchaseOrder.Id });
    }
    return sendJson(res, 400, { error: 'invalid_action' });
  } catch (error) {
    const safe = /^[a-z0-9_]+$/.test(error.message) ? error.message : 'purchase_order_request_failed';
    return sendJson(res, 400, { error: safe, ...(error.tid ? { intuit_tid: error.tid } : {}) });
  }
}
