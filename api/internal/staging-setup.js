import { neon } from '@neondatabase/serverless';
import crypto from 'node:crypto';
import { readRawBody, safeEqual, sendJson } from '../_lib/http.js';
import { planActivationIssue } from '../_lib/customerActivation.js';

const TABLES = new Set(['products','product_variants','categories','warehouses','inventory','shopify_history_rows','organizations','profiles','organization_users','addresses','customer_external_identities','customer_migration_records','marketing_consents','staging_imports']);
export function stagingSetupAllowed(environment, expected, supplied) {
  return environment === 'staging' && Boolean(expected) && Boolean(supplied) && safeEqual(expected, supplied);
}
export function validateStagingRows(rows, run) {
  if (!/^shopify_20260908_[a-f0-9]{12}$/.test(run || '') || !Array.isArray(rows) || !rows.length || rows.length > 200) throw new Error('invalid_batch');
  const seen = new Set();
  for (const row of rows) {
    if (!TABLES.has(row.table) || !row.id || row.id !== row.data?.id || row.data.staging_import_run !== run) throw new Error('invalid_row');
    if (seen.has(`${row.table}:${row.id}`)) throw new Error('duplicate_row');
    seen.add(`${row.table}:${row.id}`);
    if (row.table === 'profiles' && (row.data.role !== 'customer' || row.data.status !== 'pending_activation' || row.data.password || row.data.password_hash)) throw new Error('invalid_customer_profile');
  }
  return rows;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (!stagingSetupAllowed(process.env.UNITE_ENVIRONMENT,process.env.STAGING_SETUP_TOKEN,req.headers['x-staging-setup-token'])) return sendJson(res,404,{error:'not_found'});
  if (!process.env.DATABASE_URL) return sendJson(res,503,{error:'not_configured'});
  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`CREATE TABLE IF NOT EXISTS um_rows(tbl text NOT NULL,id text NOT NULL,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),deleted boolean NOT NULL DEFAULT false,PRIMARY KEY(tbl,id))`;
    const lockId=crypto.createHash('sha256').update(process.env.STAGING_SETUP_TOKEN).digest('hex');
    const locks=await sql`SELECT id FROM um_rows WHERE tbl='staging_setup_locks' AND id=${lockId} AND deleted=false`;
    if(locks.length)return sendJson(res,404,{error:'not_found'});
    if (req.method === 'GET') {
      const counts=await sql`SELECT tbl,count(*)::int AS count FROM um_rows WHERE deleted=false GROUP BY tbl ORDER BY tbl`;
      const imports=await sql`SELECT data FROM um_rows WHERE tbl='staging_imports' AND deleted=false`;
      const database=await sql`SELECT current_database() AS name`;
      const sourceCounts=await sql`SELECT data->>'entity' AS entity,count(*)::int AS count FROM um_rows WHERE tbl='shopify_history_rows' AND deleted=false AND data->>'staging_import_run' IS NOT NULL GROUP BY data->>'entity'`;
      const importedCounts=await sql`SELECT tbl,count(*)::int AS count FROM um_rows WHERE deleted=false AND data->>'staging_import_run' IS NOT NULL GROUP BY tbl`;
      return sendJson(res,200,{environment:'staging',origin:process.env.PUBLIC_APP_ORIGIN,database:database[0].name,counts,imported_counts:importedCounts,source_counts:sourceCounts,imports:imports.map(r=>r.data)});
    }
    if (req.method !== 'POST') return sendJson(res,405,{error:'method_not_allowed'});
    const body=JSON.parse((await readRawBody(req)).toString('utf8'));
    if(body.action==='close'){
      await sql.transaction(tx=>[
        tx`INSERT INTO um_rows(tbl,id,data) VALUES('staging_setup_locks',${lockId},'{"closed":true}'::jsonb) ON CONFLICT DO NOTHING`,
        tx`UPDATE um_rows SET data=data||jsonb_build_object('status','disabled','session_revision',COALESCE((data->>'session_revision')::int,0)+1),updated_at=now() WHERE tbl='profiles' AND id='usr_staging_verification'`,
      ]);
      return sendJson(res,200,{closed:true,verification_account_disabled:true});
    }
    if (['damon_activation','verification_access'].includes(body.action)) {
      const verifying=body.action==='verification_access';
      const email=verifying?'staging-verification@unitemedical.net':'damon@unitemedical.net';
      const old=await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND deleted=false AND lower(data->>'email')=${email}`;
      if(old.length>1) return sendJson(res,409,{error:'duplicate_damon_profiles'});
      const prior=old[0]?.data;
      const profile={...prior,id:prior?.id||(verifying?'usr_staging_verification':'usr_damon_staging'),org_id:prior?.org_id||'org_unite_staging_team',email,name:verifying?'Staging verification':'Damon',role:'admin',roles:['admin'],status:'pending_activation',activation_required:true,session_revision:Number(prior?.session_revision||0)+1};
      delete profile.password;delete profile.password_hash;delete profile.password_salt;
      const issued=planActivationIssue(profile);
      const membership={id:`staging_member_${profile.id}`,user_id:profile.id,org_id:profile.org_id,role:'owner',status:'pending_activation'};
      const rows=[{table:'profiles',id:profile.id,data:profile},{table:'organization_users',id:membership.id,data:membership},{table:'activation_tokens',id:issued.record.id,data:issued.record}];
      await sql.transaction(tx=>[
        tx`INSERT INTO um_rows(tbl,id,data) SELECT 'staging_before_images',${`damon_${Date.now()}`},jsonb_build_object('table',tbl,'id',id,'before',data) FROM um_rows WHERE tbl='profiles' AND id=${profile.id} ON CONFLICT DO NOTHING`,
        ...rows.map(r=>tx`INSERT INTO um_rows(tbl,id,data) VALUES(${r.table},${r.id},${JSON.stringify(r.data)}::jsonb) ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`),
      ]);
      return sendJson(res,200,{email:profile.email,activation_url:`https://staging.unitemedical.net/activate?token=${issued.token}`,expires_at:issued.record.expires_at,mfa_required:true});
    }
    const rows=validateStagingRows(body.rows,body.run_id);
    const encoded=JSON.stringify(rows.map(r=>({tbl:r.table,id:r.id,data:r.data})));
    // Retain a before-image once per import. Existing account credentials and
    // reviewed commercial policies survive refreshed source data.
    const results=await sql.transaction(tx=>[
      tx`INSERT INTO um_rows(tbl,id,data) SELECT 'staging_before_images',${body.run_id}||':'||u.tbl||':'||u.id,jsonb_build_object('table',u.tbl,'id',u.id,'before',u.data,'was_deleted',u.deleted) FROM um_rows u JOIN jsonb_to_recordset(${encoded}::jsonb) AS x(tbl text,id text,data jsonb) ON u.tbl=x.tbl AND u.id=x.id ON CONFLICT DO NOTHING`,
      tx`INSERT INTO um_rows(tbl,id,data) SELECT x.tbl,x.id,x.data FROM jsonb_to_recordset(${encoded}::jsonb) AS x(tbl text,id text,data jsonb)
      ON CONFLICT(tbl,id) DO UPDATE SET data=CASE
        WHEN um_rows.tbl IN ('profiles','organizations','organization_users') THEN EXCLUDED.data || um_rows.data || jsonb_build_object('staging_import_run',${body.run_id})
        ELSE EXCLUDED.data END,deleted=false,updated_at=now() RETURNING tbl,id`,
    ]);
    return sendJson(res,200,{ok:true,applied:results[1].length});
  } catch(error) { return sendJson(res,400,{error:'staging_setup_failed',detail:error.message}); }
}
