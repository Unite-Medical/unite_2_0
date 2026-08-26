import { neon } from '@neondatabase/serverless';
import { planCustomerMigrationBatch } from '../_lib/customerMigration.js';
import { readRawBody, safeEqual, sendJson } from '../_lib/http.js';

export function customerMigrationRequestAllowed({ environment, expected, provided }) {
  return String(environment || '').toLowerCase() === 'staging'
    && Boolean(expected) && Boolean(provided) && safeEqual(expected, provided);
}

async function stats(sql) {
  const rows = await sql`SELECT tbl,COUNT(*)::int AS count FROM um_rows
    WHERE deleted=false AND tbl IN ('customer_migration_records','customer_external_identities','profiles','organizations','organization_users','addresses','marketing_consents','customer_contract_prices')
      AND (data ? 'import_run_id' OR tbl='customer_migration_records')
    GROUP BY tbl ORDER BY tbl`;
  const activation = await sql`SELECT COALESCE(data->>'activation_status','unknown') AS status,COUNT(*)::int AS count
    FROM um_rows WHERE tbl='customer_migration_records' AND deleted=false GROUP BY data->>'activation_status' ORDER BY status`;
  const pricing = await sql`SELECT COALESCE(data->>'pricing_status','unknown') AS status,COUNT(*)::int AS count
    FROM um_rows WHERE tbl='customer_migration_records' AND deleted=false GROUP BY data->>'pricing_status' ORDER BY status`;
  return { tables: Object.fromEntries(rows.map((row) => [row.tbl, row.count])), activation, pricing };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const allowed = customerMigrationRequestAllowed({
    environment: process.env.UNITE_ENVIRONMENT,
    expected: process.env.CUSTOMER_MIGRATION_TOKEN,
    provided: req.headers['x-customer-migration-token'],
  });
  if (!allowed) return sendJson(res, 404, { error: 'not_found' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'database_not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  if (req.method === 'GET') return sendJson(res, 200, { ok: true, ...(await stats(sql)) });
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });

  try {
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const plan = planCustomerMigrationBatch(body);
    const existing = await sql`SELECT data FROM um_rows WHERE tbl='customer_migration_runs' AND id=${plan.run.id} AND deleted=false LIMIT 1`;
    if (existing[0]?.data?.source_sha256 && existing[0].data.source_sha256 !== plan.run.source_sha256) {
      return sendJson(res, 409, { error: 'migration_run_source_mismatch' });
    }
    const run = {
      id: plan.run.id, source_sha256: plan.run.source_sha256, target_environment: 'staging',
      status: 'importing', updated_at: new Date().toISOString(),
    };
    const results = await sql.transaction((txn) => [
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('customer_migration_runs',${run.id},${JSON.stringify(run)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO UPDATE SET data=um_rows.data || EXCLUDED.data,deleted=false,updated_at=now()
        WHERE um_rows.data->>'source_sha256'=${run.source_sha256}`,
      ...plan.rows.map((item) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES (${item.table},${item.id},${JSON.stringify(item.data)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()
        WHERE COALESCE(um_rows.data->>'import_run_id','')=${plan.run.id}`),
    ]);
    const applied = results.slice(1).reduce((total, result) => total + Number(result?.count ?? result?.length ?? 0), 0);
    return sendJson(res, 200, { ok: true, run_id: plan.run.id, source_sha256: plan.run.source_sha256, planned_rows: plan.rows.length, applied_rows: applied, summary: plan.summary });
  } catch (error) {
    const message = String(error?.message || 'customer_migration_failed');
    return sendJson(res, /required|duplicate|batch|SHA/.test(message) ? 400 : 500, { error: 'customer_migration_failed', detail: message });
  }
}
