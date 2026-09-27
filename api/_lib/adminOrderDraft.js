import crypto from 'node:crypto';
import {resolveSchedulePrice} from './commerceWorkspace.js';
import {canSetNewPrice} from './launchPolicy.js';
const amount=(value,name)=>{const n=Number(value);if(!Number.isFinite(n)||n<0||n>100000000)throw new Error('Enter a valid '+name+'.');return Math.round(n*100)/100;};
const text=(value,max=2000)=>String(value||'').trim().slice(0,max);
export function normalizeAdminDraft({input,customer,products=[],schedules=[],actor,existing=null,now=new Date()}){
 if(existing&&(existing.historical||existing.draft!==true))throw new Error('Only an unsubmitted draft can be changed here.');
 if(input.customer_id&&(!customer||customer.id!==input.customer_id||customer.status==='archived'))throw new Error('Choose an active customer.');
 if(!Array.isArray(input.lines)||input.lines.length>150)throw new Error('Use up to 150 order items.');
 const discount=amount(input.discount_percent||0,'discount');if(discount>=100)throw new Error('Discount must be less than 100%.');
 const lines=input.lines.map((line,index)=>{
  const product=products.find(p=>p.id===line.product_id);if(!product||product.status!=='active')throw new Error('Choose an active catalog product for every item.');
  const quantity=Number(line.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>100000)throw new Error('Enter a whole quantity of 1 or more.');
  const resolved=resolveSchedulePrice(product,quantity,schedules);
  let unit=amount(line.manual_price?line.unit_price:resolved.unit_price,'unit price');
  unit=amount(unit*(1-discount/100),'discounted price');
  if(line.manual_price||discount){const check=canSetNewPrice(actor,unit,Number(product.cost));if(!check.ok)throw new Error('A changed price or discount needs verified product cost and Damon or Jacobe’s approval.');}
  if(unit<=0)throw new Error('Each item needs a confirmed price greater than zero.');
  return {id:text(line.id||'line-'+(index+1),100),product_id:product.id,variant_id:product.variant_id,sku:product.sku,name:product.name,variant:product.variant,image:product.image||'',quantity,unit_price:unit,retail:product.retail,manual_price:!!line.manual_price,requested_unit_price:line.manual_price?amount(line.unit_price,'unit price'):null,pricing_source:line.manual_price?'Approved manual price':resolved.source,discount_percent:discount,mapping_status:'matched',removed:false,unfulfilled_quantity:quantity,qbo_item_id:product.qbo_item_id||null,ext_price:amount(unit*quantity,'line total')};
 });
 if(new Set(lines.map(l=>l.id)).size!==lines.length)throw new Error('Duplicate order items need distinct line references.');
 const subtotal=amount(lines.reduce((n,l)=>n+l.ext_price,0),'subtotal'),shipping=amount(input.shipping||0,'shipping'),tax=customer?.tax_exempt?0:amount(input.tax||0,'tax');
 const payment_method=['due_on_receipt','ach','card','net15','net30','net60'].includes(input.payment_method)?input.payment_method:'due_on_receipt';
 if(/^net/.test(payment_method)&&customer?.terms!==payment_method)throw new Error('Confirm this customer’s payment terms before using credit.');
 const address=value=>Object.fromEntries(['id','recipient','company','address1','address2','city','province','zip','country','phone'].map(k=>[k,text(value?.[k],250)]));
 const at=now.toISOString(),id=existing?.id||input.id;
 return {id,number:existing?.number||'D-'+id.slice(0,8).toUpperCase(),customer_id:customer?.id||'',customer_name:customer?.name||'',email:customer?.email||'',draft:true,historical:false,revision:Number(existing?.revision||0)+1,lines,subtotal,shipping,tax,total:amount(subtotal+shipping+tax,'total'),currency:'USD',discount_percent:discount,payment_method,payment_terms:payment_method,po_number:text(input.po_number,150),notes:text(input.notes,5000),tags:[...new Set((input.tags||[]).map(t=>text(t,100)).filter(Boolean))].slice(0,50),shipping_address:address(input.shipping_address),billing_address:address(input.billing_address||input.shipping_address),shipping_name:text(input.shipping_name,100),shipping_confirmed:input.shipping_confirmed===true,tax_confirmed:customer?.tax_exempt===true||input.tax_confirmed===true,tax_exempt:customer?.tax_exempt===true,tax_note:text(input.tax_note,300),financial_status:'unpaid',fulfillment_status:'unfulfilled',workflow_state:'needs_review',created_at:existing?.created_at||at,updated_at:at,events:[...(existing?.events||[]),{id:crypto.randomUUID(),at,actor:actor.email,text:existing?'Draft updated':'Draft created'}]};
}
export function draftSubmissionIssues(draft,customer){
 const issues=[];if(!customer||!draft.customer_id)issues.push('Choose a customer.');if(!draft.lines.length)issues.push('Add at least one product.');
 const a=draft.shipping_address;if(!a?.address1||!a.city||!a.zip||!a.country||!(a.recipient||a.company))issues.push('Complete the shipping address.');
 if(!draft.shipping_confirmed)issues.push('Confirm the shipping charge.');if(!draft.tax_confirmed)issues.push('Review and confirm tax.');
 if(/^net/.test(draft.payment_method)&&(customer?.credit_limit==null||draft.total>Number(customer.credit_limit)))issues.push('Confirm a sufficient credit limit before using payment terms.');
 return issues;
}
export function planAdminOrderSubmission(draft,customer,actor,now=new Date()){
 const issues=draftSubmissionIssues(draft,customer);if(issues.length)throw new Error(issues.join(' '));
 const id='UM-'+draft.id,at=now.toISOString(),terms=/^net/.test(draft.payment_method),customerId=customer.organization_id||customer.org_id||customer.id;
 const order={id,commerce_order_id:draft.id,source_order_number:'UM-'+draft.id.slice(0,8).toUpperCase(),customer_id:customerId,commerce_customer_id:customer.id,customer_name:customer.company||customer.name,contact_email:customer.email,contact_phone:customer.phone,order_source:'admin',status:'payment_pending',payment_status:'unpaid',payment_method:draft.payment_method==='due_on_receipt'?'ach':draft.payment_method,payment_terms:draft.payment_terms,subtotal:draft.subtotal,freight:draft.shipping,shipping_cost:draft.shipping,tax:draft.tax,total:draft.total,currency:'USD',totals_verified:true,tax_basis:{source:customer.tax_exempt?'customer_exemption':'staff_review',note:draft.tax_note,reviewed_by:actor.user_id},tax_exempt:customer.tax_exempt===true,ship_to_address_id:'order-'+draft.id,shipping_address:draft.shipping_address,billing_address:draft.billing_address,ship_to:{...draft.shipping_address,state:draft.shipping_address.province},ship_method:null,shipping_description:draft.shipping_name,po_number:draft.po_number,notes:draft.notes,tags:draft.tags,fulfillment_revision:0,accounting_status:'queued',credit_terms_requested:terms,created_at:at,placed_at:at,created_by:actor.user_id};
 const items=draft.lines.map((l,i)=>({...l,id:id+'-'+(i+1),order_id:id,customer_id:customerId,qty:l.quantity,inventory_sku:l.sku,status:'pending'}));
 const invoice={id:'INV-'+id,order_id:id,customer_id:customerId,customer_name:order.customer_name,amount:draft.total,total:draft.total,balance:draft.total,paid_amount:0,terms:draft.payment_terms,status:'open',accounting_status:'queued',created_at:at};
 const job={id:'qbo-invoice-'+id,order_id:id,invoice_id:invoice.id,commerce_order_id:draft.id,source_order_number:'UM-'+draft.id.slice(0,8).toUpperCase(),customer_id:customerId,commerce_customer_id:customer.id,kind:'qbo_invoice',status:'queued',attempts:0,created_at:at,updated_at:at};
 const source={...draft,draft:false,operational_order_id:id,number:'UM-'+draft.id.slice(0,8).toUpperCase(),workflow_state:'waiting_payment',accounting_status:'queued',submitted_at:at,events:[...draft.events,{id:crypto.randomUUID(),at,actor:actor.email,text:'Order created. Added to accounting, payment review and fulfillment.'}]};
 const address={...draft.shipping_address,id:order.ship_to_address_id,org_id:customerId,customer_id:customerId,line1:draft.shipping_address.address1,line2:draft.shipping_address.address2,state:draft.shipping_address.province,created_at:at};
 return {order,items,invoice,job,source,address};
}
