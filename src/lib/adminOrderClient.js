export async function draftRequest(action,draft,revision=0){const r=await fetch('/api/admin/order-drafts',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:draft.id,draft,revision})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to save this order.');return data;}

// An address read belongs to one customer and the edit versions at request time.
// Never replace a later selection or a manually edited address with a late response.
export function applyOrderAddressDefaults(draft,{customerId,shipping,billing,expectedEdits,currentEdits,taxExempt}){
 if(draft.customer_id!==customerId)return draft;
 return {...draft,
  ...(expectedEdits.shipping_address===currentEdits.shipping_address?{shipping_address:shipping,tax_confirmed:taxExempt===true}:{}),
  ...(expectedEdits.billing_address===currentEdits.billing_address?{billing_address:billing}:{})
 };
}
