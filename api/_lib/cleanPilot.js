import crypto from 'node:crypto';
import batch from '../_data/cleanPilot.js';
const TABLES=new Set(['products','product_variants','inventory','stock_movements']);
export function validatePilotBatch(input=batch){
 const keys=new Set(),skus=new Set(),barcodes=new Map();
 for(const row of input.rows){
  if(!TABLES.has(row.table)||!row.id?.startsWith(`${input.id}_`)||row.id!==row.data.id||keys.has(`${row.table}:${row.id}`))throw new Error('invalid_batch_identity');
  keys.add(`${row.table}:${row.id}`);
  if(row.data.staging_import_run!==input.id||!row.data.test_batch)throw new Error('missing_batch_provenance');
  if(row.table==='product_variants'){
   const v=row.data;
   if(!v.sku||v.sku.startsWith("'")||skus.has(v.sku)||!(v.price>0)||!(v.cogs>0)||v.price<v.cogs||!(v.grams>0))throw new Error('invalid_variant');
   skus.add(v.sku);
   if(v.barcode){if(barcodes.has(v.barcode)&&barcodes.get(v.barcode)!==v.sku)throw new Error('conflicting_barcode');barcodes.set(v.barcode,v.sku);}
  }
 }
 for(const row of input.rows){
  const d=row.data;
  if(row.table==='inventory'&&(!skus.has(d.sku)||d.warehouse_id!=='wh_unite'||![d.on_hand,d.reserved,d.source_committed,d.source_unavailable].every(n=>Number.isInteger(n)&&n>=0)||d.reserved>d.on_hand||d.reserved!==d.source_committed+d.source_unavailable))throw new Error('invalid_inventory');
  if(row.table==='products'&&(!d.variants?.length||d.variants.some(v=>!skus.has(v.sku)||v.product_id!==d.id)))throw new Error('invalid_product_variants');
 }
 return input;
}
export function pilotPlan(existing=[],input=batch){
 validatePilotBatch(input);
 const version=crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
 const run=existing.find(r=>r.tbl==='staging_imports'&&r.id===input.id&&!r.deleted);
 const active=existing.filter(r=>!r.deleted);
 const expected=new Set(input.rows.map(r=>`${r.table}:${r.id}`));
 const activeSkus=new Set(active.filter(r=>r.tbl==='products'||r.tbl==='product_variants').flatMap(r=>[r.data.sku,...(r.data.variants||[]).map(v=>v.sku)]));
 const collisions=existing.filter(r=>expected.has(`${r.tbl}:${r.id}`));
 const skuCollisions=input.rows.filter(r=>r.table==='product_variants'&&activeSkus.has(r.data.sku));
 const warehouse=active.find(r=>r.tbl==='warehouses'&&r.id==='wh_unite'&&r.data.active!==false);
 const loaded=Boolean(run&&input.rows.every(r=>active.some(e=>e.tbl===r.table&&e.id===r.id)));
 return {id:input.id,version,source_date:input.source_date,summary:input.summary,loaded,loaded_at:run?.data.imported_at||null,can_import:!run&&!collisions.length&&!skuCollisions.length&&Boolean(warehouse),blocked_reason:loaded?null:run?'The test batch has changed since it was loaded. Review the existing records.':collisions.length||skuCollisions.length?'Some records already exist. This import will not overwrite them.':!warehouse?'The Unite warehouse must be active before loading stock.':null,products:input.rows.filter(r=>r.table==='products').map(r=>({id:r.id,name:r.data.name,sku:r.data.sku,category:r.data.category,variants:r.data.variants.length,price_min:r.data.price_min,price_max:r.data.price_max})),held_inventory:input.held_inventory};
}
export {batch};
