import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { planActivationIssue } from '../_lib/customerActivation.js';
import { readRawBody, sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return sendJson(res,405,{error:'method_not_allowed'});
  if (!process.env.DATABASE_URL) return sendJson(res,503,{error:'not_configured'});
  const sql=neon(process.env.DATABASE_URL);
  try {
    const live=await authorizeLiveRequest(req,sql,{roles:['admin']});
    if(!live.ok) return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    const body=JSON.parse((await readRawBody(req)).toString('utf8')||'{}');
    const profileId=String(body.profile_id||'');
    const profiles=await sql`SELECT data FROM um_rows WHERE tbl='profiles' AND id=${profileId} AND deleted=false LIMIT 1`;
    const plan=planActivationIssue(profiles[0]?.data);
    if(!plan.ok) return sendJson(res,400,{error:plan.reason});
    const results=await sql.transaction((txn)=>[
      txn`UPDATE um_rows SET data=data || ${JSON.stringify({activation_issued_at:plan.record.created_at})}::jsonb,updated_at=now()
        WHERE tbl='profiles' AND id=${profileId} AND deleted=false AND data->>'status'='pending_activation'
          AND COALESCE((data->>'session_revision')::int,0)=${plan.record.profile_revision} RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('activation_tokens',${plan.record.id},${JSON.stringify(plan.record)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
    ]);
    if(!results[0]?.length||!results[1]?.length) return sendJson(res,409,{error:'activation_changed_retry'});
    const origin=process.env.PUBLIC_SITE_URL || 'https://staging.unitemedical.net';
    return sendJson(res,201,{ok:true,profile_id:profileId,expires_at:plan.record.expires_at,activation_url:`${origin.replace(/\/$/,'')}/activate?token=${encodeURIComponent(plan.token)}`,delivery:'admin_preview_only'});
  } catch { return sendJson(res,500,{error:'activation_issue_failed'}); }
}
