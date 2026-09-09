export function normalizeBarcode(value){return String(value||'').trim().replace(/[\s()-]/g,'').toUpperCase();}
export function buildBarcodeRegistry(products){
 const identifiers=[];const missing=[];let variantCount=0;
 for(const product of products||[]){for(const variant of product.variants||[]){variantCount+=1;const sku=String(variant.sku||'').trim();const variantId=`${product.handle}:${sku||variant.title||variantCount}`;const value=normalizeBarcode(variant.barcode);if(!value){missing.push({variant_id:variantId,product_handle:product.handle,sku,title:variant.title||'',status:'missing'});continue;}identifiers.push({id:`barcode:${variantId}:${value}`,value,sku,variant_id:variantId,units_per_scan:Number(variant.units_per_scan||1),packaging_level:variant.packaging_level||'unknown',source:variant.barcode_source||'shopify',active:variant.barcode_active!==false});}}
 const byValue=new Map();for(const identifier of identifiers){const list=byValue.get(identifier.value)||[];list.push(identifier);byValue.set(identifier.value,list);}
 const conflicts=[...byValue.entries()].filter(([,rows])=>new Set(rows.map((row)=>row.sku)).size>1).map(([value,rows])=>({value,skus:[...new Set(rows.map((row)=>row.sku))],variant_ids:rows.map((row)=>row.variant_id),status:'conflict'}));
 return {variant_count:variantCount,identifiers,missing,conflicts};
}
export function resolveBarcode(registry,value){
 const normalized=normalizeBarcode(value);if(!normalized)return {ok:false,reason:'barcode_required'};
 if((registry.conflicts||[]).some((conflict)=>conflict.value===normalized))return {ok:false,reason:'barcode_conflict'};
 const matches=(registry.identifiers||[]).filter((identifier)=>identifier.value===normalized);
 if(!matches.length)return {ok:false,reason:'barcode_unknown'};
 const active=matches.filter((identifier)=>identifier.active!==false);if(!active.length)return {ok:false,reason:'barcode_inactive'};
 const identifier=active[0];return {ok:true,sku:identifier.sku,variant_id:identifier.variant_id,units_per_scan:identifier.units_per_scan,packaging_level:identifier.packaging_level,source:identifier.source};
}

export function buildBarcodeCleanupQueue(products,inventoryRows){
 const positive=(value)=>{const number=Number(value);return Number.isFinite(number)&&number>0;};
 const exposed=new Set((inventoryRows||[]).filter((row)=>['On hand (current)','Committed (not editable)','Incoming (not editable)'].some((field)=>positive(row[field]))).map((row)=>String(row.SKU||'')));
 const rows=[];
 for(const product of products||[]){for(const variant of product.variants||[]){if(normalizeBarcode(variant.barcode))continue;const operational=exposed.has(String(variant.sku||''));const launch=product.launch_decision==='Launch';rows.push({product_handle:product.handle,product_name:product.name,sku:variant.sku||'',variant_title:variant.title||'',priority:launch&&operational?'launch_operational':launch?'launch_no_stock':'not_launching',operational_exposure:operational,launch});}}
 const rank={launch_operational:0,launch_no_stock:1,not_launching:2};return rows.sort((a,b)=>rank[a.priority]-rank[b.priority]||String(a.sku).localeCompare(String(b.sku)));
}
