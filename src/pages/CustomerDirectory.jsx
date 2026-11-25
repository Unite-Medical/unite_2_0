import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Table, THead, TRow, TD } from '../components/ui/table.jsx';
import { SortHeader } from '../components/ui/data-table.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Input } from '../components/ui/input.jsx';
import '../styles/ui.css';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminShell } from '../components/layout/AdminShell.jsx';
import { workspaceRequest } from '../lib/workspaceRequest.js';
import { useDetailFocus } from '../lib/useDetailFocus.js';
import { useSEO } from '../lib/seo.js';
import '../styles/workspace.css';
import '../styles/customer-directory.css';
const placeOf = row => {const a = (row.addresses || []).find(x => x.is_default) || row.addresses?.[0]; return a ? [a.city, a.province].filter(Boolean).join(', ') : '';};
const display = value => String(value || 'Not recorded').replaceAll('_',' ');
function CustomerDetails({ customer, close }) {
  const heading = useDetailFocus(customer.id);
  return <aside className="uw-detail"><button className="uw-button quiet" onClick={close}>Close customer</button>
    <h2 ref={heading} tabIndex={-1}>{customer.name || customer.company || customer.id}</h2>
    <dl className="uw-facts">{[['Company',customer.company],['Email',customer.email],['Phone',customer.phone],['Status',customer.status],['Approval',customer.approval_status],['Account rep',customer.account_rep],['Source order count',customer.source_order_count],['Last order',customer.last_order_date]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value === 0 ? 0 : display(value)}</dd></div>)}</dl>
    <section><h3>Addresses ({customer.addresses.length})</h3>{customer.addresses.length ? customer.addresses.map((address,index) => <div className="uw-customer-records" key={address.id || index}>{address.is_default && <strong>Default address</strong>}<p>{[address.recipient,address.company,address.address1,address.address2,[address.city,address.province,address.zip].filter(Boolean).join(', '),address.country,address.phone].filter(Boolean).map((line,i) => <span key={i} style={{display:'block'}}>{line}</span>)}</p></div>) : <p>No saved addresses.</p>}</section>
    {customer.tags?.length > 0 && <section><h3>Tags</h3><p>{customer.tags.join(', ')}</p></section>}
    {customer.notes && <section><h3>Notes</h3><p style={{whiteSpace:'pre-wrap'}}>{customer.notes}</p></section>}
    <div className="uw-detail-actions"><Link className="uw-button primary" to={'/sales/orders/new?customer='+encodeURIComponent(customer.id)}>Create order</Link><Link className="uw-button" to={'/admin/quotes?customer='+encodeURIComponent(customer.id)}>View quotes</Link><Link className="uw-button" to={'/admin/quotes?new=1&customer='+encodeURIComponent(customer.id)}>Prepare quote</Link></div>
  </aside>;
}
export function CustomerDirectory() {
  useSEO({title:'All customers',noindex:true});
  const [params,setParams] = useSearchParams();
  const search = params.get('q') || '', page = Number(params.get('page') || 0), id = params.get('customer') || '';
  const sortId = params.get('sort') || '', sortDir = params.get('dir') === 'desc' ? 'desc' : 'asc', sort = sortId ? {id:sortId,dir:sortDir} : null;
  const [draft,setDraft] = useState(search), [listState,setListState] = useState(null), [detailState,setDetailState] = useState(null), [revision,setRevision] = useState(0);
  const listKey = JSON.stringify([search,page,sortId,sortDir,revision]), detailKey = JSON.stringify([id,revision]);
  const data = listState?.key === listKey ? listState.data : null, error = listState?.key === listKey ? listState.error : '', loading = listState?.key !== listKey;
  const customer = detailState?.key === detailKey ? detailState.data : null, detailError = detailState?.key === detailKey ? detailState.error : '';
  useEffect(() => { const controller = new AbortController();
    workspaceRequest('/api/account/customer-directory?'+new URLSearchParams({q:search,page:String(page),...(sortId ? {sort:sortId,dir:sortDir} : {})}),{signal:controller.signal}).then(result => {if(!controller.signal.aborted)setListState({key:listKey,data:result.data,error:''});}).catch(e => {if(!controller.signal.aborted)setListState({key:listKey,data:null,error:e.message});});
    return () => controller.abort();
  },[search,page,sortId,sortDir,listKey]);
  useEffect(() => { const controller = new AbortController();
    if(id)workspaceRequest('/api/account/customer-directory?'+new URLSearchParams({id}),{signal:controller.signal}).then(result => {if(!controller.signal.aborted)setDetailState({key:detailKey,data:result.data,error:''});}).catch(e => {if(!controller.signal.aborted)setDetailState({key:detailKey,data:null,error:e.message});});
    return () => controller.abort();
  },[id,detailKey]);
  // Search as you type (debounced); Enter still searches immediately.
  useEffect(() => { const next = draft.trim(); if (next === search) return undefined;
    const timer = setTimeout(() => update({q:next,page:null,customer:null}), 350); return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[draft,search]);
  const onSort = value => update({sort:value?.id || null,dir:value?.dir || null,page:null});
  function update(values) { const next = new URLSearchParams(params); for(const [key,value] of Object.entries(values)) {if(value === null || value === '')next.delete(key);else next.set(key,String(value));} setParams(next); }
  return <AdminShell active="customer-directory"><main id="main" className="uw-workday uw-customer-directory"><header className="uw-day-heading"><div><span className="uw-eyebrow">Sales & service</span><h1>All customers {data ? `(${data.total})` : ''}</h1><p>Review contact information and saved addresses across the Unite customer roster.</p></div><div className="uw-detail-actions"><button className="uw-button" disabled={loading} onClick={() => setRevision(v => v+1)}>Refresh</button><Link className="uw-button" to="/admin/quotes">Quotes</Link></div></header>
    <form className="ui-root uw-directory-search flex flex-wrap items-center gap-2 font-sans text-sm" role="search" onSubmit={event => {event.preventDefault();update({q:draft.trim(),page:null,customer:null});}}><div className="min-w-[16rem] flex-1"><Input icon={Search} aria-label="Search all customers" type="search" placeholder="Search customer, company or email" value={draft} onChange={event => setDraft(event.target.value)}/></div>{search && <button className="uw-button quiet" type="button" onClick={() => {setDraft('');update({q:null,page:null,customer:null});}}>Clear search</button>}</form>
    {error && <p role="alert" className="uw-error">{error}</p>}
    <div className={`uw-work-grid ${id ? 'has-detail' : ''}`}><section className="uw-work-list"><div className="uw-queue-heading"><h2>{search ? 'Matching customers' : 'Customer roster'} {data ? `(${data.total})` : ''}</h2></div>{loading ? <p role="status">Loading customers…</p> : data?.rows.length ? <div className="ui-root overflow-hidden rounded-xl border border-line bg-card font-sans text-sm text-ink"><Table><THead><tr><SortHeader id="name" sort={sort} onSort={onSort}>Customer</SortHeader><SortHeader id="email" sort={sort} onSort={onSort}>Email</SortHeader><th scope="col" className="whitespace-nowrap px-4 py-3 font-medium">Location</th><SortHeader id="source_order_count" align="right" sort={sort} onSort={onSort}>Orders</SortHeader><SortHeader id="last_order_date" sort={sort} onSort={onSort}>Last order</SortHeader><SortHeader id="status" sort={sort} onSort={onSort}>Status</SortHeader></tr></THead><tbody>{data.rows.map(row => <TRow key={row.id} tabIndex={0} aria-selected={id === row.id} className={id === row.id ? 'cursor-pointer bg-paper' : 'cursor-pointer'} onClick={() => update({customer:row.id})} onKeyDown={event => {if(event.key === 'Enter')update({customer:row.id});}}><TD><div className="font-semibold">{row.name || row.company || row.email || row.id}</div>{row.company && row.company !== row.name && <div className="text-xs text-ink-2">{row.company}</div>}</TD><TD className="text-ink-2">{row.email || '—'}</TD><TD className="whitespace-nowrap text-ink-2">{placeOf(row) || '—'}</TD><TD className="text-right tabular-nums">{row.source_order_count || 0}</TD><TD className="whitespace-nowrap text-ink-2">{row.last_order_date ? String(row.last_order_date).slice(0,10) : '—'}</TD><TD><Badge tone={row.status === 'active' ? 'good' : 'neutral'}>{display(row.status)}</Badge></TD></TRow>)}</tbody></Table></div> : !error && <p className="uw-empty">{search ? 'No customers match this search.' : 'No customer records are available.'}</p>}
      {data && <div className="uw-detail-actions uw-directory-pages"><span>{data.total ? `${page*50+1}–${Math.min((page+1)*50,data.total)} of ${data.total}` : '0 customers'}</span><button className="uw-button" disabled={loading || page === 0} onClick={() => update({page:page-1,customer:null})}>Previous</button><button className="uw-button" disabled={loading || (page+1)*50 >= data.total} onClick={() => update({page:page+1,customer:null})}>Next</button></div>}
    </section>{customer ? <CustomerDetails customer={customer} close={() => update({customer:null})}/> : id && <aside className="uw-detail">{detailError ? <p role="alert" className="uw-error">{detailError}</p> : <p role="status">Loading customer…</p>}<button className="uw-button" onClick={() => update({customer:null})}>Close customer</button></aside>}</div>
  </main></AdminShell>;
}
