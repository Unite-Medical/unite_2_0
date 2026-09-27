const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]));
export function financeWorkspace(invoices,organizations){
 const orgs=new Map(organizations.map(o=>[o.id,o]));
 return invoices.map(r=>({...pick(r,['kind','shipment_id','freight','tax','written_off_amount','id','order_id','customer_id','amount','total','paid_amount','balance','terms','status','due_date','paid_at','created_at','last_reminder_at']),customer_name:orgs.get(r.customer_id)?.name||r.customer_name||'Customer not recorded',billing_email:orgs.get(r.customer_id)?.billing_email||null}));
}
