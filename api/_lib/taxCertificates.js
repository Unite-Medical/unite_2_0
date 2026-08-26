import crypto from 'node:crypto';

const TYPES=new Set(['application/pdf','image/jpeg','image/png']);
const MAX_BYTES=4*1024*1024;
function signatureValid(bytes,type){
  if(type==='application/pdf') return bytes.subarray(0,5).toString()==='%PDF-';
  if(type==='image/png') return bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='image/jpeg') return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  return false;
}
export function validateTaxCertificateFile({bytes,contentType,size}){
  if(!TYPES.has(String(contentType||'').toLowerCase())) return {ok:false,reason:'content_type_not_allowed'};
  if(!Buffer.isBuffer(bytes)||!bytes.length||Number(size)!==bytes.length) return {ok:false,reason:'file_size_invalid'};
  if(bytes.length>MAX_BYTES) return {ok:false,reason:'file_too_large'};
  if(!signatureValid(bytes,String(contentType).toLowerCase())) return {ok:false,reason:'file_signature_invalid'};
  return {ok:true};
}
export function planTaxCertificateVersion({orgId,uploaderId,pathname,bytes,contentType,now=new Date()}){
  const validation=validateTaxCertificateFile({bytes,contentType,size:bytes?.length});
  if(!validation.ok) return validation;
  if(!orgId||!uploaderId||!String(pathname||'').startsWith(`tax-certificates/${orgId}/`)) return {ok:false,reason:'certificate_identity_invalid'};
  const at=(now instanceof Date?now:new Date(now)).toISOString();
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const certificateId=`taxcert_${crypto.createHash('sha256').update(String(orgId)).digest('hex').slice(0,20)}`;
  const versionId=`taxcertver_${sha256.slice(0,24)}`;
  return {ok:true,certificate:{id:certificateId,org_id:orgId,status:'documentation_pending_review',checkout_blocked:false,current_version_id:versionId,updated_at:at},version:{id:versionId,certificate_id:certificateId,org_id:orgId,private_storage_key:String(pathname),sha256,detected_mime:contentType,size:bytes.length,scan_status:'quarantine_pending',review_status:'pending',uploaded_by:uploaderId,uploaded_at:at}};
}

export function planTaxCertificateReview({version,action,scan_result,scan_evidence,actorId,now=new Date()}){
  if(!version?.id||!actorId) return {ok:false,reason:'review_identity_required'};
  const at=(now instanceof Date?now:new Date(now)).toISOString();
  if(action==='record_scan'){
    if(!['clean','threat'].includes(scan_result)||!scan_evidence) return {ok:false,reason:'scan_evidence_required'};
    return {ok:true,version:{...version,scan_status:scan_result==='clean'?'clean':'rejected_threat',scan_evidence,scanned_by:actorId,scanned_at:at}};
  }
  if(!['approve','reject'].includes(action)) return {ok:false,reason:'invalid_review_action'};
  if(action==='approve'&&version.scan_status!=='clean') return {ok:false,reason:'clean_scan_required'};
  return {ok:true,version:{...version,review_status:action==='approve'?'approved':'rejected',reviewed_by:actorId,reviewed_at:at}};
}
