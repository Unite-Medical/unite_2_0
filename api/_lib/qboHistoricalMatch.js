import {shopifyCatchupHash} from './shopifyCatchup.js';
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const reference = value => String(value || '').trim().replace(/^#/, '').toLowerCase();
const emails = value => new Set((String(value || '').toLowerCase().match(/[^\s,;<>]+@[^\s,;<>]+/g) || []));
const intersects = (a,b) => [...a].some(v => b.has(v));
const addressKey = value => normalized(String(value||'').toLowerCase().replace(/\b(suite|ste)\b/g,'ste').replace(/\b(drive|dr)\b/g,'dr').replace(/\b(highway|hwy)\b/g,'hwy').replace(/\b(road|rd)\b/g,'rd').replace(/\b(street|st)\b/g,'st'));
const cents = value => Number.isFinite(Number(value)) && value !== null && value !== '' ? Math.round(Number(value)*100) : null;
function custom(invoice,name){return (invoice.CustomField||[]).filter(f=>f.Name===name&&f.StringValue).map(f=>reference(f.StringValue));}
function poReferences(order){
 const source=order.source||order;
 const refs=[source.po_number];
 for(const line of String(source.note||'').split(/\r?\n/)){
  const match=line.match(/^\s*#?PO\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9-]*)\s*$/i);
  if(match)refs.push(match[1]);
 }
 return new Set(refs.filter(Boolean).map(reference));
}
export function qboCustomerEvidence(order,invoice,customers=[]){
 const source=order.source||order,result=[];
 const contact=new Set([...emails(source.email),...emails(source.customer?.email)]);
 if(intersects(contact,new Set([...emails(invoice.BillEmail?.Address),...emails(invoice.BillEmailCc?.Address)])))result.push('exact_invoice_customer_email');
 const customer=customers.find(c=>String(c.Id)===String(invoice.CustomerRef?.value));
 if(customer&&intersects(contact,emails(customer.PrimaryEmailAddr?.Address)))result.push('exact_qbo_customer_email');
 if(customer)for(const side of ['billing','shipping']){
  const a=source[side+'_address']||{},street=addressKey([a.address1,a.address2].filter(Boolean).join(' ')),postal=normalized(a.zip);
  for(const b of [customer.BillAddr,customer.ShipAddr].filter(Boolean)){
   const lines=Array.from({length:5},(_,n)=>String(b['Line'+(n+1)]||''));
   if(street.length>4&&postal&&postal===normalized(b.PostalCode)&&lines.some(line=>addressKey(line)===street))result.push('exact_qbo_customer_'+side+'_street_unit_postal');
  }
 }
 const companies=new Set(['billing','shipping'].map(side=>normalized(source[side+'_address']?.company)).filter(Boolean));
 if(companies.has(normalized(invoice.CustomerRef?.name)))result.push('exact_invoice_customer_company');
 for(const side of ['billing','shipping']){
  const a=source[side+'_address']||{},b=invoice[side==='billing'?'BillAddr':'ShipAddr']||{};
  const lines=Array.from({length:5},(_,n)=>String(b['Line'+(n+1)]||''));
  const postal=normalized(a.zip),street=normalized(a.address1);
  const postalInLine=a.zip&&lines.some(line=>line.split(/[\s,]+/).some(token=>normalized(token)===postal));
  if(street.length>4&&lines.some(line=>normalized(line)===street)&&postal&&(normalized(b.PostalCode)===postal||postalInLine))result.push('exact_'+side+'_street_postal');
 }
 return result;
}
export function planQboHistoricalMatches({orders,invoices,customers=[],allowedIds}){
 if(!Array.isArray(allowedIds)||allowedIds.length!==48||new Set(allowedIds).size!==48)throw new Error('exact_48_scope_required');
 if(orders.length!==48||new Set(orders.map(o=>o.id)).size!==48||orders.some(o=>!allowedIds.includes(o.id)||o.historical!==true))throw new Error('historical_scope_mismatch');
 if(new Set(invoices.map(i=>String(i.Id))).size!==invoices.length)throw new Error('duplicate_invoice_id');
 const rows=orders.map(order=>{
  const number=reference(order.number),pos=poReferences(order),candidates=[];
  const hasDirect=invoices.some(invoice=>custom(invoice,'Order Number').includes(number));
  for(const invoice of invoices){
   const refs=custom(invoice,'Order Number'),po=custom(invoice,'P.O. Number');
   const direct=refs.includes(number),byPo=!hasDirect&&!refs.length&&po.some(v=>pos.has(v));
   if(!direct&&!byPo)continue;
   const evidence=qboCustomerEvidence(order,invoice,customers);
   const total=cents(invoice.TotalAmt),balance=cents(invoice.Balance),currency=invoice.CurrencyRef?.value;
   const reasons=[];
   if(!evidence.length)reasons.push('customer_identity_unresolved');
   if(total===null||total!==cents(order.total))reasons.push('invoice_order_total_differs');
   if(currency!==order.currency)reasons.push('currency_differs');
   if(!invoice.CustomerRef?.value)reasons.push('invoice_customer_missing');
   if(balance===null||balance<0||balance>total)reasons.push('invalid_invoice_balance');
   candidates.push({invoice_id:String(invoice.Id),invoice_number:invoice.DocNumber,customer_id:String(invoice.CustomerRef?.value||''),reference:direct?'order_number':'purchase_order',identity_evidence:evidence,total:invoice.TotalAmt,balance:invoice.Balance,currency,updated_at:invoice.MetaData?.LastUpdatedTime,source_sha256:shopifyCatchupHash(invoice),reasons});
  }
  return {order_id:order.id,order_number:order.number,status:candidates.length===1&&!candidates[0].reasons.length?'confirmed':candidates.length?'ambiguous':'unmatched',candidates};
 });
 const claims=new Map();
 for(const row of rows.filter(r=>r.status==='confirmed')){const id=row.candidates[0].invoice_id;claims.set(id,[...(claims.get(id)||[]),row]);}
 for(const rows of claims.values())if(rows.length>1)for(const row of rows){row.status='ambiguous';row.candidates[0].reasons.push('invoice_claimed_by_multiple_orders');}
 return {counts:Object.fromEntries(['confirmed','ambiguous','unmatched'].map(s=>[s,rows.filter(r=>r.status===s).length])),rows};
}
export function reconciledQboPayment(order,match,{realmFingerprint,retrievedAt,scopeEvidenceHash}){
 if(match.status!=='confirmed'||match.order_id!==order.id||match.candidates.length!==1||match.candidates[0].reasons.length)throw new Error('confirmed_match_required');
 const invoice=match.candidates[0];
 if(!realmFingerprint||!Number.isFinite(Date.parse(retrievedAt))||!/^[a-f0-9]{64}$/.test(scopeEvidenceHash||''))throw new Error('accounting_provenance_required');
 const proof={source:'quickbooks_online',status:'verified',realm_fingerprint:realmFingerprint,invoice_id:invoice.invoice_id,invoice_number:invoice.invoice_number,customer_id:invoice.customer_id,reference:invoice.reference,identity_evidence:invoice.identity_evidence,total:invoice.total,balance:invoice.balance,currency:invoice.currency,invoice_updated_at:invoice.updated_at,source_sha256:invoice.source_sha256,scope_evidence_sha256:scopeEvidenceHash};
 const same=order.accounting_reconciliation&&shopifyCatchupHash(proof)===shopifyCatchupHash(Object.fromEntries(Object.entries(order.accounting_reconciliation).filter(([k])=>k!=='retrieved_at')));
 if(same)return null;
 return {...order,source_financial_status:order.source_financial_status??order.financial_status,source_total_outstanding:order.source_total_outstanding??order.total_outstanding,financial_status:invoice.balance===0?'paid':cents(invoice.balance)===cents(invoice.total)?'unpaid':'partially_paid',total_outstanding:invoice.balance,payment_reconciliation_status:'matched_quickbooks',payment_amount_status:'qbo_invoice_balance',accounting_reconciliation:{...proof,retrieved_at:retrievedAt},revision:Number(order.revision||0)+1};
}
