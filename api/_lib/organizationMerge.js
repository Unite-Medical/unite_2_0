import crypto from 'node:crypto';
export const MERGE_TABLES=['profiles','organization_users','addresses','orders','order_items','invoices','quotes','quote_items','customer_contract_prices','account_payment_methods','account_notification_recipients','contacts','tasks','returns','tax_certificates','tax_certificate_versions'];
export function duplicateOrganizations(orgs){const groups=new Map();for(const org of orgs){if(org.status==='merged')continue;const name=String(org.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(name.length<4)continue;const group=groups.get(name)||[];group.push({id:org.id,name:org.name});groups.set(name,group);}return [...groups.values()].filter(g=>g.length>1);}
export function planOrganizationMerge({source,target,rows,reason,actorId}){
 if(!source||!target||source.id===target.id)return {ok:false,reason:'distinct_organizations_required'};
 if(source.status==='merged'||target.status==='merged')return {ok:false,reason:'organization_already_merged'};
 if(!String(reason||'').trim()||!actorId)return {ok:false,reason:'merge_reason_required'};
 if([source,target].some(o=>o.segment==='distributors'||o.type==='distributor'))return {ok:false,reason:'distributor_ownership_requires_specialist_review'};
 for(const key of ['tier','terms','approval_status','commerce_hold_reason','tax_exempt','shopify_tax_exempt','credit_limit','credit_status'])if((source[key]||'')!==(target[key]||''))return {ok:false,reason:'commercial_policy_conflict'};
 if(rows.length>2000)return {ok:false,reason:'merge_too_large_for_interactive_review'};
 const changes=[];
 for(const {tbl,data} of rows){
  if(!MERGE_TABLES.includes(tbl))continue;
  if(tbl==='customer_contract_prices'&&data.org_id===source.id&&rows.some(r=>r.tbl===tbl&&r.data.org_id===target.id&&r.data.product_sku===data.product_sku))return {ok:false,reason:'contract_price_conflict'};
  if(tbl==='organization_users'&&data.org_id===source.id&&rows.some(r=>r.tbl===tbl&&r.data.org_id===target.id&&r.data.user_id===data.user_id))return {ok:false,reason:'membership_conflict_review_required'};
  const next={...data};let changed=false;
  for(const key of ['org_id','customer_id'])if(next[key]===source.id){next[key]=target.id;changed=true;}
  if(!changed)continue;
  if(tbl==='profiles')next.session_revision=Number(next.session_revision||0)+1;
  if(tbl==='tax_certificate_versions')next.storage_owner_org_id=data.storage_owner_org_id||source.id;
  next.merged_from_org_id=source.id;changes.push({table:tbl,id:data.id,before:data,after:next});
 }
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({source,target,changes,reason:String(reason).trim()})).digest('hex');
 return {ok:true,source,target,changes,fingerprint,counts:changes.reduce((a,c)=>({...a,[c.table]:(a[c.table]||0)+1}),{})};
}
