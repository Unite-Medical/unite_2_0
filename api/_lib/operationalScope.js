import {canReadUniteCustomerBook,approvedCustomerDatabase} from './customerReadAccess.js';
const email=value=>String(value||'').trim().toLowerCase();
export function ownsOperationalCustomer(customer,session,organizations=[]) {
 const owns=row=>row && ((session.user_id&&[row.account_owner_id,row.owner_id,row.assigned_to,row.account_rep].includes(session.user_id))||(session.email&&[row.account_rep,row.account_owner_email,row.owner_email].some(value=>value&&email(value)===email(session.email))));
 return owns(customer)||organizations.some(o=>(o.id===customer.id||o.id===customer.organization_id||o.id===customer.org_id||o.commerce_customer_id===customer.id||(o.shopify_customer_id&&o.shopify_customer_id===customer.shopify_id))&&owns(o));
}
export async function operationalCustomerScope(sql,session,req,env=process.env){
 if(session.role==='admin')return null;
 if(canReadUniteCustomerBook(session,env,req.headers?.host)&&await approvedCustomerDatabase(sql,env.DATABASE_URL))return null;
 const rows=await sql`SELECT tbl,data FROM um_rows WHERE tbl=ANY(${['organizations','commerce_customers']}) AND deleted=false`;
 const organizations=rows.filter(r=>r.tbl==='organizations').map(r=>r.data);
 return rows.filter(r=>r.tbl==='commerce_customers'&&ownsOperationalCustomer(r.data,session,organizations)).map(r=>r.data.id);
}
export const customerInScope=(scope,id)=>scope===null||scope.includes(id);

export const draftInScope=(scope,record,session)=>customerInScope(scope,record.customer_id)||(!record.customer_id&&record.draft===true&&record.created_by===session.user_id);
