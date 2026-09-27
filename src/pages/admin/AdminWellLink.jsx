import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useSearchParams} from 'react-router-dom';
import {AdminShell} from '../../components/layout/AdminShell.jsx';
import {WorkspaceIcon as Icon} from '../../components/workspace/WorkspaceIcon.jsx';
import {workspaceRequest,postWorkspace} from '../../lib/workspaceRequest.js';
import {auth} from '../../lib/auth.js';
import {useSEO} from '../../lib/seo.js';
import '../../styles/welllink.css';

const endpoint='/api/admin/welllink';
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value));
const labels={open:'To do',in_progress:'In progress',waiting:'Waiting',complete:'Complete'};
const statusOf=task=>task.status||'open';
const shortDate=value=>value?new Date(`${value.slice(0,10)}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not set';
const dateToday=()=>{const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;};
const tabs=[['launch','Work','list'],['pricing','Products & pricing','box'],['reporting','Monthly close','money'],['documents','Documents','inbox']];
const docDescriptions={abstract:'Commercial terms at a glance',master:'Signed agreement · June 2026–May 2029','appendix-b':'Executed pricing and operating provisions',participation:'Blank member participation form','fee-template':'Original Appendix D workbook','next-steps':'WellLink launch and operating contacts',marketing:'Co-branding and announcement process'};

function Download({id,title,compact=false}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function download(){
    if(busy)return;setBusy(true);setError('');
    try{
      const response=await fetch(`${endpoint}?document=${encodeURIComponent(id)}`,{credentials:'include'});
      if(!response.ok)throw new Error(response.status===401?'Sign in again to download this document.':response.status===403?'Your account cannot download this document.':'The download could not be prepared. Try again.');
      const type=response.headers.get('content-type')||'';
      if(!type.includes('application/pdf')&&!type.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new Error('The server returned an unexpected file. Try again.');
      const url=URL.createObjectURL(await response.blob()),anchor=document.createElement('a');
      anchor.href=url;anchor.download=`WellLink-${id}.${type.includes('pdf')?'pdf':'xlsx'}`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
  }
  return <div className={compact?'wl-download-compact':'wl-download'}><button type="button" className={compact?'wl-button':'wl-document'} disabled={busy} onClick={download} aria-label={`Download ${title}`}>
    {!compact&&<span className="wl-file-type">{id==='fee-template'?'XLSX':'PDF'}</span>}<span>{compact?title:<><strong>{title}</strong><small>{docDescriptions[id]}</small></>}</span><span className="wl-download-arrow" aria-hidden="true">{busy?'…':'↓'}</span>
  </button>{error&&<p role="alert" className="wl-error">{error}</p>}</div>;
}

function TaskDrawer({task,onClose,onSaved,onDirtyChange}) {
  const dialog=useRef(null),closeButton=useRef(null),returnFocus=useRef(null);
  const [status,setStatus]=useState(statusOf(task)),[note,setNote]=useState(task.note||''),[evidence,setEvidence]=useState(task.evidence||''),[due,setDue]=useState(task.due_on||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmClose,setConfirmClose]=useState(false);
  const dirty=status!==statusOf(task)||note!==(task.note||'')||evidence!==(task.evidence||'')||due!==(task.due_on||'');
  useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
  useEffect(()=>{
    returnFocus.current=document.activeElement;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    dialog.current?.showModal();closeButton.current?.focus({preventScroll:true});
    return()=>{document.body.style.overflow=previous;returnFocus.current?.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{if(!dirty)return;const guard=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
  function close(){if(busy)return;if(dirty){setConfirmClose(true);return;}onClose();}
  async function save(e){
    e.preventDefault();if(busy)return;setBusy(true);setError('');
    try{const result=await postWorkspace(endpoint,{action:'save_task',id:task.id,version:task.version||0,status,note,evidence,due_on:due||null});onSaved(result.row);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return createPortal(<dialog ref={dialog} className="wl-drawer" aria-labelledby="wl-task-title" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===dialog.current)close();}}>
    <form onSubmit={save} className="wl-drawer-form">
      <header className="wl-drawer-header"><span>WellLink / Work item</span><button ref={closeButton} type="button" className="wl-icon-button" disabled={busy} onClick={close} aria-label="Close work item"><Icon name="close"/></button></header>
      <div className="wl-drawer-scroll"><div className="wl-task-owner"><span className="wl-avatar">{task.owner[0]}</span>{task.owner}<span className={`wl-badge ${statusOf(task)}`}>{labels[statusOf(task)]}</span></div><h2 id="wl-task-title">{task.title}</h2><p className="wl-task-description">{task.detail}</p>
        <fieldset disabled={!task.canEdit||busy}><div className="wl-form-two"><label>Progress<select value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Follow up on<input type="date" min="2020-01-01" max="2100-12-31" value={due} onChange={e=>setDue(e.target.value)}/></label></div>
          <label>Next step or internal note<textarea rows={5} maxLength={4000} value={note} onChange={e=>setNote(e.target.value)} placeholder="What happened, and what needs to happen next?"/></label>
          <label>Evidence reference <span className="wl-label-hint">{status==='complete'?'Required to complete':'Optional until complete'}</span><input maxLength={1000} value={evidence} onChange={e=>setEvidence(e.target.value)} required={status==='complete'} placeholder="Document ID or controlled file location"/></label>
        </fieldset>
        {!task.canEdit&&<p className="wl-inline-note"><Icon name="shield" size={16}/>{task.owner} or an administrator can update this step.</p>}
        {task.updated_at&&<p className="wl-save-history">Last saved {new Date(task.updated_at).toLocaleString()}<br/>{task.updated_by}</p>}
        {error&&<p role="alert" className="wl-error">{error} Your draft is still here.</p>}
      </div>
      <footer className="wl-drawer-footer">{confirmClose?<div className="wl-discard"><strong>Keep your unsaved changes?</strong><p>Close this panel only if you want to discard the current draft.</p><div><button type="button" className="wl-button" onClick={()=>setConfirmClose(false)}>Keep editing</button><button type="button" className="wl-button danger" onClick={onClose}>Discard & close</button></div></div>:<><span className="wl-draft-status">{busy?'Saving to Unite…':dirty?'Unsaved changes':'Up to date'}</span><button type="button" className="wl-button" disabled={busy} onClick={close}>{dirty?'Cancel':'Close'}</button>{task.canEdit&&<button className="wl-button primary" disabled={!dirty||busy}>{busy?'Saving…':'Save update'}<Icon name="check" size={16}/></button>}</>}</footer>
    </form>
  </dialog>,document.body);
}

function WorkList({tasks,onOpen,isAdmin}) {
  const [filter,setFilter]=useState('open'),[owner,setOwner]=useState('all'),[search,setSearch]=useState('');
  const owners=[...new Set(tasks.map(t=>t.owner))],today=dateToday();
  const counts={open:tasks.filter(t=>statusOf(t)!=='complete').length,mine:tasks.filter(t=>t.canEdit&&statusOf(t)!=='complete').length,waiting:tasks.filter(t=>statusOf(t)==='waiting').length,complete:tasks.filter(t=>statusOf(t)==='complete').length};
  const items=tasks.filter(t=>(filter==='all'||filter==='mine'&&t.canEdit&&statusOf(t)!=='complete'||filter==='open'&&statusOf(t)!=='complete'||statusOf(t)===filter)&&(owner==='all'||owner===t.owner)&&`${t.title} ${t.owner} ${t.note||''}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="wl-panel wl-work-panel" aria-labelledby="wl-work-title"><div className="wl-panel-heading"><div><h2 id="wl-work-title">{isAdmin?'Program work':'Your program work'}</h2><p>Open a step to add an update, evidence, or a follow-up date.</p></div><span className="wl-count">{tasks.length} steps</span></div>
    <div className="wl-toolbar"><div className="wl-filter-group" aria-label="Work status">{[['open','Open'],['waiting','Waiting'],['complete','Complete']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}<span>{counts[value]}</span></button>)}</div><div className="wl-filter-fields"><label className="wl-search"><Icon name="search" size={16}/><input type="search" aria-label="Search WellLink work" placeholder="Find a step…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{owners.length>1&&<select aria-label="Filter by owner" value={owner} onChange={e=>setOwner(e.target.value)}><option value="all">All owners</option>{owners.map(name=><option key={name}>{name}</option>)}</select>}</div></div>
    {items.length?<ul className="wl-work-list">{items.map(task=><li key={task.id}><button className="wl-work-row" onClick={()=>onOpen(task)}><span className={`wl-task-mark ${statusOf(task)}`}>{statusOf(task)==='complete'?<Icon name="check" size={15}/>:statusOf(task)==='waiting'?<Icon name="clock" size={15}/>:<span/>}</span><span className="wl-work-copy"><strong>{task.title}</strong><span>{task.note||task.detail}</span><small><span className="wl-mobile-owner">{task.owner} · </span>{task.due_on?<span className={task.due_on<today&&statusOf(task)!=='complete'?'wl-overdue':''}>Follow up {shortDate(task.due_on)}</span>:task.canEdit?'Ready for your update':'Assigned to '+task.owner}</small></span><span className="wl-owner-chip"><span className="wl-avatar">{task.owner[0]}</span>{task.owner}</span><span className={`wl-badge ${statusOf(task)}`}>{labels[statusOf(task)]}</span><Icon name="chevron" size={16}/></button></li>)}</ul>:<div className="wl-empty"><Icon name={filter==='complete'?'check':'search'} size={26}/><h3>{filter==='complete'?'No completed steps in this view':'No open steps match this view'}</h3><p>{search||owner!=='all'?'Try another owner or clear your search.':'Updates will appear here as the team moves the program forward.'}</p>{(search||owner!=='all')&&<button className="wl-button" onClick={()=>{setSearch('');setOwner('all');}}>Clear filters</button>}</div>}
  </section>;
}

function PriceReview({products,commercial}) {
  const [sku,setSku]=useState(products[0].sku),[cases,setCases]=useState('1'),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const selected=products.find(p=>p.sku===sku),generation=useRef(0),calculator=useRef(null);
  function change(nextSku,nextCases=cases){generation.current++;setSku(nextSku);setCases(nextCases);setResult(null);setError('');setBusy(false);}
  useEffect(()=>()=>{generation.current++;},[]);
  async function calculate(e){e.preventDefault();const run=++generation.current;setBusy(true);setError('');setResult(null);try{const value=await postWorkspace(endpoint,{action:'price_preview',sku,cases:Number(cases)});if(run===generation.current)setResult(value);}catch(e){if(run===generation.current)setError(e.message);}finally{if(run===generation.current)setBusy(false);}}
  function choose(product){change(product.sku);if(window.matchMedia('(max-width: 1100px)').matches)calculator.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  return <div className={commercial?'wl-product-layout':'wl-warehouse-products'}><section className="wl-panel"><div className="wl-panel-heading"><div><h2>Standard Luer Lock syringes</h2><p>Six products · Without needles · Case quantities</p></div><Icon name="box" size={22}/></div><div className="wl-product-list">{products.map(p=><div key={p.sku} className={`wl-product-row ${commercial&&p.sku===sku?'is-selected':''}`}><div className="wl-product-size">{p.size||p.description.split(' Luer')[0]}</div><div className="wl-product-copy"><strong>{p.description}</strong><span className="wl-sku">{p.sku}</span><small>{p.boxes} boxes × {p.eachPerBox} each <span>·</span> {p.eachPerCase.toLocaleString()} / case</small></div>{commercial&&<div className="wl-product-action"><strong>{money(p.oneCase)}<small>/ case*</small></strong><button className="wl-text-button" onClick={()=>choose(p)} aria-label={`Calculate ${p.size} syringe cases`}>Calculate <Icon name="arrow" size={14}/></button></div>}</div>)}</div>{commercial&&<p className="wl-panel-footnote">*One-case preview, rounded to cents. Contract prices are pending reconciliation and are not active customer prices.</p>}</section>
    {commercial&&<aside className="wl-calculator" ref={calculator}><div className="wl-panel"><div className="wl-panel-heading"><div><span className="wl-kicker">Price check</span><h2>Calculate a case total</h2></div></div><form onSubmit={calculate} className="wl-form"><label>Product<select value={sku} onChange={e=>change(e.target.value)}>{products.map(p=><option key={p.sku} value={p.sku}>{p.size} syringe</option>)}</select></label><label>Number of cases<input type="number" required min="1" max="10000" step="1" value={cases} onChange={e=>change(sku,e.target.value)}/></label><div className="wl-unit-note"><span>Source price / each</span><strong>${selected.unitPrice}</strong><small>{selected.eachPerCase.toLocaleString()} each per case</small></div><button className="wl-button primary" disabled={busy}>{busy?'Calculating…':'Calculate total'}<Icon name="arrow" size={16}/></button></form>{error&&<p role="alert" className="wl-error">{error}</p>}{result?<div className="wl-result" role="status"><span>Product total</span><strong>{money(result.total)}</strong><p>{result.cases} cases · {result.each.toLocaleString()} each</p><details><summary>How this was calculated</summary><p>The original unit price is multiplied by the total quantity, then rounded once to cents.</p><p>Multiplying a rounded case price would give {money(result.roundedCaseTotal)}{result.roundingDifferenceCents!==0?` (${Math.abs(result.roundingDifferenceCents)}¢ difference).`:'.'}</p></details></div>:<div className="wl-calculator-empty"><Icon name="money" size={20}/><p>Choose a product and quantity to check the total.</p></div>}<p className="wl-small-note">Internal preview. Freight, tax, and payment discounts are excluded.</p>{selected.crossReference&&<p className="wl-small-note">5 mL reference: {selected.crossReference}. Commercial reference only; not a clinical equivalence claim.</p>}</div></aside>}
  </div>;
}

function FeeReview({onOpen,task}) {
  const [month,setMonth]=useState(dateToday().slice(0,7)),[gross,setGross]=useState(''),[result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),generation=useRef(0);
  function change(field,value){generation.current++;if(field==='month')setMonth(value);else setGross(value);setResult(null);setError('');setBusy(false);}
  useEffect(()=>()=>{generation.current++;},[]);
  async function calculate(e){e.preventDefault();const run=++generation.current;setBusy(true);setError('');setResult(null);try{const value=await postWorkspace(endpoint,{action:'fee_preview',month,gross});if(run===generation.current)setResult(value);}catch(e){if(run===generation.current)setError(e.message);}finally{if(run===generation.current)setBusy(false);}}
  return <div className="wl-close-layout"><section className="wl-panel"><div className="wl-panel-heading"><div><span className="wl-kicker">Ashley · Monthly close</span><h2>Check the admin fee</h2><p>3% of reviewed gross purchases. Due 30 days after month-end.</p></div><Icon name="money" size={24}/></div><form className="wl-form" onSubmit={calculate}><div className="wl-form-two"><label>Reporting month<input type="month" min="2026-06" max="2100-12" required value={month} onChange={e=>change('month',e.target.value)}/></label><label>Reviewed gross purchases ($)<input inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?" value={gross} onChange={e=>change('gross',e.target.value)} placeholder="0.00"/></label></div><button className="wl-button primary" disabled={busy}>{busy?'Calculating…':'Calculate admin fee'}<Icon name="arrow" size={16}/></button></form>{error&&<p role="alert" className="wl-error">{error}</p>}{result&&<div className="wl-result wl-fee-result" role="status"><div><span>Estimated admin fee</span><strong>{money(result.fee)}</strong><p>3% of {money(result.gross)}</p></div><div><span>Report & payment due</span><b>{shortDate(result.due)}</b></div></div>}<p className="wl-small-note">Planning only. Reconcile freight, tax, credits, and returns before reporting. This calculation does not send a report or make a payment.</p></section><aside className="wl-panel wl-close-steps"><h2>Close the month</h2><ol><li><span>1</span><div><strong>Reconcile purchases</strong><p>Confirm the member sales and adjustments for this period.</p></div></li><li><span>2</span><div><strong>Prepare Appendix D</strong><p>Use WellLink’s original reporting workbook.</p><Download id="fee-template" title="Download template" compact/></div></li><li><span>3</span><div><strong>Record the next step</strong><p>Keep your report and payment references in the shared work item.</p>{task&&<button className="wl-text-button" onClick={()=>onOpen(task)}>Open reporting step <Icon name="arrow" size={14}/></button>}</div></li></ol></aside></div>;
}

function Documents({documents}) {
  const [search,setSearch]=useState('');
  const shown=documents.filter(d=>`${d.title} ${docDescriptions[d.id]}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="wl-panel"><div className="wl-panel-heading"><div><h2>Program documents</h2><p>Original contract and operating files, available to authorized staff.</p></div><label className="wl-search"><Icon name="search" size={16}/><input type="search" aria-label="Search program documents" placeholder="Find a document…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div><div className="wl-documents">{shown.map(doc=><Download key={doc.id} id={doc.id} title={doc.title}/>)}</div>{!shown.length&&<div className="wl-empty"><h3>No documents match</h3><button className="wl-button" onClick={()=>setSearch('')}>Clear search</button></div>}<div className="wl-document-note"><Icon name="shield" size={18}/><p>Internal use. Signed contracts and pricing are not public. Manufacturer certificates require a separate applicability and validity review.</p></div></section>;
}

function WellLinkView({session}) {
  const [params,setParams]=useSearchParams(),[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState(null),[dirty,setDirty]=useState(false),[notice,setNotice]=useState('');
  const panel=useRef(null),navigation=useRef(null),loadRun=useRef(0),noticeTimer=useRef(null);
  const requested=params.get('view')||'launch',tab=tabs.some(([id])=>id===requested)&&(data?.commercial||requested==='launch'||requested==='pricing')?requested:'launch';
  useSEO({title:'WellLink · Team workspace',noindex:true});
  const load=useCallback(async(signal)=>{const run=++loadRun.current;setLoading(true);try{const body=await workspaceRequest(endpoint,{signal});if(!signal?.aborted&&run===loadRun.current){setData(body);setError('');}}catch(e){if(!signal?.aborted&&run===loadRun.current)setError(e.message);}finally{if(!signal?.aborted&&run===loadRun.current)setLoading(false);}},[]);
  useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>{if(!controller.signal.aborted)load(controller.signal);});return()=>{controller.abort();loadRun.current=-1;clearTimeout(noticeTimer.current);};},[load]);
  function announce(message){clearTimeout(noticeTimer.current);setNotice(message);noticeTimer.current=setTimeout(()=>setNotice(''),7000);}
  function changeTab(next){const scrolledPastStart=panel.current&&navigation.current&&panel.current.getBoundingClientRect().top<navigation.current.getBoundingClientRect().bottom;setParams(next==='launch'?{}:{view:next},{replace:true});if(scrolledPastStart)requestAnimationFrame(()=>panel.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));}
  function tabKey(e){if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const buttons=[...navigation.current.querySelectorAll('[role=tab]')],index=buttons.indexOf(e.target);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus({preventScroll:true});buttons[next].click();buttons[next].scrollIntoView({block:'nearest',inline:'nearest'});}
  function saveTask(row){const title=selected.title;setData(current=>({...current,tasks:current.tasks.map(t=>t.id===row.id?{...t,...row}:t)}));setSelected(null);setDirty(false);announce(`${title}: update saved.`);}
  const complete=data?.tasks.filter(t=>statusOf(t)==='complete').length||0,waiting=data?.tasks.filter(t=>statusOf(t)==='waiting').length||0,next=data?.tasks.find(t=>t.canEdit&&statusOf(t)!=='complete');
  const visibleTabs=tabs.filter(([id])=>data?.commercial||['launch','pricing'].includes(id));
  return <AdminShell active="welllink" unsavedChanges={dirty}><main id="main" className="uw-workday wl-page">
    <header className="wl-header"><div><div className="wl-breadcrumb">Partner programs <span>/</span> CC-NS-0052</div><h1>WellLink <span className="wl-program-badge">Preparation</span></h1><p>Standard hypodermics <span>·</span> Jun 2026 – May 2029</p></div><div className="wl-header-actions">{data?.commercial&&<Download id="abstract" title="Contract summary" compact/>}<button className="wl-button wl-refresh" onClick={()=>load()} disabled={loading||dirty} aria-label="Refresh WellLink workspace"><Icon name="refresh" size={16}/><span>{loading?'Refreshing…':'Refresh'}</span></button></div></header>
    {error&&<div className="wl-error" role="alert"><strong>{data?'Refresh failed. Showing the last loaded information.':'Unable to load WellLink.'}</strong> {error}<button className="wl-text-button" onClick={()=>load()} disabled={loading}>Try again</button></div>}
    {!data&&loading&&<div className="wl-loading" role="status"><span/><span/><span/><p>Loading your program workspace…</p></div>}
    {data&&<><section className="wl-summary" aria-label="Program progress"><div className="wl-summary-progress"><span className="wl-progress-ring" style={{'--progress':`${complete/data.tasks.length*100}%`}}><Icon name={complete===data.tasks.length?'check':'list'} size={21}/></span><div><strong>{complete} of {data.tasks.length} complete</strong><span>{data.tasks.length-complete} open steps{waiting?` · ${waiting} waiting`:''}</span></div></div><div className="wl-next-action"><span>Next for {session.role==='admin'?'the team':next?.owner||'you'}</span><button className="wl-text-button" disabled={!next} onClick={()=>setSelected(next)}>{next?.title||'All your steps are complete'}{next&&<Icon name="arrow" size={16}/>}</button></div><details className="wl-readiness"><summary><span/>Ordering not activated <Icon name="chevron" size={14}/></summary><div><strong>Preparation does not enable customer discounts.</strong><p>The separate implementation handoff, original Appendix A, latest member roster, and accepted participation forms need reconciliation before member ordering can be connected.</p></div></details></section>
    <nav ref={navigation} className="wl-tabs" role="tablist" aria-label="WellLink views" onKeyDown={tabKey}>{visibleTabs.map(([id,label,icon])=><button key={id} id={`wl-tab-${id}`} role="tab" type="button" aria-selected={tab===id} tabIndex={tab===id?0:-1} aria-controls={`wl-panel-${id}`} onClick={()=>changeTab(id)}><Icon name={icon} size={17}/>{!data.commercial&&id==='pricing'?'Case packs':label}{id==='launch'&&<span>{data.tasks.length-complete}</span>}</button>)}</nav>
    <div ref={panel} className="wl-view-content"><section hidden={tab!=='launch'} role="tabpanel" id="wl-panel-launch" aria-labelledby="wl-tab-launch"><WorkList tasks={data.tasks} onOpen={setSelected} isAdmin={session.role==='admin'}/><div className="wl-work-bottom"><Icon name="shield" size={14}/><span>Updates are shared with your team. Each completed step needs an evidence reference.</span></div></section>
      <section hidden={tab!=='pricing'} role="tabpanel" id="wl-panel-pricing" aria-labelledby="wl-tab-pricing"><PriceReview products={data.products} commercial={data.commercial}/>{data.commercial&&<details className="wl-contract-details"><summary>Contract terms & source notes <Icon name="chevron" size={15}/></summary><dl>{[['Payment',data.contract.terms],['Minimum order',data.contract.minimum],['Freight',data.contract.freight],['Dispatch',data.contract.dispatch],['Price protection',data.contract.priceProtection],['Eligibility',data.contract.participation]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><p>{data.contract.pricingSource}</p></details>}</section>
      {data.commercial&&<><section hidden={tab!=='reporting'} role="tabpanel" id="wl-panel-reporting" aria-labelledby="wl-tab-reporting"><FeeReview onOpen={setSelected} task={data.tasks.find(t=>t.id==='reporting')}/></section><section hidden={tab!=='documents'} role="tabpanel" id="wl-panel-documents" aria-labelledby="wl-tab-documents"><Documents documents={data.documents}/></section></>}
    </div><footer className="wl-page-footer"><span><Icon name="shield" size={13}/>Private staff workspace</span><span>Prices and participation remain under review</span></footer></>}
    {notice&&<div className="wl-toast" role="status"><Icon name="check" size={18}/><span>{notice}</span><button className="wl-icon-button" aria-label="Dismiss update confirmation" onClick={()=>setNotice('')}><Icon name="close" size={16}/></button></div>}
    {selected&&<TaskDrawer task={selected} onClose={()=>setSelected(null)} onSaved={saveTask} onDirtyChange={setDirty}/>}
  </main></AdminShell>;
}

export function AdminWellLink(){const session=auth.use();return <WellLinkView key={`${session?.user_id}:${session?.role}`} session={session}/>;}
