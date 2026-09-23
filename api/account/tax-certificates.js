import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';
import { planTaxCertificateVersion, validateTaxCertificateFile } from '../_lib/taxCertificates.js';

const EXT={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)) return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL||(req.method==='POST'&&!process.env.BLOB_READ_WRITE_TOKEN)) return sendJson(res,503,{error:'private_storage_not_configured'});
  const sql=neon(process.env.DATABASE_URL);
  try{
    const live=await authorizeLiveRequest(req,sql,{roles:['customer','distributor','admin']});
    if(!live.ok) return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    const requestedOrg=String(req.headers['x-organization-id']||live.session.org_id||'');
    if(!requestedOrg) return sendJson(res,400,{error:'organization_required'});
    if(live.session.role!=='admin'&&requestedOrg!==String(live.session.org_id||'')) return sendJson(res,403,{error:'organization_mismatch'});
    if(live.session.role!=='admin'){
      const members=await sql`SELECT id FROM um_rows WHERE tbl='organization_users' AND deleted=false AND data->>'org_id'=${requestedOrg} AND data->>'user_id'=${String(live.session.user_id)} AND data->>'status'='active' LIMIT 1`;
      if(!members.length) return sendJson(res,403,{error:'membership_inactive'});
    }
    if(req.method==='GET'){
      const rows=await sql`SELECT data FROM um_rows WHERE tbl='tax_certificate_versions' AND deleted=false AND data->>'org_id'=${requestedOrg} ORDER BY data->>'uploaded_at' DESC LIMIT 50`;
      return sendJson(res,200,{ok:true,documents:rows.map(({data})=>({id:data.id,uploaded_at:data.uploaded_at,review_status:data.review_status,scan_status:data.scan_status}))});
    }
    const bytes=await readRawBody(req); const contentType=String(req.headers['content-type']||'').split(';')[0].toLowerCase();
    const validation=validateTaxCertificateFile({bytes,contentType,size:bytes.length});
    if(!validation.ok) return sendJson(res,400,{error:validation.reason});
    const existingHash=crypto.createHash('sha256').update(bytes).digest('hex');
    const existing=await sql`SELECT data FROM um_rows WHERE tbl='tax_certificate_versions' AND deleted=false AND data->>'org_id'=${requestedOrg} AND data->>'sha256'=${existingHash} LIMIT 1`;
    if(existing.length)return sendJson(res,200,{ok:true,version_id:existing[0].data.id,status:existing[0].data.scan_status,replay:true,checkout_blocked:false});
    const nonce=crypto.randomBytes(12).toString('hex');
    const blob=await put(`tax-certificates/${requestedOrg}/${nonce}.${EXT[contentType]}`,bytes,{access:'private',contentType,addRandomSuffix:false,token:process.env.BLOB_READ_WRITE_TOKEN});
    const plan=planTaxCertificateVersion({orgId:requestedOrg,uploaderId:live.session.user_id,pathname:blob.pathname,bytes,contentType});
    const audit={id:crypto.randomUUID(),kind:'certificate.uploaded',ref_id:plan.version.id,actor_id:live.session.user_id,created_at:plan.version.uploaded_at};
    const result=await sql`WITH version AS (
      INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('tax_certificate_versions',${plan.version.id},${JSON.stringify(plan.version)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO NOTHING RETURNING id
    ), parent AS (
      INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'tax_certificates',${plan.certificate.id},${JSON.stringify(plan.certificate)}::jsonb,false,now() FROM version
      ON CONFLICT(tbl,id) DO UPDATE SET data=um_rows.data || EXCLUDED.data,deleted=false,updated_at=now() RETURNING id
    ) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM parent RETURNING id`;
    if(!result.length)return sendJson(res,200,{ok:true,version_id:plan.version.id,replay:true,checkout_blocked:false});
    return sendJson(res,201,{ok:true,certificate_id:plan.certificate.id,version_id:plan.version.id,status:plan.version.scan_status,checkout_blocked:false});
  }catch{return sendJson(res,500,{error:'certificate_upload_failed'});}
}
