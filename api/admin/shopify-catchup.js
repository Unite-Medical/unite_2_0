import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { sendJson } from '../_lib/http.js';
import { SERVICES } from '../_lib/services.js';
import { normalizeShopifyId, planShopifyCatchup, shopifyCatchupHash } from '../_lib/shopifyCatchup.js';

export const CATCHUP_TARGET = Object.freeze({ project: 'prj_PL5BOZooLBtLiPQlrn34SyC0MRKS', origin: 'https://staging.unitemedical.net', org: 'org_unite_staging_team' });
// Initial approved scope, not a moving order-number/date range. Never accept IDs from requests.
export const CATCHUP_IDS = Object.freeze([
  '18957851787430', '18957849526438', '18957332611238', '18955319050406', '18955221270694', '18948708040870',
  '18948362862758', '18946812903590', '18946243526822', '18944806781094', '18944515375270', '18942543921318',
  '18941365682342', '18941103866022', '18941102456998', '18941101211814', '18941098918054', '18940940353702',
  '18940590325926', '18940516139174', '18940377268390', '18934769647782', '18933694398630', '18933684928678',
  '18930911051942', '18930896666790', '18930818318502', '18930815893670', '18929131946150', '18927521726630',
  '18927109800102', '18927008481446', '18925972684966', '18921839329446', '18919618936998', '18919135871142',
  '18917589385382', '18916276109478', '18915455959206', '18913106919590', '13007116370086', '13007114272934',
  '13007111159974', '13007109718182', '13007107817638', '13007105687718', '13007103787174', '13005542523046',
]);
const CONFIRM = 'IMPORT_48_HISTORICAL_SHOPIFY_ORDERS';
const MAX_BODY = 2048;
const MAX_SOURCE = 8 * 1024 * 1024;
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Metadata is compared again under a table lock before any INSERT. No schema changes.
const IDENTITY_SQL = `SELECT current_database() AS database_name, current_schema() AS schema_name,
  c.oid::text AS relation_oid, c.relkind, c.relrowsecurity AS row_security, c.relispartition AS partitioned,
  EXISTS(SELECT 1 FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid) AS inherited,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgname)
    FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal),'[]'::jsonb) AS user_triggers,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('name',rulename,'definition',pg_get_ruledef(oid)) ORDER BY rulename)
    FROM pg_rewrite WHERE ev_class=c.oid),'[]'::jsonb) AS rules
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.oid=to_regclass('public.um_rows') AND n.nspname='public'`;

// Include tombstones, aliases and number collisions so insert-only never resurrects or overwrites.
const SNAPSHOT_SQL = `SELECT tbl,id,data,deleted FROM public.um_rows WHERE
  (tbl='commerce_orders' AND (id=ANY($1::text[]) OR data->>'id'=ANY($1::text[])
    OR data->>'shopify_order_id'=ANY($1::text[]) OR data->>'source_order_id'=ANY($1::text[])
    OR data->'source'->>'id'=ANY($1::text[]) OR data->'catchup_import'->>'source_order_id'=ANY($1::text[])
    OR data->>'number'=ANY($2::text[])))
  OR (tbl='commerce_customers' AND id=ANY($3::text[]))
  OR (tbl='commerce_products' AND (id=ANY($4::text[]) OR data->>'variant_id'=ANY($4::text[])))
  OR (tbl='audit_log' AND id=$5) ORDER BY tbl,id`;

function assertMetadata(identity) {
  if (!identity || identity.schema_name !== 'public' || identity.relkind !== 'r' || identity.row_security || identity.partitioned || identity.inherited
    || !Array.isArray(identity.user_triggers) || identity.user_triggers.length || !Array.isArray(identity.rules) || identity.rules.length) fail('database_relation_requires_review');
}
export function catchupTargetFingerprint(connection, identity) {
  const url = new URL(connection);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname) fail('invalid_database_target', 503);
  // Password, username, query-string tokens, DB name and host are never returned.
  return shopifyCatchupHash({ host: url.hostname.toLowerCase().replace(/-pooler(?=\.)/, ''), port: url.port || '5432',
    database: decodeURIComponent(url.pathname.slice(1)), actual_database: identity.database_name, schema: identity.schema_name });
}
function publicIdentity(connection, identity) {
  return { target_fingerprint: catchupTargetFingerprint(connection, identity), schema: identity.schema_name,
    relation: { kind: identity.relkind, row_security: identity.row_security, partitioned: identity.partitioned, inherited: identity.inherited,
      user_triggers: identity.user_triggers.map(t => ({ name: t.name, enabled: t.enabled })), rules: identity.rules.map(r => ({ name: r.name })) },
    scope_count: 48, allowed_ids_sha256: shopifyCatchupHash([...CATCHUP_IDS].sort()) };
}
async function boundedBody(req) {
  if (Number(req.headers?.['content-length'] || 0) > MAX_BODY) fail('request_too_large', 413);
  let raw;
  if (req.body != null) raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  else { const chunks = []; let size = 0; for await (const chunk of req) { const b = Buffer.from(chunk); size += b.length; if (size > MAX_BODY) fail('request_too_large', 413); chunks.push(b); } raw = Buffer.concat(chunks); }
  if (raw.length > MAX_BODY) fail('request_too_large', 413);
  let body;
  const type = String(req.headers?.['content-type'] || '').split(';')[0];
  if (type === 'application/x-www-form-urlencoded' && (!req.body || typeof req.body === 'string' || Buffer.isBuffer(req.body))) {
    const params = new URLSearchParams(raw.toString('utf8'));
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) fail('duplicate_request_field', 400);
    body = Object.fromEntries(params);
  } else if (['application/json', 'application/x-www-form-urlencoded'].includes(type)) {
    try { body = JSON.parse(raw.toString('utf8')); } catch { fail('invalid_request_json', 400); }
  } else fail('unsupported_content_type', 415);
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !['action','run_id','target_fingerprint','baseline_plan_sha256','confirm','view'].includes(key))) fail('invalid_request_fields', 400);
  for (const value of Object.values(body)) if (typeof value !== 'string') fail('invalid_request_value', 400);
  if (body.action !== 'apply' || body.confirm !== CONFIRM || !/^[a-f0-9]{64}$/.test(body.target_fingerprint || '') || !/^[a-f0-9]{64}$/.test(body.baseline_plan_sha256 || '')) fail('explicit_target_and_plan_confirmation_required', 400);
  return body;
}
async function refreshSource(service, fetchImpl, env) {
  if (!service.configured()) fail('shopify_read_connection_unavailable', 503);
  const version = env.SHOPIFY_API_VERSION || '2026-04';
  if (!/^20\d\d-\d\d$/.test(version)) fail('invalid_shopify_version', 503);
  const path = `/admin/api/${version}/orders.json`;
  const url = new URL(service.buildUrl(path, { ids: CATCHUP_IDS.join(','), status: 'any', limit: 250 }));
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.myshopify.com') || url.pathname !== path || url.searchParams.get('ids') !== CATCHUP_IDS.join(',')) fail('invalid_shopify_read_target', 503);
  const response = await fetchImpl(url.href, { method: 'GET', headers: await service.headers(), redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) fail('shopify_source_refresh_failed', 502);
  if (Number(response.headers?.get('content-length') || 0) > MAX_SOURCE) fail('shopify_source_too_large', 502);
  let text = '';
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const chunks = []; let bytes = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > MAX_SOURCE) fail('shopify_source_too_large', 502); chunks.push(Buffer.from(part.value)); } }
    finally { await reader.cancel(); }
    text = Buffer.concat(chunks).toString('utf8');
  } else text = await response.text();
  if (Buffer.byteLength(text) > MAX_SOURCE) fail('shopify_source_too_large', 502);
  let payload; try { payload = JSON.parse(text); } catch { fail('invalid_shopify_source', 502); }
  const orders = payload.orders;
  if (!Array.isArray(orders) || orders.length !== 48) fail('source_scope_mismatch', 502);
  const sourceIds = orders.map(order => normalizeShopifyId(order.id)).sort();
  if (new Set(sourceIds).size !== 48 || shopifyCatchupHash(sourceIds) !== shopifyCatchupHash([...CATCHUP_IDS].sort())) fail('source_scope_mismatch', 502);
  return orders.sort((a,b) => normalizeShopifyId(a.id).localeCompare(normalizeShopifyId(b.id)));
}
function snapshotParams(orders, runId) {
  const aliases = values => [...new Set(values.flatMap(([id, kind]) => [id, `gid://shopify/${kind}/${id}`]))];
  return [aliases(CATCHUP_IDS.map(id => [id,'Order'])), orders.map(order => order.name).filter(Boolean),
    aliases(orders.filter(order => order.customer?.id).map(order => [normalizeShopifyId(order.customer.id,'Customer'),'Customer'])),
    aliases(orders.flatMap(order => order.line_items || []).filter(line => line.variant_id).map(line => [normalizeShopifyId(line.variant_id,'ProductVariant'),'ProductVariant'])),
    'shopify-catchup:' + runId];
}
function summary(plan) {
  return { ok: plan.ok, status: plan.status, run_id: plan.run_id, counts: plan.counts, conflicts: plan.conflicts,
    skipped: plan.skipped, orders: plan.inserts.map(({ data: o }) => ({ id:o.id, number:o.number, total:o.total, currency:o.currency,
      financial_status:o.financial_status, fulfillment_status:o.fulfillment_status, workflow_state:o.workflow_state,
      customer_mapping_status:o.customer_mapping_status, line_count:o.lines.length })) };
}
function sendHtml(res, status, content) {
  res.statusCode = status; res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Shopify staging catch-up</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:16px;line-height:1.5}table{border-collapse:collapse;width:100%}td,th{padding:8px;text-align:left;border-bottom:1px solid #ccc}code{overflow-wrap:anywhere}button{font:inherit;padding:12px;margin-top:20px}</style><main>' + content + '</main></html>');
}
function htmlPlan(payload) {
  const fields = { action:'apply', view:'html', run_id:payload.run_id, target_fingerprint:payload.target_fingerprint, baseline_plan_sha256:payload.baseline_plan_sha256 };
  return '<h1>Staging Shopify catch-up</h1><p>Fixed approved scope: 48 historical orders. ' + escape(payload.counts.insert) + ' inserts, ' + escape(payload.counts.skipped) + ' unchanged skips, ' + escape(payload.counts.blocked) + ' blocked.</p><p>Target fingerprint: <code>' + escape(payload.target_fingerprint) + '</code></p><p>Plan: <code>' + escape(payload.baseline_plan_sha256) + '</code></p><table><thead><tr><th>Order</th><th>Source payment</th><th>Fulfillment</th><th>Customer mapping</th></tr></thead><tbody>' + payload.orders.map(o=>'<tr><td>'+escape(o.number)+'</td><td>'+escape(o.financial_status)+'</td><td>'+escape(o.fulfillment_status)+'</td><td>'+escape(o.customer_mapping_status)+'</td></tr>').join('') + '</tbody></table>' + (payload.ok ? '<form method="post" action="/api/admin/shopify-catchup">' + Object.entries(fields).map(([name,value])=>'<input type="hidden" name="'+escape(name)+'" value="'+escape(value)+'">').join('') + '<p><label><input type="checkbox" name="confirm" value="'+CONFIRM+'" required> Confirm this staging target and plan for the approved 48 historical orders.</label></p><button type="submit">Import approved orders</button></form>' : '<p>Import blocked. Review the conflict IDs and refresh.</p><pre>'+escape(JSON.stringify(payload.conflicts,null,2))+'</pre>');
}

export function createShopifyCatchupHandler({ env=process.env, sqlFactory=neon, authorize=authorizeLiveRequest, service=SERVICES.shopify, fetchImpl=fetch, now=()=>new Date() } = {}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store, private'); res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    let html = req.query?.view === 'html';
    try {
      if (!['GET','POST'].includes(req.method)) fail('method_not_allowed',405);
      if (env.VERCEL_PROJECT_ID !== CATCHUP_TARGET.project || env.PUBLIC_APP_ORIGIN !== CATCHUP_TARGET.origin || req.headers?.host !== new URL(CATCHUP_TARGET.origin).host) fail('staging_target_required',403);
      if (!env.DATABASE_URL) fail('database_not_configured',503);
      const sql = sqlFactory(env.DATABASE_URL);
      const live = await authorize(req,sql,{roles:['admin']});
      if (!live.ok) fail(live.reason === 'authentication_required' ? 'authentication_required' : 'admin_mfa_session_required',live.reason === 'authentication_required' ? 401 : 403);
      if (live.session.role !== 'admin' || live.session.mfa_verified !== true || live.session.org_id !== CATCHUP_TARGET.org) fail('staging_admin_mfa_session_required',403);
      if (req.method === 'POST' && req.headers.origin !== CATCHUP_TARGET.origin) fail('same_origin_required',403);
      const body = req.method === 'POST' ? await boundedBody(req) : null;
      html ||= body?.view === 'html';
      const action = req.method === 'POST' ? 'apply' : req.query?.action || (html ? 'dry_run' : 'identity');
      if (!['identity','dry_run','apply'].includes(action)) fail('unknown_action',400);
      const identityResult = await sql.transaction(tx=>[tx.query(IDENTITY_SQL)],{readOnly:true,isolationLevel:'RepeatableRead'});
      const identity = identityResult[0][0];
      if (!identity) fail('database_relation_missing',409);
      const target = publicIdentity(env.DATABASE_URL,identity);
      if (action === 'identity') return sendJson(res,200,{ok:true,...target,apply_allowed:identity.relkind==='r'&&!identity.row_security&&!identity.partitioned&&!identity.inherited&&!identity.user_triggers.length&&!identity.rules.length});
      assertMetadata(identity);
      if (body && body.target_fingerprint !== target.target_fingerprint) fail('target_fingerprint_mismatch');
      const runId = body?.run_id || req.query?.run_id || 'staging48-' + crypto.randomUUID();
      if (typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(runId)) fail('invalid_run_id',400);
      const orders = await refreshSource(service,fetchImpl,env), retrievedAt = now().toISOString();
      const params = snapshotParams(orders,runId);
      const read = await sql.transaction(tx=>[tx.query(IDENTITY_SQL),tx.query(SNAPSHOT_SQL,params)],{readOnly:true,isolationLevel:'RepeatableRead'});
      if (shopifyCatchupHash(read[0][0]) !== shopifyCatchupHash(identity)) fail('database_identity_changed');
      const snapshot = read[1];
      const baseline = shopifyCatchupHash({ version:1, target:target.target_fingerprint, allowed_ids:[...CATCHUP_IDS].sort(), source:orders, destination:snapshot });
      const plan = planShopifyCatchup({ allowedIds:CATCHUP_IDS,sourceOrders:orders,
        existingOrders:snapshot.filter(r=>r.tbl==='commerce_orders'),customers:snapshot.filter(r=>r.tbl==='commerce_customers'),products:snapshot.filter(r=>r.tbl==='commerce_products'),
        runId,retrievedAt,actor:{user_id:live.session.user_id,org_id:live.session.org_id},baselinePlanHash:body?.baseline_plan_sha256 || baseline,pendingCustomerOrderIds:['18930818318502'] });
      const payload = {...summary(plan),...target,baseline_plan_sha256:baseline,source_retrieved_at:retrievedAt,source_payload_sha256:shopifyCatchupHash(orders)};
      if (action === 'dry_run') return html ? sendHtml(res,plan.ok?200:409,htmlPlan(payload)) : sendJson(res,plan.ok?200:409,payload);
      if (!plan.ok) fail('historical_import_conflicts');
      // Replay only the same fully imported run with unchanged rows/source and the original signed-off baseline.
      const auditRow = snapshot.find(r=>r.tbl==='audit_log'&&r.id===params[4]);
      const replay = plan.counts.skipped===48 && auditRow && !auditRow.deleted
        && auditRow.data.baseline_plan_sha256===body.baseline_plan_sha256 && auditRow.data.target_fingerprint===target.target_fingerprint
        && auditRow.data.source_payload_sha256===payload.source_payload_sha256
        && snapshot.filter(r=>r.tbl==='commerce_orders').every(r=>r.data.catchup_import?.run_id===runId&&r.data.catchup_import?.baseline_plan_sha256===body.baseline_plan_sha256);
      if (body.baseline_plan_sha256!==baseline && !replay) fail('baseline_plan_changed_refresh_dry_run');
      if (!plan.inserts.length) {
        const result = {ok:true,status:'unchanged_replay',run_id:runId,inserted:0,skipped:plan.counts.skipped,target_fingerprint:target.target_fingerprint};
        return html?sendHtml(res,200,'<h1>Orders already imported</h1><p>48 unchanged historical orders verified.</p><p><a href="/admin/orders">Open staging orders</a></p>'):sendJson(res,200,result);
      }
      if (auditRow) fail('run_id_already_used');
      const audit = {id:params[4],kind:'shopify_historical_catchup',run_id:runId,actor_id:live.session.user_id,org_id:live.session.org_id,at:retrievedAt,
        target_fingerprint:target.target_fingerprint,baseline_plan_sha256:baseline,source_payload_sha256:payload.source_payload_sha256,
        allowed_ids_sha256:target.allowed_ids_sha256,created_ids:plan.inserts.map(r=>r.id),record_hashes:plan.inserts.map(r=>({id:r.id,sha256:r.data.catchup_import.record_sha256}))};
      const expectedSnapshot = JSON.stringify(snapshot);
      await sql.transaction(tx=>[
        tx.query("SET LOCAL lock_timeout='5s'"),tx.query("SET LOCAL statement_timeout='15s'"),
        tx.query('LOCK TABLE public.um_rows IN SHARE ROW EXCLUSIVE MODE'),
        tx.query(`SELECT 1 / CASE WHEN (SELECT to_jsonb(i) FROM (${IDENTITY_SQL}) i)=$1::jsonb THEN 1 ELSE 0 END AS identity_unchanged`,[JSON.stringify(identity)]),
        tx.query(`SELECT 1 / CASE WHEN COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY tbl,id) FROM (${SNAPSHOT_SQL}) s),'[]'::jsonb)=$6::jsonb THEN 1 ELSE 0 END AS snapshot_unchanged`,[...params,expectedSnapshot]),
        tx.query("SELECT 1 / CASE WHEN EXISTS(SELECT 1 FROM public.um_rows WHERE tbl='profiles' AND id=$1 AND deleted=false AND data=$2::jsonb) THEN 1 ELSE 0 END AS profile_unchanged",[live.session.user_id,JSON.stringify(live.profile)]),
        tx.query("INSERT INTO public.um_rows(tbl,id,data,deleted,updated_at) SELECT 'commerce_orders',x.id,x.data,false,now() FROM jsonb_to_recordset($1::jsonb) AS x(id text,data jsonb) ON CONFLICT(tbl,id) DO NOTHING RETURNING id",[JSON.stringify(plan.inserts)]),
        tx.query("INSERT INTO public.um_rows(tbl,id,data,deleted,updated_at) VALUES('audit_log',$1,$2::jsonb,false,now())",[audit.id,JSON.stringify(audit)]),
        tx.query("SELECT 1 / CASE WHEN (SELECT COUNT(*) FROM public.um_rows u JOIN jsonb_to_recordset($1::jsonb) AS x(id text,data jsonb) ON u.tbl='commerce_orders' AND u.id=x.id AND u.data=x.data AND u.deleted=false)=$2 THEN 1 ELSE 0 END AS all_inserted",[JSON.stringify(plan.inserts),plan.inserts.length]),
      ],{isolationLevel:'ReadCommitted',readOnly:false});
      const result = {ok:true,status:'imported',run_id:runId,inserted:plan.inserts.length,skipped:plan.counts.skipped,target_fingerprint:target.target_fingerprint,baseline_plan_sha256:baseline};
      return html?sendHtml(res,200,'<h1>Historical orders imported</h1><p>'+escape(result.inserted)+' inserted; '+escape(result.skipped)+' unchanged skips.</p><p><a href="/admin/orders">Open staging orders</a></p>'):sendJson(res,200,result);
    } catch(error) {
      // Never return raw DB/provider errors, request bodies, credentials, host or database names.
      const known = Number.isInteger(error.status);
      const status = known?error.status:409;
      const message = known?error.message:'catchup_not_applied_refresh_and_review';
      return html?sendHtml(res,status,'<h1>Catch-up paused</h1><p>'+escape(message)+'</p><p><a href="/api/admin/shopify-catchup?view=html">Refresh dry-run</a></p>'):sendJson(res,status,{ok:false,error:message});
    }
  };
}
export default createShopifyCatchupHandler();
