// Confidential source data. Import only from authenticated server handlers.
// Contract terms and unit rates are private runtime configuration, never public source.
export function wellSource() {
  let source;
  try { source=JSON.parse(process.env.WELLLINK_SOURCE_JSON||''); } catch { throw new Error('welllink_source_unavailable'); }
  if(!source?.contract?.id||!Array.isArray(source.products)||source.products.length!==6||source.products.some(p=>!p.sku||!p.size||!/^\d+(\.\d{1,20})?$/.test(p.unitPrice)||!Number.isSafeInteger(p.eachPerCase)||p.eachPerCase<1))throw new Error('welllink_source_unavailable');
  return source;
}

export const WELL_DOCUMENTS = [
  ['abstract','Contract abstract','contract-abstract.pdf'],
  ['master','Executed master contract','executed-master.pdf'],
  ['appendix-b','Executed Appendix B','executed-appendix-b.pdf'],
  ['participation','Participation form · blank','participation-form.pdf'],
  ['fee-template','Monthly admin-fee report template','admin-fee-template.xlsx'],
  ['next-steps','WellLink operating next steps','next-steps.pdf'],
  ['marketing','WellLink marketing guidelines','marketing-guidelines.pdf'],
].map(([id,title,file])=>({id,title,file}));

export const WELL_TASKS = [
  {id:'handoff',owner:'Damon',title:'Confirm the implementation handoff',detail:'The package refers to Unite_WellLink_Alex_Handoff.docx. Obtain that document and confirm the requested launch scope.'},
  {id:'pricing',owner:'Jacobe',title:'Reconcile the six contract SKUs',detail:'Retrieve original Appendix A, map each SKU to the sellable case, and verify the full-precision unit prices and pack counts.'},
  {id:'rounding',owner:'Ashley',title:'Approve invoice rounding and reporting',detail:'Compare full-precision unit extensions against rounded case totals. Confirm how tax, freight, credits, and returns flow into Appendix D with WellLink.'},
  {id:'roster',owner:'Jacobe',title:'Verify the current member roster',detail:'Use the latest controlled WellLink roster. Confirm facility and parent/child account matches. The roster is not in this package.'},
  {id:'participation',owner:'Jacobe',title:'Record accepted participation forms',detail:'Obtain the signed and accepted CPF and effective date for each facility. A blank form does not establish eligibility.'},
  {id:'inventory',owner:'Darren',title:'Verify stock, case packs, and dispatch',detail:'Confirm physical case quantities, lots, expiration dates, and the dispatch process for the six syringes. Do not infer sellable stock from product evidence.'},
  {id:'evidence',owner:'Damon',title:'Approve product evidence and claims',detail:'Review manufacturer evidence for SKU applicability and current validity before using certifications or regulatory claims in customer materials.'},
  {id:'marketing',owner:'Jacobe',title:'Confirm the launch meeting and announcement',detail:'Record WellLink’s launch meeting and member announcement, then prepare co-branded materials for the agreed marketing process.'},
  {id:'reporting',owner:'Ashley',title:'Set up monthly fee reporting',detail:'Use Appendix D for the monthly purchasing summary. Record report and payment references after review. This workspace does not send reports or make payments.'},
];

export function canUseWellLink(actor) {
  return actor?.role==='admin' || ['sales','sales_manager'].includes(actor?.role)&&actor?.email?.toLowerCase()==='jacobe@unitemedical.net'
    || actor?.role==='finance'&&actor?.email?.toLowerCase()==='accounting@unitemedical.net'
    || ['warehouse_operator','warehouse_manager'].includes(actor?.role)&&actor?.email?.toLowerCase()==='darren@unitemedical.net';
}

export function canEditWellTask(actor, task) {
  if (!canUseWellLink(actor)) return false;
  if (actor.role==='admin') return true;
  return task.owner===(actor.role==='finance'?'Ashley':actor.role.startsWith('warehouse_')?'Darren':'Jacobe');
}

function decimal(value) {
  if (!/^\d+(\.\d{1,20})?$/.test(String(value))) throw new Error('invalid_decimal');
  const [whole,fraction='']=String(value).split('.');
  return {value:BigInt(whole+fraction),scale:10n**BigInt(fraction.length)};
}
const dollars=cents=>`${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
export function wellExtension(sku, cases) {
  const product=wellSource().products.find(p=>p.sku===sku);
  if(!product)throw new Error('invalid_welllink_sku');
  if(!Number.isSafeInteger(cases)||cases<1||cases>10000)throw new Error('invalid_case_quantity');
  const price=decimal(product.unitPrice),each=BigInt(product.eachPerCase)*BigInt(cases);
  const cents=(price.value*each*100n+price.scale/2n)/price.scale;
  const caseCents=(price.value*BigInt(product.eachPerCase)*100n+price.scale/2n)/price.scale;
  return {sku,cases,each:Number(each),unitPrice:product.unitPrice,total:dollars(cents),roundedCaseTotal:dollars(caseCents*BigInt(cases)),roundingDifferenceCents:Number(caseCents*BigInt(cases)-cents)};
}

export function feePreview(month,gross) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2026-06'||month>'2100-12')throw new Error('invalid_reporting_month');
  if(!/^\d{1,10}(\.\d{1,2})?$/.test(String(gross)))throw new Error('invalid_gross_purchases');
  const amount=decimal(gross),cents=amount.value*100n/amount.scale;
  const [y,m]=month.split('-').map(Number),due=new Date(Date.UTC(y,m,0)+30*86400000).toISOString().slice(0,10);
  return {month,gross:dollars(cents),fee:dollars((cents*3n+50n)/100n),due,previewOnly:true};
}

export function taskPlan(existing,input,actor,now=new Date()) {
  const task=WELL_TASKS.find(t=>t.id===input.id);
  if(!task||!canEditWellTask(actor,task))return {ok:false,error:'welllink_task_forbidden'};
  if(!Number.isInteger(input.version)||input.version!==(existing?.version||0))return {ok:false,error:'welllink_changed_refresh'};
  if(!['open','in_progress','waiting','complete'].includes(input.status))return {ok:false,error:'welllink_invalid_status'};
  const note=String(input.note||'').trim(),evidence=String(input.evidence||'').trim();
  if(note.length>4000||evidence.length>1000)return {ok:false,error:'welllink_note_too_long'};
  if(input.status==='complete'&&!evidence)return {ok:false,error:'welllink_evidence_required'};
  const due=input.due_on===undefined?(existing?.due_on||null):input.due_on;
  if(due!==null&&(typeof due!=='string'||!/^(20\d{2}|2100)-\d{2}-\d{2}$/.test(due)||due<'2020-01-01'||due>'2100-12-31'||!Number.isFinite(Date.parse(`${due}T00:00:00.000Z`))||new Date(`${due}T00:00:00.000Z`).toISOString().slice(0,10)!==due))return {ok:false,error:'welllink_invalid_due_date'};
  return {ok:true,row:{id:task.id,status:input.status,note,evidence,due_on:due,version:input.version+1,updated_at:now.toISOString(),updated_by:actor.email}};
}

export function wellBoard(rows,actor) {
  if(!canUseWellLink(actor))return null;
  const {contract:WELLLINK,products:WELL_PRODUCTS}=wellSource();
  if(actor.role.startsWith('warehouse_'))return {commercial:false,contract:{id:WELLLINK.id,starts:WELLLINK.starts,ends:WELLLINK.ends,dispatch:WELLLINK.dispatch},products:WELL_PRODUCTS.map(({sku,size,description,boxes,eachPerBox,eachPerCase})=>({sku,size,description,boxes,eachPerBox,eachPerCase})),documents:[],tasks:WELL_TASKS.filter(t=>t.owner==='Darren').map(task=>({...task,...rows.find(r=>r.id===task.id),canEdit:true})),orderingEnabled:false};
  return {commercial:true,contract:WELLLINK,products:WELL_PRODUCTS.map(p=>({...p,oneCase:wellExtension(p.sku,1).total})),documents:WELL_DOCUMENTS.map(({id,title})=>({id,title})),tasks:WELL_TASKS.map(task=>({...task,...rows.find(r=>r.id===task.id),canEdit:canEditWellTask(actor,task)})),orderingEnabled:false};
}
