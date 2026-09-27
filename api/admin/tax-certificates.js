import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody,sendJson } from '../_lib/http.js';
import { planTaxCertificateReview } from '../_lib/taxCertificates.js';

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL) return sendJson(res,503,{error:'not_configured'});
  const sql=neon(process.env.DATABASE_URL);
  try{
    const live=await authorizeLiveRequest(req,sql,{roles:['admin']});
    if(!live.ok) return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    const body=JSON.parse((await readRawBody(req)).toString('utf8')||'{}');
    if(!['approve','reject'].includes(body.action)||!String(body.reason||'').trim())return sendJson(res,400,{error:'review_action_and_reason_required'});
    const versionId=String(body.version_id||'');
    const rows=await sql`SELECT data FROM um_rows WHERE tbl='tax_certificate_versions' AND id=${versionId} AND deleted=false LIMIT 1`;
    const current=rows[0]?.data; const plan=planTaxCertificateReview({version:current,action:body.action,scan_result:body.scan_result,scan_evidence:body.scan_evidence,actorId:live.session.user_id});
    if(plan.ok)plan.version.review_reason=String(body.reason).trim().slice(0,4000);
    if(!plan.ok) return sendJson(res,400,{error:plan.reason});
    const audit={id:crypto.randomUUID(),kind:'certificate.reviewed',actor_id:live.session.user_id,ref_id:versionId,payload:{action:body.action,reason:plan.version.review_reason},created_at:plan.version.reviewed_at};
    const updated=await sql`WITH changed AS (
      UPDATE um_rows SET data=${JSON.stringify(plan.version)}::jsonb,updated_at=now()
      WHERE tbl='tax_certificate_versions' AND id=${versionId} AND deleted=false AND data=${JSON.stringify(current)}::jsonb RETURNING id
    ), parent AS (
      UPDATE um_rows SET data=data || ${JSON.stringify({status:body.action==='approve'?'approved':'rejected',certificate_status:plan.version.review_status,updated_at:plan.version.reviewed_at})}::jsonb,updated_at=now()
      WHERE tbl='tax_certificates' AND id=${String(current.certificate_id)} AND deleted=false AND data->>'current_version_id'=${versionId} AND EXISTS(SELECT 1 FROM changed) RETURNING id
    ) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM changed RETURNING id`;
    if(!updated.length) return sendJson(res,409,{error:'certificate_changed_retry'});
    return sendJson(res,200,{ok:true,version_id:versionId,scan_status:plan.version.scan_status,review_status:plan.version.review_status});
  }catch{return sendJson(res,500,{error:'certificate_review_failed'});}
}
