import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { planCustomerMigrationBatch } from '../api/_lib/customerMigration.js';
import { buildDamonInventoryOpening } from '../src/lib/inventoryOpeningPolicy.js';

const prepared=JSON.parse(await fs.readFile(new URL('../migration-data/snapshot-prepared.json',import.meta.url),'utf8'));
const {run_id:run,sources}=prepared;
const at=new Date().toISOString();
const rows=[];
function add(table,data){rows.push({table,id:data.id,data:{...data,staging_import_run:run}});}
for(const p of prepared.products)add('products',p);
for(const p of prepared.variants)add('product_variants',p);
for(const category of new Set(prepared.products.map(p=>p.category)))add('categories',{id:category,name:category,slug:category.toLowerCase().replace(/[^a-z0-9]+/g,'-')});
for(const [id,name,active] of [['wh_unite','Unite Medical Warehouse',true],['wh_cato','CATO Warehouse',true],['wh_ohio','Shipping Tree - Ohio Location',false]])add('warehouses',{id,name,active,source:'shopify_snapshot',reconciliation_status:active?'physical_count_required':'excluded_from_production'});
const opening=buildDamonInventoryOpening(sources.inventory);
for(const r of opening.opening)add('inventory',{id:`inv_shopify_${r.warehouse_id}_${r.sku}`,...r,source:'shopify_snapshot_2026_09_08',reconciliation_status:'physical_count_required'});
const summaries={customers:0,profiles:0,addresses:0,activation_eligible:0,activation_holds:0,pricing_holds:0};
const emails=new Map();
for(const c of sources.customers){const e=c.Email.trim().toLowerCase();if(e)emails.set(e,(emails.get(e)||0)+1);}
for(let offset=0;offset<sources.customers.length;offset+=50){
 const batch=sources.customers.slice(offset,offset+50);
 const customers=batch.map(source=>({source,addresses:source['Default Address Address1']||source['Default Address City']||source['Default Address Zip']?[source]:[]}));
 const plan=planCustomerMigrationBatch({run_id:run,source_sha256:prepared.sha256,customers});
 for(const [k,v] of Object.entries(plan.summary))summaries[k]+=v;
 const held=new Set(batch.filter(c=>(emails.get(c.Email.trim().toLowerCase())||0)>1).map(c=>`usr_shopify_${c['Customer ID']}`));
 for(const row of plan.rows){
  if(row.table==='profiles'&&held.has(row.id)){summaries.profiles--;summaries.activation_eligible--;summaries.activation_holds++;continue;}
  if(row.table==='organization_users'&&held.has(row.data.user_id))continue;
  if(row.table==='customer_external_identities'&&held.has(row.data.profile_id))row.data.profile_id=null;
  if(row.table==='customer_migration_records'&&held.has(`usr_shopify_${row.data.source_customer_id}`)){row.data.activation_status='reconciliation_hold';row.data.activation_hold_reason='duplicate_email';}
  if(row.table==='organizations'){
   const c=batch.find(c=>`org_shopify_${c['Customer ID']}`===row.id);
   row.data.tags=c.Tags.split(',').map(t=>t.trim()).filter(Boolean);row.data.email=c.Email;row.data.phone=c.Phone||c['Default Address Phone'];row.data.total_spend=Number(c['Total Spent']||0);row.data.total_orders=Number(c['Total Orders']||0);
  }
  add(row.table,row.data);
 }
}
const entities={products:'product_row',inventory:'inventory_snapshot',customers:'customer',orders:'order',transactions:'transaction',open_orders:'open_order'};
for(const [kind,source] of Object.entries(sources))source.forEach((payload,index)=>{
 const entity=entities[kind];const id=`shopify:${run}:${entity}:${String(index+1).padStart(6,'0')}`;
 add('shopify_history_rows',{id,run_id:run,entity,source_id:String(index+1),imported_at:at,payload_sha256:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),payload});
});
const tables=Object.fromEntries([...new Set(rows.map(r=>r.table))].map(t=>[t,rows.filter(r=>r.table===t).length]));
const summary={...prepared.summary,customer_migration:summaries,inventory_pools:opening.opening.length,inventory_exceptions:opening.audit_only.length};
add('staging_imports',{id:run,run_id:run,summary,manifest:prepared.manifest,source_sha256:prepared.sha256,imported_at:at,expected_tables:tables,status:'source_loaded_pending_acceptance',limitations:['Customer pricing remains held.','Inventory remains provisional; CATO zero opening and Ohio exclusion preserve existing launch policy.','Open-order CSV is derived from the full export using the 29 Shopify Open-view order numbers.','No supplemental customer metafields or additional addresses were supplied.','Twelve new products need launch decisions.','Transactions have not been reconciled against finance source totals.']});
if(new Set(rows.map(r=>`${r.table}:${r.id}`)).size!==rows.length)throw new Error('duplicate target IDs');
console.log(JSON.stringify({run_id:run,summary,planned_tables:tables,total_rows:rows.length}));
await fs.writeFile(new URL('../migration-data/import-plan.json',import.meta.url),JSON.stringify({run_id:run,rows}));
if(!process.argv.includes('--apply'))process.exit(0);
const token=(await fs.readFile(new URL('../migration-data/staging-setup-token.txt',import.meta.url),'utf8')).trim();
const endpoint='https://staging.unitemedical.net/api/internal/staging-setup';
async function request(body){const r=await fetch(endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-staging-setup-token':token},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(!r.ok)throw new Error(JSON.stringify(j));return j;}
const before=await request();
if(before.environment!=='staging'||before.origin!=='https://staging.unitemedical.net')throw new Error('staging identity mismatch');
await fs.writeFile(new URL('../migration-data/pre-import-counts.json',import.meta.url),JSON.stringify(before,null,2));
console.log('Verified staging identity. Importing into database '+before.database);
for(let i=0;i<rows.length;i+=100){const batch=rows.slice(i,i+100);const result=await request({run_id:run,rows:batch});if(result.applied!==batch.length)throw new Error('incomplete batch');if(i%1000===0)console.log(`${Math.min(i+100,rows.length)}/${rows.length} rows accepted`);}
const after=await request();
for(const [table,count] of Object.entries(tables)){const actual=after.imported_counts.find(r=>r.tbl===table)?.count;if(actual!==count)throw new Error(`Count mismatch ${table}: ${actual} vs ${count}`);}
await fs.writeFile(new URL('../migration-data/post-import-counts.json',import.meta.url),JSON.stringify(after,null,2));
console.log(JSON.stringify({verified:true,source_counts:after.source_counts,imported_counts:after.imported_counts}));
