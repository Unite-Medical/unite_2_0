import {useDetailFocus} from '../lib/useDetailFocus.js';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {AdminShell} from '../components/layout/AdminShell.jsx';
import {WorkspaceIcon} from '../components/workspace/WorkspaceIcon.jsx';
import {auth} from '../lib/auth.js';
import {workspaceRequest,postWorkspace} from '../lib/workspaceRequest.js';
import {STAFF_TEAMS,teamForRole} from '../lib/staffWorkspace.js';
import {useSEO} from '../lib/seo.js';
import '../styles/staff-workspace.css';

const fmtDate=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'No deadline set';
const localDate=value=>{if(!value)return '';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
function HandoffAction({item,onSaved}) {
 const [reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{await postWorkspace('/api/orders/handoff',{order_id:item.source_id,handoff_reference:reference});await onSaved();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <form className="uw-followup uw-handoff" onSubmit={submit}><h3>Record carrier handoff</h3><p>Use this only after the carrier or pickup driver has collected this shipment. Existing payment, stock, lot, and approval checks are enforced again.</p><label>Pickup scan, manifest, or signed handoff reference<input required maxLength={200} value={reference} onChange={e=>setReference(e.target.value)}/></label><label className="uw-checkbox"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>The carrier has collected the shipment.</label>{error&&<p role="alert" className="uw-error">{error}</p>}<button className="uw-button primary" disabled={busy||!confirmed||!reference.trim()}>{busy?'Recording…':'Record handoff'}</button></form>;
}
function WorkDetail({item,onClose,onSaved,onDirtyChange}){
 const detailHeading=useDetailFocus(item.id);
 const [draft,setDraft]=useState({state:item.work_status,next_action:item.next_action,note:item.note,due_at:localDate(item.due_at),claim:false});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const dirty=draft.state!==item.work_status||draft.next_action!==item.next_action||draft.note!==item.note||draft.due_at!==localDate(item.due_at)||draft.claim;
 const firstField=useRef(null);
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false);},[dirty,onDirtyChange]);
 useEffect(()=>{function guard(e){if(dirty){e.preventDefault();e.returnValue='';}}window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty]);
 async function save(e){e.preventDefault();setBusy(true);setError('');try{await postWorkspace('/api/account/work',{id:item.id,version:item.version,source_version:item.source_version,...draft,due_at:draft.due_at?new Date(draft.due_at).toISOString():null});setSaved(true);await onSaved();}catch(err){setError(err.message);}finally{setBusy(false);}}
 function close(){if(dirty&&!saved){setError('Save your changes first, or use Discard changes to close.');return;}onClose();}
 return <aside className="uw-detail" aria-label="Work item details"><header className="uw-detail-header"><span className="uw-eyebrow">{item.category}</span><button className="uw-icon-button" aria-label="Close work item" onClick={close}><WorkspaceIcon name="close"/></button></header><h2 ref={detailHeading} tabIndex={-1} style={{scrollMarginTop:80}}>{item.title}</h2><p className="uw-detail-summary">{item.summary||'Unite Medical team workspace'}</p><div className="uw-detail-badges"><span className={`uw-badge ${item.overdue?'is-overdue':''}`}>{item.overdue?'Overdue':item.work_status.replaceAll('_',' ')}</span><span className="uw-badge">{item.status.replaceAll('_',' ')}</span></div>
  {item.changed_since_followup&&<p className="uw-notice">This record changed. Review the current details before setting the next step.</p>}
  <div className="uw-next-step"><span>Next step</span><p>{item.next_action}</p>{item.href&&<Link className="uw-button primary" to={item.href}>Open {item.category==='Invoice'?'invoice':item.category==='Incoming'?'receiving':item.category==='Refund'?'refund review':'workflow'}<WorkspaceIcon name="arrow" size={16}/></Link>}</div>
  <dl className="uw-facts">{item.details.map(({label,value})=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}<div><dt>Follow-up owner</dt><dd>{item.owner_email||'Not assigned'}</dd></div></dl>
  {item.actions?.includes('handoff')&&<HandoffAction item={item} onSaved={onSaved}/>}
  <form onSubmit={save} className="uw-followup"><div className="uw-section-title"><h3>Keep the next step clear</h3><WorkspaceIcon name="list" size={18}/></div><p>Save a team note and follow-up here. Business decisions stay in their approval workflows.</p>
   <label>Progress<select ref={firstField} value={draft.state} onChange={e=>setDraft({...draft,state:e.target.value})}><option value="open">To do</option><option value="in_progress">In progress</option><option value="waiting">Waiting on a response</option></select></label>
   <label>Next action<input required maxLength={1500} value={draft.next_action} onChange={e=>setDraft({...draft,next_action:e.target.value})}/></label>
   <label>Follow up on<input type="datetime-local" value={draft.due_at} onChange={e=>setDraft({...draft,due_at:e.target.value})}/></label>
   <label>Internal note<textarea rows={4} maxLength={4000} placeholder="What happened? What does the next person need to know?" value={draft.note} onChange={e=>setDraft({...draft,note:e.target.value})}/></label>
   <label className="uw-checkbox"><input type="checkbox" checked={draft.claim} onChange={e=>setDraft({...draft,claim:e.target.checked})}/>I’m handling this follow-up</label>
   {item.updated_at&&<p className="uw-updated">Last saved by {item.updated_by_name||'the team'} · {fmtDate(item.updated_at)}</p>}
   {error&&<p role="alert" className="uw-error">{error}</p>}{saved&&<p role="status" className="uw-success">Follow-up saved.</p>}
   <div className="uw-detail-actions"><button className="uw-button primary" disabled={busy||!dirty}>{busy?'Saving…':'Save follow-up'}</button>{dirty&&<button className="uw-button quiet" type="button" disabled={busy} onClick={onClose}>Discard changes</button>}</div>
  </form>
 </aside>;
}
function StaffWorkView(){
 const session=auth.use(),[params,setParams]=useSearchParams();
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[view,setView]=useState(teamForRole(session?.role)),[category,setCategory]=useState('all');
 const [selectedId,setSelectedId]=useState(params.get('item')||''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(false);
 const searchRef=useRef(null),generation=useRef(0);
 useSEO({title:'Today · Team workspace',noindex:true});
 const load=useCallback(async({signal,background=false}={})=>{const gen=++generation.current;if(!background)setRefreshing(true);try{const body=await workspaceRequest('/api/account/work',{signal});if(!signal?.aborted&&gen===generation.current){setData(body);setError('');return true;}}catch(e){if(!signal?.aborted&&gen===generation.current)setError(e.message);return false;}finally{if(!signal?.aborted&&gen===generation.current){setLoading(false);setRefreshing(false);}}},[]);
 useEffect(()=>{const c=new AbortController();Promise.resolve().then(()=>{if(!c.signal.aborted)load({signal:c.signal,background:true});});return()=>{c.abort();};},[load,session?.user_id,session?.role]);
 useEffect(()=>{const onKey=e=>{if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();searchRef.current?.focus();}};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey);},[]);
 const actualView=data?.views.includes(view)?view:teamForRole(session?.role),profile=STAFF_TEAMS[actualView];
 const teamItems=(data?.items||[]).filter(r=>data?.views.length===1||actualView==='all'||r.team===actualView);
 const counts={all:teamItems.length,overdue:teamItems.filter(r=>r.overdue).length,waiting:teamItems.filter(r=>r.work_status==='waiting').length,mine:teamItems.filter(r=>r.owner_email===session?.email?.toLowerCase()).length};
 const categories=[...new Set(teamItems.map(r=>r.category))];
 const items=teamItems.filter(r=>(filter==='all'||filter==='overdue'&&r.overdue||filter==='waiting'&&r.work_status==='waiting'||filter==='mine'&&r.owner_email===session?.email?.toLowerCase())&&(category==='all'||r.category===category)&&`${r.title} ${r.summary} ${r.source_id} ${r.next_action} ${r.owner_email||''}`.toLowerCase().includes(search.toLowerCase()));
 const selected=data?.items.find(r=>r.id===selectedId);
 function select(id){if(id&&editing&&id!==selectedId){setNotice('Save or discard the current follow-up before opening another item.');return;}setSelectedId(id);setParams(id?{item:id}:{},{replace:true});setNotice('');}
 async function refresh(){setNotice('');if(await load())setNotice('Workspace refreshed.');}
 return <AdminShell active="work" unsavedChanges={editing}><main id="main" className="uw-workday">
  <header className="uw-day-heading"><div><div className="uw-eyebrow">{new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric'}).format(new Date())}</div><h1>{session?.name?`Hello, ${session.name.split(' ')[0]}.`:'Your workday.'}</h1><p>{profile.description}</p></div><button className="uw-button" onClick={refresh} disabled={refreshing||loading||editing}><WorkspaceIcon name="refresh" size={16}/>{refreshing?'Refreshing…':'Refresh'}</button></header>
  {error&&<div role="alert" className="uw-error"><strong>{data?'Updates are unavailable. Showing the last loaded records.':'Your work could not be loaded.'}</strong> {error}<button onClick={refresh} disabled={refreshing}>Try again</button></div>}
  {data?.views.length>1&&<nav className="uw-view-tabs" aria-label="Team views">{data.views.map(v=><button key={v} onClick={()=>{setView(v);setFilter('all');setCategory('all');}} aria-pressed={actualView===v}>{STAFF_TEAMS[v].label}</button>)}</nav>}
  <section className="uw-day-overview" aria-label="Your daily priorities"><div className="uw-day-intro"><span className="uw-eyebrow">{actualView==='all'?'TEAM OVERVIEW':profile.label}</span><h2>{profile.title}</h2><div className="uw-routine">{profile.routine.map((r,i)=><span key={r}><b>0{i+1}</b>{r}</span>)}</div></div><div className="uw-day-counts">{[['all','Open work'],['overdue','Overdue'],['waiting','Waiting']].map(([key,label])=><button key={key} className={filter===key?'selected':''} aria-pressed={filter===key} onClick={()=>setFilter(key)}><span className={key==='overdue'&&counts[key]?'uw-count-alert':''}>{loading||!data?'—':counts[key]}</span><span>{label}<WorkspaceIcon name="arrow" size={14}/></span></button>)}</div></section>
  {notice&&<p className="uw-notice" role="status">{notice}</p>}<div className={`uw-work-grid ${selected?'has-detail':''}`}><section className="uw-work-list" aria-label="Work queue"><div className="uw-queue-heading"><div><h2>Your queue</h2><p>{loading?'Connecting to your workspace…':error?'Last loaded view':data?`Updated ${new Date(data.generated_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`:'Server-backed work'}</p></div><label className="uw-search"><WorkspaceIcon name="search" size={18}/><input ref={searchRef} type="search" aria-label="Search your work" placeholder="Search name, order, or task" value={search} onChange={e=>setSearch(e.target.value)}/><kbd>/</kbd></label></div>
  <div className="uw-queue-filters"><div role="group" aria-label="Filter work">{[['all','All work'],['mine','Mine'],['overdue','Overdue'],['waiting','Waiting']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}<span>{loading||!data?'—':counts[key]}</span></button>)}</div><select aria-label="Work type" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All types</option>{categories.map(c=><option key={c}>{c}</option>)}</select></div>
  {loading?<div className="uw-loading" role="status"><span/><span/><span/><p>Loading the team’s current work…</p></div>:!items.length?<div className="uw-empty"><WorkspaceIcon name={error?'refresh':'check'} size={30}/><h3>{error?'Work is temporarily unavailable.':teamItems.length?'Nothing matches this view.':'No open work in this view.'}</h3><p>{error?'Refresh to try again. No records have been changed.':teamItems.length?'Try another filter or clear your search.':'New requests and operational work will appear here as they are recorded.'}</p>{teamItems.length>0&&<button className="uw-button" onClick={()=>{setSearch('');setFilter('all');setCategory('all');}}>Clear filters</button>}</div>:<ul className="uw-queue">{items.map(item=><li key={item.id}><button className={`uw-work-row ${selectedId===item.id?'is-selected':''}`} onClick={()=>select(item.id)} aria-pressed={selectedId===item.id}><span className={`uw-type-icon ${item.overdue?'is-overdue':''}`}><WorkspaceIcon name={item.team==='finance'?'money':item.team==='warehouse'?'box':item.category==='Inquiry'?'inbox':'list'} size={19}/></span><span className="uw-row-copy"><span className="uw-row-kind">{item.category}<span>·</span>{item.summary||item.source_id}</span><strong>{item.title}</strong><span className="uw-row-next">{item.next_action}</span></span><span className="uw-row-state"><span className={`uw-badge ${item.overdue?'is-overdue':item.work_status==='waiting'?'is-waiting':''}`}>{item.overdue?'Overdue':item.work_status==='waiting'?'Waiting':item.urgent?'Review needed':item.work_status==='in_progress'?'In progress':'To do'}</span><span>{item.due_at?fmtDate(item.due_at):item.owner_email?.split('@')[0]||'Unassigned'}</span></span><WorkspaceIcon name="arrow" size={17}/></button></li>)}</ul>}
  </section>{selected&&<WorkDetail key={`${selected.id}:${selected.version}`} item={selected} onClose={()=>select('')} onDirtyChange={setEditing} onSaved={async()=>{await load({background:true});setNotice('Follow-up saved to the team workspace.');}}/>}</div>
  {selectedId&&!selected&&!loading&&<p className="uw-notice">That item is no longer in your current work queue. It may have been completed or reassigned.</p>}
  <div className="uw-work-footer"><span><span className="uw-live-dot"/>Private staff workspace · Your working role controls access</span><span>{data?`${data.items.length} open items loaded`:'Awaiting workspace data'}</span></div><p className="uw-sr-only" role="status">{notice}</p>
 </main></AdminShell>;
}

export function StaffWork(){const session=auth.use();return <StaffWorkView key={`${session?.user_id}:${session?.role}`}/>;}
