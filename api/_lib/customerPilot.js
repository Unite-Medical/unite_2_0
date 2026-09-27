import crypto from 'node:crypto';
import {planCustomerMigrationBatch} from './customerMigration.js';

const FIELDS=['Customer ID','First Name','Last Name','Email','Default Address Company','Default Address Address1','Default Address Address2','Default Address City','Default Address Province Code','Default Address Country Code','Default Address Zip','Default Address Phone','Phone','Tax Exempt','Tags','Accepts Email Marketing','Accepts SMS Marketing','Accepts WhatsApp Marketing'];
export const CUSTOMER_PILOT_TABLES=['organizations','profiles','organization_users','addresses','customer_external_identities','customer_migration_records','marketing_consents','staging_imports'];
export const customerKey=value=>String(value||'').trim().replace(/^'+/,'');
export const companyKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function prepareCustomerPilot(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Choose one customer from a Shopify customer CSV.');
 const source=Object.fromEntries(FIELDS.map(key=>{
  const value=input[key]??'';
  if(typeof value!=='string'||value.length>1000)throw new Error('The customer file contains an invalid field.');
  return [key,value.trim()];
 }));
 source['Customer ID']=customerKey(source['Customer ID']);
 if(!/^\d{6,20}$/.test(source['Customer ID']))throw new Error('A valid Shopify customer ID is required.');
 source.Email=source.Email.toLowerCase();
 for(const key of ['Phone','Default Address Phone','Default Address Zip'])source[key]=customerKey(source[key]);
 if(!source['Default Address Company']||!source['Default Address Address1']||!source['Default Address City']||!source['Default Address Zip']||!source['Default Address Country Code'])throw new Error('The company and full delivery address must be present before this customer can be loaded.');
 if(!['yes','no','true','false'].includes(source['Tax Exempt'].toLowerCase()))throw new Error('The export must specify the customer’s tax-exempt status.');
 const id=`customer_pilot_${source['Customer ID']}`,version=digest(source);
 const batch=planCustomerMigrationBatch({run_id:id,source_sha256:version,customers:[{source,addresses:[source]}]});
 const profile=batch.rows.find(r=>r.table==='profiles')?.data;
 if(!profile)throw new Error('This customer needs a usable email address before loading.');
 const rows=batch.rows.map(row=>({ ...row,data:{...row.data,staging_import_run:id,test_batch:true}}));
 const org=rows.find(r=>r.table==='organizations').data;
 Object.assign(org,{email:source.Email,phone:source.Phone,tags:source.Tags.split(',').map(s=>s.trim()).filter(Boolean),total_spend:0,total_orders:0});
 return {id,version,rows,customer_id:source['Customer ID'],company_key:companyKey(org.name),summary:{organization_id:org.id,company:org.name,contact:profile.name,email:profile.email,phone:source.Phone,address:rows.find(r=>r.table==='addresses').data,tax_exempt:org.shopify_tax_exempt}};
}

export function customerPilotPlan(existing,prepared){
 const active=existing.filter(r=>!r.deleted);
 const run=active.find(r=>r.tbl==='staging_imports'&&r.id===prepared.id);
 const expected=new Set(prepared.rows.map(r=>`${r.table}:${r.id}`));
 const loaded=Boolean(run?.data.version===prepared.version&&prepared.rows.every(r=>active.some(e=>e.tbl===r.table&&e.id===r.id)));
 const collision=existing.some(r=>expected.has(`${r.tbl}:${r.id}`)||r.tbl==='staging_imports'&&r.id===prepared.id);
 const duplicate=active.some(r=>
  (['organizations','profiles','customer_external_identities'].includes(r.tbl)&&customerKey(r.data.shopify_customer_id||r.data.source_customer_id)===prepared.customer_id)||
  (r.tbl==='profiles'&&String(r.data.email||'').trim().toLowerCase()===prepared.summary.email)||
  (r.tbl==='organizations'&&companyKey(r.data.name)===prepared.company_key));
 return {id:prepared.id,version:prepared.version,loaded,can_import:!collision&&!duplicate,summary:prepared.summary,blocked_reason:loaded?null:collision||duplicate?'This customer or email already has records. Open the existing customer or review the conflict; nothing will be overwritten.':null};
}
