// Resolve explicit stable mappings only. Never guess by a name or email.
export function quoteCustomerContext(customerId,organizations=[],customers=[]){
 if(!customerId)return null;
 const active=organizations.filter(o=>o.status==='active'&&!o.workspace_internal);
 const direct=active.find(o=>o.id===customerId);
 if(direct)return {status:'mapped',customer_id:direct.id,name:direct.name,email:direct.contact_email||direct.billing_email||''};
 const customer=customers.find(c=>c.id===customerId);
 if(!customer)return {status:'unavailable',message:'This customer is not available in the quote account list. Return to Customers and choose it again.'};
 const matches=active.filter(o=>[customer.organization_id,customer.org_id].includes(o.id)||o.commerce_customer_id===customer.id||(o.shopify_customer_id&&o.shopify_customer_id===customer.shopify_id));
 if(matches.length===1){const o=matches[0];return {status:'mapped',customer_id:o.id,name:o.name,email:o.contact_email||o.billing_email||''};}
 return {status:matches.length?'ambiguous':'mapping_needed',commerce_customer_id:customer.id,name:customer.name,message:matches.length?'More than one quote account maps to this customer. Damon needs to confirm the correct account.':'This imported customer needs a linked quote account before a quote can be saved. You can create a customer order from this customer now; no duplicate account has been created.'};
}
