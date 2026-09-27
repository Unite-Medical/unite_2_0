export const exaConfigured=()=>Boolean(process.env.EXA_API_KEY);
export async function exaRequest(path,body,{method,fetcher=fetch}={}){
 if(!exaConfigured())throw new Error('Exa Websets is not connected.');
 if(!/^\/(websets|imports)(\/|\?|$)/.test(path))throw new Error('Invalid Exa resource.');
 const response=await fetcher('https://api.exa.ai/websets/v0'+path,{method:method||(body?'POST':'GET'),headers:{'x-api-key':process.env.EXA_API_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(response.status===402?'Exa needs additional credits to run this search.':response.status===401||response.status===403?'The Exa connection needs attention.':'Exa request failed (HTTP '+response.status+'): '+String(error.message||error.error?.message||'Please try again.').slice(0,180));}
 return response.json();
}
export function searchSpec(input){
 const query=String(input.query||'').trim();if(query.length<15||query.length>5000)throw new Error('Describe the target in 15–5,000 characters.');
 const count=Number(input.count||25);if(!Number.isInteger(count)||count<1||count>100)throw new Error('Choose 1–100 prospects.');
 const entity=['company','person'].includes(input.entity)?input.entity:'company';
 const criteria=(input.criteria||[]).map(c=>({description:String(typeof c==='string'?c:c.description).trim().slice(0,500)})).filter(c=>c.description);if(criteria.length>5)throw new Error('Use up to 5 criteria.');
 return {title:String(input.title||'Prospect search').trim().slice(0,140),search:{query,count,entity:{type:entity},...(entity==='person'?{maxPeoplePerCompany:1}:{}),...(criteria.length?{criteria}:{}),...(input.exclude_import_id?{exclude:[{source:'import',id:input.exclude_import_id}]}:{})},metadata:{workspace:'Unite Medical',requested_count:String(count)}};
}
export function enrichmentSpec(input){const description=String(input.description||'').trim();if(description.length<8||description.length>2000)throw new Error('Describe the enrichment in 8–2,000 characters.');const format=['text','number','date','email','phone','url'].includes(input.format)?input.format:'text';return {title:String(input.title||'Custom column').trim().slice(0,80),description,format};}
export async function websetItems(id,cursor){if(!/^webset_[a-zA-Z0-9]+$/.test(id))throw new Error('Invalid prospect list.');return exaRequest('/websets/'+id+'/items?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));}
export const DEFAULT_ENRICHMENTS=[
 {title:'Buying contact',description:'Find the publicly named owner, purchasing manager, supply-chain leader or practice administrator relevant to medical supplies. Return Full Name | Job Title | Source URL. Do not guess. Say Not found if unavailable.',format:'text'},
 {title:'Business email',description:'Find a publicly published business email for the organization or purchasing contact. Do not infer or guess an address. Cite the source.',format:'email'},
 {title:'Business phone',description:'Find the publicly listed main business phone. Do not return private mobile numbers.',format:'phone'},
 {title:'Product fit',description:'Which publicly evidenced offerings match a US medical-supply distributor selling orthopedic braces, cold therapy and clinical or surgical consumables? Name products and cite source URLs. This is research, not proof of purchasing intent.',format:'text'},
 {title:'Segment',description:'Classify the organization as DME / HME distributor, Medical-supply distributor, Orthopedic / pain practice, Ambulatory surgery center, Pharmacy with DME, or Other.',format:'text'},
];
