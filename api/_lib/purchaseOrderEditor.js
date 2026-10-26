import crypto from 'node:crypto';

export class PurchaseEditorError extends Error {
 constructor(message,status=400,details={}){super(message);this.status=status;this.details=details;}
}
const fail=(message,status=400,details)=>{throw new PurchaseEditorError(message,status,details);};
const text=(value,max=200)=>String(value??'').trim().slice(0,max);
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const validId=(value,prefix)=>new RegExp('^'+prefix+'_'+uuid+'$','i').test(value);
const cents=value=>Math.round(value*100)/100;
const nameKey=value=>text(value).toLowerCase().replace(/\s+/g,' ');
const atDate=value=>{const valueText=text(value,10);if(!valueText)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(valueText)||!Number.isFinite(Date.parse(valueText))||new Date(valueText).toISOString().slice(0,10)!==valueText)fail('Enter a valid expected delivery date.');return valueText;};
const ADDRESS_FIELDS=['recipient','company','address1','address2','city','province','zip','country','phone'];
export const normalizePoAddress=input=>Object.fromEntries(ADDRESS_FIELDS.map(key=>[key,text(input?.[key],250)]));
const optionalNumber=(value,{quantity=false}={})=>{
 if(value==null||String(value).trim()==='')return null;
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>10000000||(quantity&&(!Number.isInteger(n)||n===0)))fail(quantity?'Enter a whole quantity of 1 or more.':'Enter a valid unit cost of zero or greater.');
 return quantity?n:cents(n);
};
export function requestIdentity(value){const id=text(value,101);if(!/^[A-Za-z0-9:_-]{8,100}$/.test(id))fail('Reload this draft before saving.');return id;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;}
export const purchaseEditorFingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const purchaseEditorAuditId=(kind,id,requestId)=>'aud_po_editor_'+crypto.createHash('sha256').update([kind,id,requestId].join(':')).digest('hex').slice(0,32);
export function supplierEditorView(vendor={}){
 return {id:vendor.id,name:vendor.name||'',contact_name:vendor.contact_name||'',contact_email:vendor.contact_email||vendor.email||'',phone:vendor.phone||'',address:normalizePoAddress(vendor.address),status:vendor.status||'pending',revision:Number(vendor.revision||0)};
}
export function warehouseEditorView(warehouse={}){
 const source=warehouse.ship_to||warehouse.address;
 const address=typeof source==='object'&&source?source:{address1:warehouse.address1||warehouse.line1||(typeof source==='string'?source:''),address2:warehouse.address2||warehouse.line2,city:warehouse.city,province:warehouse.province||warehouse.state,zip:warehouse.zip||warehouse.postal_code,country:warehouse.country,phone:warehouse.phone};
 return {id:warehouse.id,name:warehouse.name||'',ship_to:normalizePoAddress({recipient:warehouse.name,...address})};
}
export function productEditorView(product={},table='commerce_products'){
 const raw=product.cost??(table==='products'?(product.unit_cost??product.cogs):null);
 const cost=raw==null||String(raw).trim()===''?null:Number(raw);
 return {id:product.id,catalog_table:table,sku:text(product.sku),name:text(product.name||product.title,500),variant:text(product.variant||product.pack_size),cost:Number.isFinite(cost)&&cost>=0?cost:null,status:product.status||'active'};
}
export function supplierEditorDraft(input={},actor,now=new Date()){
 const id=text(input.id,100);if(!validId(id,'vnd'))fail('Reload the new supplier form.');
 const name=text(input.name);if(!name)fail('Enter the supplier’s company name.');
 const email=text(input.contact_email,254).toLowerCase();if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid supplier email address.');
 return {id,name,contact_name:text(input.contact_name),contact_email:email,phone:text(input.phone,80),address:normalizePoAddress(input.address),status:'pending',revision:1,source:'manual_composer',created_by:actor.user_id,created_at:now.toISOString(),updated_at:now.toISOString()};
}
export function purchaseEditorView(po={}){
 const fields=['id','source','status','revision','doc_number','vendor_id','vendor_name','vendor_email','vendor_status','warehouse_id','warehouse_name','currency','reference','notes','payment_terms','expected_delivery','total_cost','known_subtotal','total_cost_confirmed','created_at','updated_at','created_by','approved_at','approved_by','sent_at','vendor_response','qbo_po_id','wms_po_id'];
 return {...Object.fromEntries(fields.filter(key=>key in po).map(key=>[key,po[key]])),ship_to:normalizePoAddress(po.ship_to),line_items:(po.line_items||[]).map(line=>Object.fromEntries(['id','product_id','catalog_table','sku','name','variant','supplier_sku','qty','cost','received_qty','accepted_qty','billed_qty'].filter(key=>key in line).map(key=>[key,line[key]])))};
}
export function isPurchaseEditorEditable(po){return !po||(po.source==='manual_composer'&&po.status==='draft'&&!(po.line_items||[]).some(line=>Number(line.received_qty||0)!==0||Number(line.accepted_qty||0)!==0||Number(line.billed_qty||0)!==0));}
export function normalizePurchaseEditorDraft({input={},existing=null,vendor=null,warehouse=null,products=[],actor,now=new Date()}){
 if(!isPurchaseEditorEditable(existing))fail('This purchase order is read-only here. Use its existing approval, receiving or accounting workflow.',409);
 if(input.currency&&input.currency!=='USD')fail('This purchase order editor supports USD only.');
 const id=text(input.id,100);if(!validId(id,'po'))fail('Reload the purchase order form.');
 const vendorId=text(input.vendor_id,200),warehouseId=text(input.warehouse_id,200);
 if(vendorId&&vendor?.id!==vendorId)fail('The selected supplier is unavailable. Choose it again.',409);
 if(warehouseId&&warehouse?.id!==warehouseId)fail('The selected warehouse is unavailable. Choose it again.',409);
 if(!Array.isArray(input.line_items)||input.line_items.length>200)fail('Use up to 200 purchase order lines.');
 const line_items=input.line_items.map(line=>{
  if(!line||typeof line!=='object'||Array.isArray(line))fail('Choose a valid product line.');
  const lineId=text(line.id,100);if(!new RegExp('^'+uuid+'$','i').test(lineId))fail('Each product needs a stable line reference. Reload the draft.');
  const product=products.find(p=>p.id===String(line.product_id)&&p.catalog_table===String(line.catalog_table));
  if(!product||product.status!=='active')fail('A selected product is no longer active. Choose it again.',409);
  return {id:lineId,product_id:product.id,catalog_table:product.catalog_table,sku:product.sku,name:product.name,variant:product.variant,supplier_sku:text(line.supplier_sku),qty:optionalNumber(line.qty,{quantity:true}),cost:optionalNumber(line.cost),received_qty:0,accepted_qty:0,billed_qty:0};
 });
 if(new Set(line_items.map(line=>line.id)).size!==line_items.length)fail('Duplicate line references are not allowed.');
 if(new Set(line_items.map(line=>line.sku)).size!==line_items.length)fail('This SKU is already on the PO. Change its quantity instead.');
 const complete=line_items.length>0&&line_items.every(line=>line.qty!=null&&line.cost!=null);
 const known_subtotal=cents(line_items.reduce((sum,line)=>sum+(line.qty==null||line.cost==null?0:cents(line.qty*line.cost)),0));
 if(known_subtotal>100000000)fail('The purchase order total is too large.');
 const at=now.toISOString(),ship_to=normalizePoAddress(input.ship_to);
 const delivery=[warehouse?.name,ship_to.recipient,ship_to.company,ship_to.address1,ship_to.address2,[ship_to.city,ship_to.province,ship_to.zip].filter(Boolean).join(' '),ship_to.country,ship_to.phone].filter(Boolean).join('\n');
 return {id,source:'manual_composer',status:'draft',revision:Number(existing?.revision||0)+1,doc_number:existing?.doc_number||'PO-'+id.slice(3).replaceAll('-','').slice(0,12).toUpperCase(),po_type:'inventory',currency:'USD',vendor_id:vendorId,vendor_name:vendor?.name||'',vendor_email:vendor?.contact_email||vendor?.email||'',vendor_status:vendor?.status||null,warehouse_id:warehouseId,warehouse_name:warehouse?.name||'',ship_to,vendor_delivery_instructions:delivery,line_items,total_cost:complete?known_subtotal:null,known_subtotal,total_cost_confirmed:complete,reference:text(input.reference),notes:text(input.notes,4000),payment_terms:text(input.payment_terms),expected_delivery:atDate(input.expected_delivery),wms_po_id:id,receiving_revision:0,created_by:existing?.created_by||actor.user_id,created_at:existing?.created_at||at,updated_at:at};
}
export function purchaseEditorIssues(po,{vendor=null,warehouse=null,products=[]}={}){
 const issues=[];
 if(!po.vendor_id||vendor?.id!==po.vendor_id)issues.push('Choose a supplier.');
 else if(vendor.status!=='approved')issues.push('This supplier needs approval in the existing supplier review workflow.');
 if(!po.warehouse_id||warehouse?.id!==po.warehouse_id||warehouse?.status==='archived'||warehouse?.active===false)issues.push('Choose the receiving warehouse.');
 const a=po.ship_to;if(!a?.address1||!a.city||!a.zip||!a.country||!(a.recipient||a.company))issues.push('Complete the receiving address.');
 if(!po.line_items?.length)issues.push('Add at least one product.');
 for(const line of po.line_items||[]){
  const product=products.find(p=>p.id===line.product_id&&p.catalog_table===line.catalog_table);
  if(!product||product.status!=='active'||!line.sku||product.sku!==line.sku)issues.push((line.sku||'Product')+': review the active catalog match.');
  if(!Number.isInteger(line.qty)||line.qty<=0)issues.push((line.sku||'Product')+': enter the ordered quantity.');
  if(line.cost==null||!Number.isFinite(Number(line.cost))||Number(line.cost)<0)issues.push((line.sku||'Product')+': enter the supplier’s unit cost.');
 }
 const complete=(po.line_items||[]).length>0&&(po.line_items||[]).every(line=>Number.isInteger(line.qty)&&line.qty>0&&line.cost!=null&&Number.isFinite(Number(line.cost))&&Number(line.cost)>=0);
 if(complete&&(!po.total_cost_confirmed||po.total_cost==null||Number(po.total_cost)!==cents(po.line_items.reduce((sum,line)=>sum+cents(line.qty*line.cost),0))))issues.push('Review the purchase order total before approval.');
 if(!po.payment_terms)issues.push('Enter the agreed supplier payment terms.');
 return [...new Set(issues)];
}
export async function purchaseEditorCatalog(sql){
 const rows=await sql`SELECT tbl,data FROM um_rows WHERE tbl IN ('commerce_products','products') AND deleted=false`;
 const commerce=rows.filter(row=>row.tbl==='commerce_products');
 return (commerce.length?commerce:rows.filter(row=>row.tbl==='products')).map(row=>productEditorView(row.data,row.tbl)).filter(product=>product.status==='active');
}
export async function purchaseEditorRelated(sql,po){
 const [vendors,warehouses,products]=await Promise.all([sql`SELECT data FROM um_rows WHERE tbl='vendors' AND id=${String(po.vendor_id||'')} AND deleted=false`,sql`SELECT data FROM um_rows WHERE tbl='warehouses' AND id=${String(po.warehouse_id||'')} AND deleted=false`,purchaseEditorCatalog(sql)]);
 return {vendor:vendors[0]?.data||null,warehouse:warehouses[0]?.data||null,products};
}
export const supplierCanonicalName=nameKey;
