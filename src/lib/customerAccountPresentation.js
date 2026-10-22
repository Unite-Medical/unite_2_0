export function accountContacts(profiles,orgId){
 return (profiles||[]).filter(p=>p.org_id===orgId&&!['disabled','inactive','terminated'].includes(p.status))
  .map(p=>({id:p.id,name:p.name||p.email||'Name not recorded',email:p.email||'',title:p.title||''}));
}
export function customerBillingSummary(methods,orgId){
 const labels={ach:'ACH',wire:'Wire transfer',card:'Card',net15:'Net 15',net30:'Net 30',net60:'Net 60',mspv:'MSPV'};
 const approved=[...new Set((methods||[]).filter(m=>m.org_id===orgId&&m.status==='active').map(m=>labels[m.method]||m.method))];
 return {approvedMethods:approved.length?approved.join(', '):'No approved payment methods recorded',bankDetails:'Bank details are not displayed here.',collection:'Follow the payment instructions on your invoice. An approved payment method does not mean a bank account is linked.'};
}
