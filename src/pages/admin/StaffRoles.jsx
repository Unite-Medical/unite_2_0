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
 async function removeAccess(){if(!window.confirm(`Remove ${person.name||person.email}'s access? They are signed out everywhere and can't sign in again.`))return;setBusy(true);setError('');try{await postWorkspace('/api/admin/staff-members',{action:'remove',user_id:person.id,reason});setPerson(null);setReason('');await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function save(){setBusy(true);setError('');try{await postWorkspace('/api/admin/roles',{user_id:person.id,revision:person.revision,roles,reason});setPerson(null);setReason('');await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="ui-root flex flex-col gap-4 px-4 pt-6 font-sans text-sm text-ink md:px-8">{data&&<AddStaffMember data={data} onAdded={load}/>}<Card className="flex flex-col gap-4 p-5">
  <div><h2 className="m-0 font-display text-lg font-semibold">Staff roles</h2><p className="mt-1 mb-0 text-ink-2">Grant the roles each staff member needs. Changes revoke their existing sessions.</p></div>
  {error&&<div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn-soft bg-[#f8ede4] px-4 py-3 text-warn" role="alert"><span className="flex-1">{error}</span><Button size="sm" onClick={load}>Try again</Button></div>}
  {!data&&!error&&<p className="m-0 text-ink-2">Loading staff…</p>}
  {data&&<>
   <label className="flex max-w-md flex-col gap-1.5 font-medium">Staff member<select className="h-11 rounded-lg border border-line bg-white px-3 font-normal md:h-10" value={person?.id||''} onChange={e=>{const p=data.people.find(p=>p.id===e.target.value);setPerson(p);setRoles(p?[...new Set([p.role,...p.roles])]:[]);}}><option value="">Choose staff member</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name||p.email}</option>)}</select></label>
   {person&&<>
    <fieldset className="m-0 border-0 p-0"><legend className="mb-2 font-medium">Roles</legend><div className="flex flex-wrap gap-2">{data.roles.map(r=><label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 md:min-h-10"><input type="checkbox" className="h-4 w-4" checked={roles.includes(r)} onChange={e=>setRoles(e.target.checked?[...roles,r]:roles.filter(x=>x!==r))}/>{roleLabel(r)}</label>)}</div></fieldset>
    <label className="flex max-w-md flex-col gap-1.5 font-medium">Reason for the change<Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Moved to the warehouse team"/></label>
    <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={busy||!roles.length||!reason.trim()} onClick={save}>{busy?'Saving…':'Save roles'}</Button><Button variant="danger" disabled={busy||!reason.trim()} onClick={removeAccess}>Remove access</Button></div>
   </>}
  </>}
 </Card></div>;}

function AddStaffMember({data,onAdded}){
 const blank={name:'',email:'',roles:[],password:'',reason:''};
 const [form,setForm]=useState(blank),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(null);
 const set=(k,v)=>setForm(f=>({...f,[k]:v}));
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{const r=await postWorkspace('/api/admin/staff-members',{action:'create',...form});setDone(r);setForm(blank);await onAdded();}catch(err){setError(err.message);}finally{setBusy(false);}}
 if(!open)return <Card className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="m-0 font-display text-lg font-semibold">Add staff member</h2><p className="mt-1 mb-0 text-ink-2">Give someone a staff login with the roles they need.</p></div><Button variant="primary" onClick={()=>{setOpen(true);setDone(null);}}>Add staff member</Button></Card>;
 return <Card className="p-5"><form onSubmit={submit} className="flex flex-col gap-4">
  <div><h2 className="m-0 font-display text-lg font-semibold">Add staff member</h2><p className="mt-1 mb-0 text-ink-2">They sign in at unitemedical.net/login with this email.</p></div>
  {done&&<div role="status" className="rounded-lg border border-brand-soft bg-[#eaf2ee] px-4 py-3 text-brand">{done.person.name} can sign in now{done.activation_url?<> once they set a password with this link (valid 72 hours): <span className="break-all font-mono text-xs">{done.activation_url}</span> <Button type="button" size="sm" onClick={()=>navigator.clipboard?.writeText(done.activation_url)}>Copy link</Button></>:'.'}</div>}
  {error&&<p role="alert" className="m-0 rounded-lg border border-warn-soft bg-[#f8ede4] px-4 py-3 text-warn">{error}</p>}
  <div className="grid gap-4 md:grid-cols-2">
   <label className="flex flex-col gap-1.5 font-medium">Name<Input required value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Ashley (test)"/></label>
   <label className="flex flex-col gap-1.5 font-medium">Email<Input required type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="name@unitemedical.net"/></label>
  </div>
  <label className="flex max-w-md flex-col gap-1.5 font-medium">Same access as<select className="h-11 rounded-lg border border-line bg-white px-3 font-normal md:h-10" value="" onChange={e=>{const p=data.people.find(p=>p.id===e.target.value);if(p)set('roles',[...new Set([p.role,...p.roles])]);}}><option value="">Copy roles from…</option>{data.people.map(p=><option key={p.id} value={p.id}>{p.name||p.email}</option>)}</select></label>
  <fieldset className="m-0 border-0 p-0"><legend className="mb-2 font-medium">Roles</legend><div className="flex flex-wrap gap-2">{data.roles.map(r=><label key={r} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 md:min-h-10"><input type="checkbox" className="h-4 w-4" checked={form.roles.includes(r)} onChange={e=>set('roles',e.target.checked?[...form.roles,r]:form.roles.filter(x=>x!==r))}/>{roleLabel(r)}</label>)}</div></fieldset>
  <div className="grid gap-4 md:grid-cols-2">
   <label className="flex flex-col gap-1.5 font-medium">Password (optional)<Input type="password" autoComplete="new-password" value={form.password} onChange={e=>set('password',e.target.value)} placeholder="Leave blank to get a set-password link"/></label>
   <label className="flex flex-col gap-1.5 font-medium">Reason<Input required value={form.reason} onChange={e=>set('reason',e.target.value)} placeholder="e.g. QA test login"/></label>
  </div>
  <div className="flex flex-wrap gap-2"><Button type="submit" variant="primary" disabled={busy||!form.name.trim()||!form.email.trim()||!form.roles.length||!form.reason.trim()}>{busy?'Adding…':'Add staff member'}</Button><Button type="button" onClick={()=>{setOpen(false);setError('');}} disabled={busy}>Close</Button></div>
 </form></Card>;
}
