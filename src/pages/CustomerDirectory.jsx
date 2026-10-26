import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminShell } from '../components/layout/AdminShell.jsx';
import { workspaceRequest } from '../lib/workspaceRequest.js';
import { useDetailFocus } from '../lib/useDetailFocus.js';
import { useSEO } from '../lib/seo.js';
import '../styles/workspace.css';
const display = value => String(value || 'Not recorded').replaceAll('_',' ');
function CustomerDetails({ customer, close }) {
  const heading = useDetailFocus(customer.id);
  return <aside className="uw-detail"><button className="uw-button quiet" onClick={close}>Close customer</button>
    <h2 ref={heading} tabIndex={-1}>{customer.name || customer.company || customer.id}</h2>
    <dl className="uw-facts">{[['Company',customer.company],['Email',customer.email],['Phone',customer.phone],['Status',customer.status],['Approval',customer.approval_status],['Account rep',customer.account_rep],['Source order count',customer.source_order_count],['Last order',customer.last_order_date]].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value === 0 ? 0 : display(value)}</dd></div>)}</dl>
    <section><h3>Addresses ({customer.addresses.length})</h3>{customer.addresses.length ? customer.addresses.map((address,index) => <div className="uw-customer-records" key={address.id || index}>{address.is_default && <strong>Default address</strong>}<p>{[address.recipient,address.company,address.address1,address.address2,[address.city,address.province,address.zip].filter(Boolean).join(', '),address.country,address.phone].filter(Boolean).map((line,i) => <span key={i} style={{display:'block'}}>{line}</span>)}</p></div>) : <p>No saved addresses.</p>}</section>
    {customer.tags?.length > 0 && <section><h3>Tags</h3><p>{customer.tags.join(', ')}</p></section>}
    {customer.notes && <section><h3>Notes</h3><p style={{whiteSpace:'pre-wrap'}}>{customer.notes}</p></section>}
    <Link className="uw-button" to="/admin/quotes">View quotes</Link>
  </aside>;
}
export function CustomerDirectory() {
  useSEO({title:'All customers',noindex:true});
  const [params,setParams] = useSearchParams();
  const search = params.get('q') || '', page = Number(params.get('page') || 0), id = params.get('customer') || '';
  const [draft,setDraft] = useState(search), [listState,setListState] = useState(null), [detailState,setDetailState] = useState(null), [revision,setRevision] = useState(0);
  const listKey = JSON.stringify([search,page,revision]), detailKey = JSON.stringify([id,revision]);
  const data = listState?.key === listKey ? listState.data : null, error = listState?.key === listKey ? listState.error : '', loading = listState?.key !== listKey;
  const customer = detailState?.key === detailKey ? detailState.data : null, detailError = detailState?.key === detailKey ? detailState.error : '';
  useEffect(() => { const controller = new AbortController();
    workspaceRequest('/api/account/customer-directory?'+new URLSearchParams({q:search,page:String(page)}),{signal:controller.signal}).then(result => {if(!controller.signal.aborted)setListState({key:listKey,data:result.data,error:''});}).catch(e => {if(!controller.signal.aborted)setListState({key:listKey,data:null,error:e.message});});
    return () => controller.abort();
  },[search,page,listKey]);
  useEffect(() => { const controller = new AbortController();
    if(id)workspaceRequest('/api/account/customer-directory?'+new URLSearchParams({id}),{signal:controller.signal}).then(result => {if(!controller.signal.aborted)setDetailState({key:detailKey,data:result.data,error:''});}).catch(e => {if(!controller.signal.aborted)setDetailState({key:detailKey,data:null,error:e.message});});
    return () => controller.abort();
  },[id,detailKey]);
  function update(values) { const next = new URLSearchParams(params); for(const [key,value] of Object.entries(values)) {if(value === null || value === '')next.delete(key);else next.set(key,String(value));} setParams(next); }
  return <AdminShell active="customer-directory"><main id="main" className="uw-work-page"><header className="uw-page-heading"><div><span className="uw-eyebrow">Sales & service</span><h1>All customers {data ? `(${data.total})` : ''}</h1><p>Review contact information and saved addresses across the Unite customer roster.</p></div><div className="uw-detail-actions"><button className="uw-button" disabled={loading} onClick={() => setRevision(v => v+1)}>Refresh</button><Link className="uw-button" to="/admin/quotes">Quotes</Link></div></header>
    <form className="uw-detail-actions" onSubmit={event => {event.preventDefault();update({q:draft.trim(),page:null,customer:null});}}><label className="uw-search"><input aria-label="Search all customers" type="search" placeholder="Customer, company or email" value={draft} onChange={event => setDraft(event.target.value)}/></label><button className="uw-button" type="submit">Search</button>{search && <button className="uw-button quiet" type="button" onClick={() => {setDraft('');update({q:null,page:null,customer:null});}}>Clear search</button>}</form>
    {error && <p role="alert" className="uw-error">{error}</p>}
    <div className={`uw-work-grid ${id ? 'has-detail' : ''}`}><section className="uw-work-list"><h2>{search ? 'Matching customers' : 'Customer roster'} {data ? `(${data.total})` : ''}</h2>{loading ? <p role="status">Loading customers…</p> : data?.rows.length ? <ul className="uw-queue">{data.rows.map(row => <li key={row.id}><button className={`uw-work-row ${id === row.id ? 'is-selected' : ''}`} aria-pressed={id === row.id} onClick={() => update({customer:row.id})}><span className="uw-row-copy"><strong>{row.name || row.company || row.email || row.id}</strong><span>{[row.company,row.email].filter(Boolean).join(' · ')}</span></span><span className="uw-badge">{display(row.status)}</span></button></li>)}</ul> : !error && <p className="uw-empty">{search ? 'No customers match this search.' : 'No customer records are available.'}</p>}
      {data && <div className="uw-detail-actions"><span>{data.total ? `${page*50+1}–${Math.min((page+1)*50,data.total)} of ${data.total}` : '0 customers'}</span><button className="uw-button" disabled={loading || page === 0} onClick={() => update({page:page-1,customer:null})}>Previous</button><button className="uw-button" disabled={loading || (page+1)*50 >= data.total} onClick={() => update({page:page+1,customer:null})}>Next</button></div>}
    </section>{customer ? <CustomerDetails customer={customer} close={() => update({customer:null})}/> : id && <aside className="uw-detail">{detailError ? <p role="alert" className="uw-error">{detailError}</p> : <p role="status">Loading customer…</p>}<button className="uw-button" onClick={() => update({customer:null})}>Close customer</button></aside>}</div>
  </main></AdminShell>;
}
