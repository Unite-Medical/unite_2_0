export async function purchaseEditorRequest(query={},body){
 const response=await fetch('/api/admin/purchase-order-editor?'+new URLSearchParams(query),{credentials:'include',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const result=await response.json().catch(()=>({error:'Could not read the purchase order response. Your entries are still here.'}));
 if(!response.ok)throw new Error(result.error||'Could not save. Your entries are still here.');
 return result;
}
export function purchaseDraftPayload(draft){
 return {id:draft.id,vendor_id:draft.vendor_id||'',warehouse_id:draft.warehouse_id||'',ship_to:draft.ship_to||{},line_items:(draft.line_items||[]).map(line=>({id:line.id,product_id:line.product_id,catalog_table:line.catalog_table,sku:line.sku,name:line.name,variant:line.variant,supplier_sku:line.supplier_sku||'',qty:line.qty??null,cost:line.cost??null})),reference:draft.reference||'',notes:draft.notes||'',payment_terms:draft.payment_terms||'',expected_delivery:draft.expected_delivery||''};
}
export function switchPurchaseSupplier(draft,vendorId){
 if(!draft.vendor_id||draft.vendor_id===vendorId)return {...draft,vendor_id:vendorId};
 return {...draft,vendor_id:vendorId,reference:'',notes:'',payment_terms:'',expected_delivery:'',line_items:draft.line_items.map(line=>({...line,supplier_sku:'',cost:null}))};
}
export function purchaseDraftTotals(lines=[]){
 let subtotal=0,unpriced=0;
 for(const line of lines){const qty=Number(line.qty),cost=Number(line.cost);if(line.qty==null||String(line.qty).trim()===''||!Number.isFinite(qty)||qty<=0||line.cost==null||String(line.cost).trim()===''||!Number.isFinite(cost)||cost<0)unpriced++;else subtotal+=Math.round(qty*cost*100)/100;}
 return {subtotal:Math.round(subtotal*100)/100,total:unpriced?null:Math.round(subtotal*100)/100,unpriced};
}
export function warehousePurchaseAddress(warehouse={}){
 const address=warehouse.ship_to||(typeof warehouse.address==='object'&&warehouse.address?warehouse.address:warehouse);
 return {recipient:address.recipient||warehouse.name||'',company:address.company||'',address1:address.address1||address.line1||(typeof warehouse.address==='string'?warehouse.address:''),address2:address.address2||address.line2||'',city:address.city||'',province:address.province||address.state||'',zip:address.zip||address.postal_code||'',country:address.country||address.country_code||'',phone:address.phone||warehouse.phone||''};
}

export function samePurchaseAddress(a={},b={}){return ['recipient','company','address1','address2','city','province','zip','country','phone'].every(key=>String(a[key]||'').trim()===String(b[key]||'').trim());}

export function purchaseDraftReadiness(draft,{vendor,warehouses=[]}={}){
 const issues=[];
 if(!draft.vendor_id)issues.push('Choose a supplier.');
 else if(vendor?.id!==draft.vendor_id)issues.push('Wait for the selected supplier details to load.');
 else if(vendor.status!=='approved')issues.push('This supplier needs approval in the existing supplier review workflow.');
 if(!warehouses.some(row=>row.id===draft.warehouse_id))issues.push('Choose the receiving warehouse.');
 const a=draft.ship_to||{};
 if(!a.address1||!a.city||!a.zip||!a.country||!(a.recipient||a.company))issues.push('Complete the receiving address.');
 if(!draft.line_items?.length)issues.push('Add at least one product.');
 for(const line of draft.line_items||[]){
  if(!Number.isInteger(Number(line.qty))||Number(line.qty)<=0)issues.push((line.sku||'Product')+': enter the ordered quantity.');
  if(line.cost==null||String(line.cost).trim()===''||!Number.isFinite(Number(line.cost))||Number(line.cost)<0)issues.push((line.sku||'Product')+': enter the supplier’s unit cost.');
 }
 if(!String(draft.payment_terms||'').trim())issues.push('Enter the agreed supplier payment terms.');
 return issues;
}
