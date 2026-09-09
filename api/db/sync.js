import { RETAINED_TABLES } from '../_lib/retention.js';
import { projectSyncPage } from '../_lib/syncPage.js';
/**
 * Durable persistence — PRD-13 (interim row-store).
 *
 *   GET  /api/db/sync                     → full snapshot { tables: { orders: [rows] } }
 *   GET  /api/db/sync?since=<iso>         → rows changed after <iso> (incremental pull)
 *   POST /api/db/sync { mutations: [...] }→ write-through from the SPA
 *
 * Backed by Neon Postgres over HTTP (`@neondatabase/serverless` — no
 * TCP pooling problems in serverless). The storage model is a single
 * JSONB row-store mirroring the app's table/row shape exactly:
 *
 *   um_rows (tbl, id, data jsonb, updated_at, deleted)
 *
 * Why JSONB instead of the relational blueprints in
 * docs/schema/migrations/? Zero drift: the SPA's runtime rows persist
 * as-is, refreshes/devices share one durable state, and the relational
 * schema remains the contract for the dedicated API tier later
 * (scripts/migrate.mjs applies it when that cutover starts).
 *
 * Auth: signed privileged sessions may use raw sync. Automated server jobs
 * may instead send the server-only DB_SYNC_TOKEN as x-sync-token.
 */

import { neon } from '@neondatabase/serverless';
import { readRawBody, sendJson, safeEqual, logEvent } from '../_lib/http.js';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { canUseRawSync } from '../_lib/rowStore.js';
import { minimumSellPrice } from '../../src/lib/commercialPolicy.js';

export const RAW_SYNC_SERVER_OWNED_TABLES = new Set([
  'profiles', 'organizations', 'organization_users', 'account_payment_methods',
  'customer_contract_prices', 'account_prices', 'pricing', 'pricing_rules', 'volume_breaks',
  'tier_contracts', 'payment_methods', 'addresses', 'rep_order_grants', 'account_notification_recipients',
  'quotes', 'quote_revisions', 'quote_acceptances', 'quote_acceptance_evidence', 'quote_signer_challenges',
  'orders', 'order_items', 'order_batches', 'invoices', 'payments', 'payment_requests', 'shipments',
  'returns', 'rmas', 'purchase_orders', 'po_receipts', 'lots', 'inventory', 'inventory_lots',
  'stock_movements', 'reservations', 'scan_events', 'lot_tracking', 'receipt_locks',
  'consignment_movements', 'settlement_candidates', 'consignment_settlement_links',
  'distributor_pickups', 'distributor_pickup_events', 'distributor_notifications',
  'distributor_products', 'settlement_agreements', 'vendor_bills', 'vendor_bill_variances',
  'ap_intake', 'settlement_payments', 'ar_payments', 'accounting_reconciliation',
  'customerio_outbox', 'customerio_events', 'gmail_outbox', 'notification_outbox',
  'audit_log', 'tasks', 'auth_login_limits', 'registration_locks', 'system_health', 'webhook_events',
]);
export const RAW_SYNC_ADMIN_ALLOWED_TABLES = new Set([
  'categories', 'products', 'leads', 'contacts', 'activities',
  'blog_posts', 'cms_pages', 'banners', 'doc_requests', 'vendors',
  'ai_usage', 'surplus_submissions', 'surplus_lines', 'vendor_evidence',
  'product_compliance', 'compliance_events', 'daily_digests', 'trade_records',
  'shortage_requests', 'reps', 'calendar_events', 'documents', 'exchange_rates',
  'cross_references', 'quote_misses', 'sourcing_requests', 'vendor_offers',
  'recall_notice_drafts', 'gs1_prefixes', 'udi_records', 'labeler_acknowledgments',
]);

export function rawSyncMutationAllowed(mutation, { serviceAccess = false } = {}) {
  if (serviceAccess) return true;
  const table = mutation?.table;
  if (!table || RAW_SYNC_SERVER_OWNED_TABLES.has(table) || !RAW_SYNC_ADMIN_ALLOWED_TABLES.has(table)) return false;
  if (table === 'products' && mutation?.op === 'delete') return false;
  return true;
}

export function validateAdminProductMutation(existing = {}, row = {}, op = 'upsert') {
  if (op === 'delete') return { ok: false, reason: 'dedicated_mutation_endpoint_required' };
  const effective = { ...existing, ...(row || {}) };
  const cost = Number(effective.landed_cost ?? effective.cogs ?? effective.unit_cost ?? effective.cost);
  const price = Number(effective.price);
  if (!effective.quote_only && (!(cost > 0) || !(price > 0))) return { ok: false, reason: 'product_cost_and_price_required' };
  const floor = cost > 0 ? minimumSellPrice(cost) : 0;
  if (price > 0 && cost > 0 && price + 1e-9 < floor) return { ok: false, reason: 'margin_floor_violation', minimum_price: floor };
  return { ok: true, product: effective };
}

let schemaReady = false;

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url);
}

async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS um_rows (
      tbl        TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted    BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (tbl, id)
    )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_um_rows_updated ON um_rows (updated_at DESC)`;
  schemaReady = true;
}

function serviceAuthorized(req) {
  const token = process.env.DB_SYNC_TOKEN;
  if (!token) return false;
  const given = req.headers['x-sync-token'];
  return Boolean(given) && safeEqual(given, token);
}

export default async function handler(req, res) {
  const sql = client();
  if (!sql) {
    return sendJson(res, 503, { error: 'not_configured', hint: 'Set DATABASE_URL to enable durable persistence.' });
  }
  const serviceAccess = serviceAuthorized(req);
  let session = null;
  if (!serviceAccess) {
    try {
      const live = await authorizeLiveRequest(req, sql, { roles: ['admin'] });
      if (!live.ok) return sendJson(res, live.reason === 'authentication_required' ? 401 : 403, { error: live.reason });
      session = live.session;
    } catch {
      return sendJson(res, 503, { error: 'authorization_unavailable' });
    }
  }
  if (!serviceAccess && !canUseRawSync(session)) return sendJson(res, 403, { error: 'raw_sync_forbidden' });

  try {
    await ensureSchema(sql);

    if (req.method === 'GET') {
      const since = req.query.since ? new Date(req.query.since) : null;
      const cursor=req.query.cursor?JSON.parse(Buffer.from(String(req.query.cursor),'base64url').toString('utf8')):null;
      const cutoff=cursor?.cutoff||new Date().toISOString();
      if(!Number.isFinite(Date.parse(cutoff))||(since&&Number.isNaN(since.getTime())))return sendJson(res,400,{error:'invalid_cursor'});
      const rows=await sql`SELECT tbl,id,data,updated_at,updated_at::text AS cursor_at,deleted FROM um_rows
        WHERE updated_at<=${cutoff}::timestamptz
        AND (${Boolean(since)} OR deleted=false)
        AND updated_at>${since?since.toISOString():'1970-01-01T00:00:00Z'}::timestamptz
        AND (updated_at,tbl,id)>(${cursor?.at||'1970-01-01T00:00:00Z'}::timestamptz,${cursor?.table||''},${cursor?.id||''})
        ORDER BY updated_at,tbl,id LIMIT 501`;
      return sendJson(res,200,projectSyncPage(rows,{since,serviceAccess,cutoff}));
    }

    if (req.method === 'POST') {
      const raw = await readRawBody(req);
      const { mutations = [] } = JSON.parse(raw.toString('utf8') || '{}');
      if (!Array.isArray(mutations) || mutations.length === 0) {
        return sendJson(res, 400, { error: 'no_mutations' });
      }
      if (mutations.length > 500) return sendJson(res, 413, { error: 'batch_too_large', max: 500 });
      if (!serviceAccess) {
        const protectedTables = [...new Set(mutations.filter((mutation) => !rawSyncMutationAllowed(mutation)).map((mutation) => mutation?.table || 'unknown'))];
        if (protectedTables.length) return sendJson(res, 403, { error: 'dedicated_mutation_endpoint_required', tables: protectedTables });
      }

      let applied = 0;
      for (const m of mutations) {
        const { table, op, id, row } = m || {};
        if (!table || !id) continue;
        if (!serviceAccess && table === 'products' && op !== 'delete') {
          const existingRows = await sql`SELECT data FROM um_rows WHERE tbl='products' AND id=${String(id)} AND deleted=false LIMIT 1`;
          const validation = validateAdminProductMutation(existingRows[0]?.data || {}, row, op);
          if (!validation.ok) return sendJson(res, 400, { error: validation.reason, id: String(id), minimum_price: validation.minimum_price });
        }
        // Operational history is never deleted through generic synchronization.
        if(op==='delete'&&RETAINED_TABLES.has(table))return sendJson(res,403,{error:'retained_record_requires_dedicated_review'});
        if (op === 'delete') {
          const deletion=await sql.transaction(txn=>[
            txn`SELECT pg_advisory_xact_lock(hashtext('unite-retention-policy'))`,
            txn`INSERT INTO um_rows(tbl,id,data,deleted,updated_at)
              SELECT ${table},${String(id)},'{}'::jsonb,true,now()
              WHERE NOT EXISTS(SELECT 1 FROM um_rows WHERE tbl='legal_holds' AND deleted=false AND data->>'status'='active' AND data->>'table' IN (${table},'*') AND (NULLIF(data->>'record_id','') IS NULL OR data->>'record_id'=${String(id)}))
              ON CONFLICT(tbl,id) DO UPDATE SET deleted=true,updated_at=now() WHERE COALESCE(um_rows.data->>'legal_hold','false')<>'true' RETURNING id`
          ]);
          if(!deletion[1]?.length)return sendJson(res,403,{error:'legal_hold_active'});
        } else {
          await sql`
            INSERT INTO um_rows (tbl, id, data, deleted, updated_at)
            VALUES (${table}, ${String(id)}, ${JSON.stringify(row)}::jsonb, false, now())
            ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now()`;
        }
        applied += 1;
      }
      logEvent('db.sync', 'applied', { mutations: applied });
      return sendJson(res, 200, { ok: true, applied });
    }

    return sendJson(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    logEvent('db.sync', 'error', { error: err.message });
    return sendJson(res, 500, { error: 'db_error', detail: err.message });
  }
}
