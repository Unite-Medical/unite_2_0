import crypto from 'node:crypto';
import {get} from '@vercel/blob';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {processCertificate} from '../_lib/documentProcessing.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});const sql=neon(process.env.DATABASE_URL);
 try{const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});
 if(req.method==='GET'&&!req.query.version_id){const rows=await sql`SELECT data FROM um_rows WHERE tbl='tax_certificate_versions' AND deleted=false ORDER BY updated_at DESC LIMIT 200`;return sendJson(res,200,{ok:true,documents:rows.map(r=>{const d={...r.data};delete d.private_storage_key;return d;})});}
 const b=req.method==='POST'?JSON.parse((await readRawBody(req)).toString('utf8')):req.query;const rows=await sql`SELECT data FROM um_rows WHERE tbl='tax_certificate_versions' AND id=${String(b.version_id||'')} AND deleted=false`;const v=rows[0]?.data;if(!v)return sendJson(res,404,{error:'document_not_found'});
 if(!String(v.private_storage_key).startsWith(`tax-certificates/${v.storage_owner_org_id||v.org_id}/`))return sendJson(res,403,{error:'invalid_document_scope'});
 if(req.method==='GET'&&v.scan_status!=='clean')return sendJson(res,403,{error:'clean_scan_required'});
 const blob=await get(v.private_storage_key,{access:'private',useCache:false,token:process.env.BLOB_READ_WRITE_TOKEN});if(!blob?.stream||blob.blob.size>4*1024*1024)return sendJson(res,400,{error:'document_unavailable'});
 const bytes=Buffer.from(await new Response(blob.stream).arrayBuffer());if(crypto.createHash('sha256').update(bytes).digest('hex')!==v.sha256)return sendJson(res,409,{error:'document_integrity_failed'});
 if(req.method==='GET'){res.setHeader('Content-Type',v.detected_mime);res.setHeader('Content-Disposition','attachment; filename="certificate.'+(v.detected_mime==='application/pdf'?'pdf':v.detected_mime==='image/png'?'png':'jpg')+'"');res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).send(bytes);}
 const orgs=await sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${v.org_id} AND deleted=false`;
 const patch=await processCertificate({bytes,version:v,organization:orgs[0]?.data||{}});const next={...v,...patch,processed_by:live.session.user_id};const audit={id:crypto.randomUUID(),kind:'certificate.processed',ref_id:v.id,actor_id:live.session.user_id,payload:{scan_status:patch.scan_status,extraction_status:patch.extraction_status},created_at:new Date().toISOString()};
 const changed=await sql`WITH changed AS (UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl='tax_certificate_versions' AND id=${v.id} AND data=${JSON.stringify(v)}::jsonb RETURNING id), parent AS (UPDATE um_rows SET data=data||${JSON.stringify({status:'documentation_pending_review',certificate_status:'pending'})}::jsonb,updated_at=now() WHERE tbl='tax_certificates' AND id=${v.certificate_id} AND data->>'current_version_id'=${v.id} AND EXISTS(SELECT 1 FROM changed) RETURNING id) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM changed RETURNING id`;
 if(!changed.length)return sendJson(res,409,{error:'document_changed_refresh'});return sendJson(res,200,{ok:true});
 }catch(e){return sendJson(res,503,{error:['document_scanner_not_configured','scanner_https_required','document_integrity_failed','scanner_evidence_invalid'].includes(e.message)?e.message:'document_processing_unavailable'});}
}
