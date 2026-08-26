import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';
import { planTaxCertificateVersion, validateTaxCertificateFile } from '../_lib/taxCertificates.js';

const EXT={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL||!process.env.BLOB_READ_WRITE_TOKEN) return sendJson(res,503,{error:'private_storage_not_configured'});
  const sql=neon(process.env.DATABASE_URL);
  try{
    const live=await authorizeLiveRequest(req,sql,{roles:['customer','distributor','admin']});
    if(!live.ok) return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    const requestedOrg=String(req.headers['x-organization-id']||live.session.org_id||'');
    if(live.session.role!=='admin'&&requestedOrg!==String(live.session.org_id||'')) return sendJson(res,403,{error:'organization_mismatch'});
    const bytes=await readRawBody(req); const contentType=String(req.headers['content-type']||'').split(';')[0].toLowerCase();
    const validation=validateTaxCertificateFile({bytes,contentType,size:bytes.length});
    if(!validation.ok) return sendJson(res,400,{error:validation.reason});
    if(live.session.role!=='admin'){
      const members=await sql`SELECT id FROM um_rows WHERE tbl='organization_users' AND deleted=false AND data->>'org_id'=${requestedOrg} AND data->>'user_id'=${String(live.session.user_id)} AND data->>'status'='active' LIMIT 1`;
      if(!members.length) return sendJson(res,403,{error:'membership_inactive'});
    }
    const nonce=crypto.randomBytes(12).toString('hex');
    const blob=await put(`tax-certificates/${requestedOrg}/${nonce}.${EXT[contentType]}`,bytes,{access:'private',contentType,addRandomSuffix:false,token:process.env.BLOB_READ_WRITE_TOKEN});
    const plan=planTaxCertificateVersion({orgId:requestedOrg,uploaderId:live.session.user_id,pathname:blob.pathname,bytes,contentType});
    const results=await sql.transaction((txn)=>[
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('tax_certificates',${plan.certificate.id},${JSON.stringify(plan.certificate)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO UPDATE SET data=um_rows.data || EXCLUDED.data,deleted=false,updated_at=now() RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('tax_certificate_versions',${plan.version.id},${JSON.stringify(plan.version)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
    ]);
    if(!results.every((result)=>result?.length)) return sendJson(res,409,{error:'certificate_upload_replay'});
    return sendJson(res,201,{ok:true,certificate_id:plan.certificate.id,version_id:plan.version.id,status:plan.version.scan_status,checkout_blocked:false});
  }catch{return sendJson(res,500,{error:'certificate_upload_failed'});}
}
