import test from 'node:test';
import assert from 'node:assert/strict';
import {batch,pilotPlan,validatePilotBatch} from '../api/_lib/cleanPilot.js';
const warehouse={tbl:'warehouses',id:'wh_unite',data:{active:true},deleted:false};
test('reviewed batch keeps complete products and balanced provisional stock',()=>{
 assert.equal(validatePilotBatch().summary.products,43);
 assert.equal(batch.rows.filter(r=>r.table==='product_variants').length,86);
 const inventory=batch.rows.filter(r=>r.table==='inventory');
 assert.equal(inventory.length,80);
 for(const r of inventory){assert.equal(r.data.reconciliation_status,'physical_count_required');assert.equal(r.data.source_date,'2026-09-08');}
 assert.equal(inventory.reduce((n,r)=>n+r.data.on_hand,0),4270);
 assert.ok(batch.rows.every(r=>!['profiles','organizations','orders','payments'].includes(r.table)));
});
test('batch refuses active SKU collisions, archived identity collisions, and inactive warehouse',()=>{
 assert.ok(pilotPlan([warehouse]).can_import);
 assert.equal(pilotPlan([]).can_import,false);
 const v=batch.rows.find(r=>r.table==='product_variants');
 assert.equal(pilotPlan([warehouse,{tbl:'products',id:'other',data:{variants:[{sku:v.data.sku}]}}]).can_import,false);
 assert.equal(pilotPlan([warehouse,{tbl:v.table,id:v.id,data:v.data,deleted:true}]).can_import,false);
});
test('loaded batch is idempotent and partial states cannot be reimported',()=>{
 const rows=batch.rows.map(r=>({tbl:r.table,id:r.id,data:r.data,deleted:false}));
 const run={tbl:'staging_imports',id:batch.id,data:{imported_at:'2026-09-23'},deleted:false};
 assert.equal(pilotPlan([warehouse,run,...rows]).loaded,true);
 assert.equal(pilotPlan([warehouse,run,...rows]).can_import,false);
 assert.equal(pilotPlan([warehouse,run,...rows.slice(1)]).loaded,false);
 assert.equal(pilotPlan([warehouse,run,...rows.slice(1)]).can_import,false);
});
test('rejects malformed rows and negative stock instead of coercing data',()=>{
 const invalid=structuredClone(batch);invalid.rows.find(r=>r.table==='inventory').data.on_hand=-1;
 assert.throws(()=>validatePilotBatch(invalid),/invalid_inventory/);
 const duplicate=structuredClone(batch);duplicate.rows.push(duplicate.rows[0]);
 assert.throws(()=>validatePilotBatch(duplicate),/invalid_batch_identity/);
});
