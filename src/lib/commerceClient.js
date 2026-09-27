export async function commerceRequest(query={},body){
 if(Array.isArray(query.selected_ids)){body={action:"list_selected",query};query={};}
 const response=await fetch('/api/admin/commerce-workspace?'+new URLSearchParams(Object.entries(query).filter(([,v])=>v!==undefined&&v!==null)),{credentials:'include',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json().catch(()=>({error:'The server did not return a valid response.'}));if(!response.ok)throw new Error(result.error||'Unable to load the workspace.');return result;
}
export const money=(v,currency='USD')=>v===null||v===undefined?'Not confirmed':new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(v)||0);
export const date=v=>v?new Date(v).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not recorded';
export const label=v=>String(v||'Not recorded').replaceAll('_',' ').replace(/^./,x=>x.toUpperCase());
export function downloadRows(rows,name){const keys=[...new Set(rows.flatMap(Object.keys))];const cell=v=>'"'+String(typeof v==='object'?JSON.stringify(v):v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';const blob=new Blob([keys.map(cell).join(',')+'\n'+rows.map(r=>keys.map(k=>cell(r[k])).join(',')).join('\n')],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
