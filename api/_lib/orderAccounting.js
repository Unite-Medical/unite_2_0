import crypto from 'node:crypto';
import {qboAccessContext} from './qboTokens.js';
const round=n=>Math.round(Number(n)*100)/100;
const escapeQuery=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
export function buildOrderInvoice(order,items,mapping){
 if(!mapping.customer_id)throw new Error('Match this customer in QuickBooks.');
 if(items.some(i=>!mapping.items?.[i.sku]))throw new Error('Match every product to its QuickBooks item.');
 if(order.freight>0&&!mapping.shipping_item_id)throw new Error('Choose the QuickBooks shipping item.');
 if(order.tax>0&&!mapping.tax_code_id)throw new Error('Choose the QuickBooks tax code.');
 const lines=items.map(i=>({Amount:round(i.ext_price??i.qty*i.unit_price),Description:i.name+' · '+i.sku,DetailType:'SalesItemLineDetail',SalesItemLineDetail:{ItemRef:{value:String(mapping.items[i.sku])},Qty:i.qty,UnitPrice:i.unit_price,TaxCodeRef:{value:order.tax_exempt||!order.tax?'NON':'TAX'}}}));
 if(order.freight>0)lines.push({Amount:round(order.freight),Description:'Shipping · '+(order.ship_method||''),DetailType:'SalesItemLineDetail',SalesItemLineDetail:{ItemRef:{value:String(mapping.shipping_item_id)},Qty:1,UnitPrice:round(order.freight),TaxCodeRef:{value:'NON'}}});
 if(round(lines.reduce((n,l)=>n+l.Amount,0)+Number(order.tax||0))!==round(order.total))throw new Error('The invoice total does not match the order.');
 const addr=a=>({Line1:a?.address1||'',Line2:a?.address2||'',City:a?.city||'',CountrySubDivisionCode:a?.province||'',PostalCode:a?.zip||'',Country:a?.country||'US'});
 const date=String(order.placed_at).slice(0,10),days=Number(String(order.payment_terms).match(/^net(\d+)$/)?.[1]||0),due=new Date(date+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+days);
 return {CustomerRef:{value:String(mapping.customer_id)},DocNumber:'UM-'+crypto.createHash('sha256').update(order.id).digest('hex').slice(0,16).toUpperCase(),TxnDate:date,DueDate:due.toISOString().slice(0,10),CurrencyRef:{value:'USD'},EmailStatus:'NotSet',Line:lines,ShipAddr:addr(order.shipping_address),BillAddr:addr(order.billing_address),...(order.contact_email?{BillEmail:{Address:order.contact_email}}:{}),PrivateNote:'Unite order '+order.id+(order.po_number?' · PO '+order.po_number:''),...(order.tax>0?{TxnTaxDetail:{TxnTaxCodeRef:{value:String(mapping.tax_code_id)},TotalTax:round(order.tax)}}:{})};
}
export async function postOrderInvoice({order,items,mapping,context,fetchImpl=fetch}){
 const root=context.environment==='production'?'https://quickbooks.api.intuit.com':'https://sandbox-quickbooks.api.intuit.com';
 async function request(path,body){const response=await fetchImpl(root+'/v3/company/'+encodeURIComponent(context.realmId)+'/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+context.accessToken,Accept:'application/json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});const result=await response.json();if(!response.ok)throw new Error('QuickBooks could not complete the request. Review the connection or item mappings.');return result;}
 const payload=buildOrderInvoice(order,items,mapping),query="select * from Invoice where DocNumber = '"+escapeQuery(payload.DocNumber)+"'";
 const found=await request('query?minorversion=75&query='+encodeURIComponent(query)),matches=found.QueryResponse?.Invoice||[];
 if(matches.length>1)throw new Error('Multiple QuickBooks invoices match this order. Accounting review is required.');
 let invoice=matches[0];if(invoice&&(!String(invoice.PrivateNote||'').includes('Unite order '+order.id)||String(invoice.CustomerRef?.value)!==String(mapping.customer_id)))throw new Error('The QuickBooks invoice reference belongs to a different record.');
 if(!invoice){const requestId=crypto.createHash('sha256').update('invoice:'+order.id).digest('hex').slice(0,40);const result=await request('invoice?minorversion=75&requestid='+requestId,payload);invoice=result.Invoice;}
 if(!invoice?.Id)throw new Error('QuickBooks did not confirm the invoice. Check again before retrying.');
 if(round(invoice.TotalAmt)!==round(order.total))throw new Error('QuickBooks calculated a different total. Review tax in QuickBooks before collecting payment.');
 return {id:String(invoice.Id),doc_number:invoice.DocNumber,total:invoice.TotalAmt,balance:invoice.Balance,url:'https://app.qbo.intuit.com/app/invoice?txnId='+encodeURIComponent(invoice.Id)};
}
export async function syncOrderAccounting(sql,orderId,{getContext=qboAccessContext,fetchImpl=fetch}={}){
 const get=async(table,id)=>(await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${id} AND deleted=false`)[0]?.data;
 const job=await get('accounting_jobs','qbo-invoice-'+orderId);if(!job)return {status:'not_queued'};if(job.status==='synced')return job;
 const claim=crypto.randomUUID();const claimed=await sql`UPDATE um_rows SET data=data||${JSON.stringify({status:'syncing',claim,updated_at:new Date().toISOString()})}::jsonb,updated_at=now() WHERE tbl='accounting_jobs' AND id=${job.id} AND deleted=false AND (data->>'status'!='syncing' OR updated_at<now()-interval '3 minutes') RETURNING id`;if(!claimed.length)return {status:'syncing'};
 let result;
 try{
  const context=await getContext(sql),order=await get('orders',orderId),customer=await get('commerce_customers',job.commerce_customer_id),settings=await get('accounting_settings','qbo')||{};
  const itemRows=await sql`SELECT data FROM um_rows WHERE tbl='order_items' AND data->>'order_id'=${orderId} AND deleted=false`;const items=itemRows.map(r=>r.data);
  const sameRealm=record=>record?.qbo_realm_id===context.realmId;
  const mapping={customer_id:sameRealm(customer)?customer.qbo_customer_id:null,shipping_item_id:settings.realm_id===context.realmId?settings.shipping_item_id:null,tax_code_id:settings.realm_id===context.realmId?settings.tax_code_id:null,items:{}};
  for(const item of items){const p=await get('commerce_products',item.product_id);mapping.items[item.sku]=sameRealm(p)?p.qbo_item_id:null;}
  const invoice=await postOrderInvoice({order,items,mapping,context,fetchImpl});result={...job,status:'synced',invoice,attempts:(job.attempts||0)+1,last_error:null,updated_at:new Date().toISOString()};
  const patch=JSON.stringify({accounting_status:'synced',qbo_invoice_id:invoice.id,qbo_invoice_url:invoice.url,qbo_synced_at:result.updated_at});
  await sql.transaction(tx=>[
   tx`UPDATE um_rows SET data=data||${patch}::jsonb,updated_at=now() WHERE tbl='orders' AND id=${orderId}`,
   tx`UPDATE um_rows SET data=data||${patch}::jsonb,updated_at=now() WHERE tbl='commerce_orders' AND id=${job.commerce_order_id}`,
   tx`UPDATE um_rows SET data=data||${patch}::jsonb,updated_at=now() WHERE tbl='invoices' AND id=${job.invoice_id}`,
  ]);
 }catch(error){const detail=String(error.message||'Accounting sync needs attention.');result={...job,status:/qbo_|token|configur|connect/i.test(detail)?'connection_required':/Match |Choose the QuickBooks/.test(detail)?'mapping_required':'retry_required',last_error:/qbo_/.test(detail)?'Connect QuickBooks Online in Integrations to send this invoice.':detail,attempts:(job.attempts||0)+1,updated_at:new Date().toISOString()};}
 await sql`UPDATE um_rows SET data=${JSON.stringify(result)}::jsonb,updated_at=now() WHERE tbl='accounting_jobs' AND id=${job.id} AND data->>'claim'=${claim}`;
 return result;
}
