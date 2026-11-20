import {useEffect,useState} from 'react';
import {workspaceRequest,postWorkspace} from '../../lib/workspaceRequest.js';
import {Button} from '../../components/ui/button.jsx';
import {Card} from '../../components/ui/card.jsx';
import {Input} from '../../components/ui/input.jsx';
import '../../styles/ui.css';
const roleLabel=r=>{const t=r.replaceAll('_',' ');return t.charAt(0).toUpperCase()+t.slice(1);};
export function StaffRoles(){const [data,setData]=useState(null),[person,setPerson]=useState(null),[roles,setRoles]=useState([]),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){try{setError('');setData(await workspaceRequest('/api/admin/roles'));}catch(e){setError(e.message);}}
 useEffect(()=>{workspaceRequest('/api/admin/roles').then(setData,e=>setError(e.message));},[]);
 async function save(){setBusy(true);setError('');try{await postWorkspace('/api/admin/roles',{user_id:person.id,revision:person.revision,roles,reason});setPerson(null);setReason('');await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="ui-root px-4 pt-6 font-sans text-sm text-ink md:px-8"><Card className="flex flex-col gap-4 p-5">
  <div><h2 className="m-0 font-display text-lg font-semibold">Staff roles</h2><p className="mt-1 mb-0 text-ink-2">Grant the roles each staff member needs. Changes revoke their existing sessions. Admin, finance and manager access requires two-step sign-in.</p></div>
  {error&&<div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn-soft bg-[#f8ede4] px-4 py-3 text-warn" role="alert"><span className="flex-1">{error}</span><Button size="sm" onClick={load}>Try again</Button></div>}
  {!data&&!error&&<p className="m-0 text-ink-2">Loading staff…</p>}
  {data&&<>
   <label className="flex max-w-md flex-col gap-1.5 font-medium">Staff member<select className="h-11 rounded-lg border border-line bg-white px-3 font-normal md:h-10" value={person?.id||''} onChange={e=>{const p=data.people.find(p=>p.id===e.target.value);setPerson(p);setRoles(p?[...new Set([p.role,...p.roles])]:[]);}}><option value="">Choose staff member</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name||p.email}</option>)}</select></label>
   {person&&<>
    <fieldset className="m-0 border-0 p-0"><legend className="mb-2 font-medium">Roles</legend><div className="flex flex-wrap gap-2">{data.roles.map(r=><label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 md:min-h-10"><input type="checkbox" className="h-4 w-4" checked={roles.includes(r)} onChange={e=>setRoles(e.target.checked?[...roles,r]:roles.filter(x=>x!==r))}/>{roleLabel(r)}</label>)}</div></fieldset>
    <label className="flex max-w-md flex-col gap-1.5 font-medium">Reason for the change<Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Moved to the warehouse team"/></label>
    <div><Button variant="primary" disabled={busy||!roles.length||!reason.trim()} onClick={save}>{busy?'Saving…':'Save roles'}</Button></div>
   </>}
  </>}
 </Card></div>;}
