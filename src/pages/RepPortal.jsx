import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminShell } from '../components/layout/AdminShell.jsx';
import { auth } from '../lib/auth.js';
import { workspaceRequest } from '../lib/workspaceRequest.js';
import { useDetailFocus } from '../lib/useDetailFocus.js';
import { useSEO } from '../lib/seo.js';
import { fmt } from '../lib/format.js';

const human = value => value ? String(value).replaceAll('_', ' ') : 'Not recorded';
function CustomerDetail({ account, close }) {
  const heading = useDetailFocus(account.id);
  return <aside className="uw-detail"><button className="uw-button quiet" onClick={close}>Close customer</button>
    <h2 ref={heading} tabIndex={-1} style={{scrollMarginTop:85}}>{account.name || account.id}</h2>
    <dl className="uw-facts">{[['Account', account.id], ['Status', human(account.status)], ['Approval', human(account.approval_status)], ['Terms', human(account.terms)], ['Tier', human(account.tier)], ['Segment', human(account.segment)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {account.commerce_hold_reason && <p className="uw-notice">Account needs review: {account.commerce_hold_reason}</p>}
    <div className="uw-detail-actions"><Link className="uw-button primary" to="/quote/new">Prepare a quote</Link><Link className="uw-button" to="/work">Open follow-ups</Link></div>
    <p className="uw-detail-summary">Quote preparation opens a new draft. Confirm the customer before issuing a quote.</p>
    {[['Orders', account.orders], ['Quotes', account.quotes], ['Open backorders', account.backorders]].map(([label, records]) => <section className="uw-customer-records" key={label}><h3>{label} <span>({records.length})</span></h3>
      {records.length ? records.map(record => <details key={record.id} className="uw-inquiry-line"><summary>{record.source_order_number || record.order_number || record.id} · {human(record.status)}</summary><dl className="uw-facts">{[['Reference', record.id], ['Order', record.order_id], ['Payment', record.payment_status && human(record.payment_status)], ['Total', record.total != null ? fmt.money(record.total) : null], ['Product', record.sku], ['Tracking', record.tracking_number], ['Created', (record.created_at || record.placed_at) && fmt.date(record.created_at || record.placed_at)], ['Expires', record.expires_at && fmt.date(record.expires_at)], ['Availability', label === 'Open backorders' ? 'Confirm with the supplier before promising a date.' : null]].filter(([, value]) => value != null).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details>) : <p>No {label.toLowerCase()} recorded for this account.</p>}
    </section>)}
  </aside>;
}
function CustomerWorkspace() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [search, setSearch] = useState(''), [filter, setFilter] = useState('all');
  const selected = data?.accounts.find(account => account.id === params.get('customer'));
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await workspaceRequest('/api/account/customers')); } catch (e) { setError(e.message); } finally { setLoading(false); } }, []);
  useEffect(() => { let active = true; workspaceRequest('/api/account/customers').then(result => { if(active) setData(result); }).catch(e => { if(active) setError(e.message); }).finally(() => { if(active) setLoading(false); }); return () => { active = false; }; }, []);
  useSEO({ title: 'Customer workspace', description: 'Assigned accounts, orders, quotes and follow-ups.', canonical: '/rep', noindex: true });
  const accounts = (data?.accounts || []).filter(account => `${account.name} ${account.id} ${account.orders.map(row => row.id).join(' ')} ${account.quotes.map(row => row.id).join(' ')}`.toLowerCase().includes(search.toLowerCase().trim())).filter(account => filter !== 'attention' || account.commerce_hold_reason || account.backorders.length || ['manual_review', 'pending'].includes(account.approval_status) || account.status === 'pending_activation');
  return <AdminShell active="rep"><main id="main" className="uw-workday"><header className="uw-day-heading"><div><span className="uw-eyebrow">Sales & service</span><h1>Your customers, together.</h1><p>Review account status, orders, quotes and backorders before the next conversation.</p></div><button className="uw-button" disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Refresh'}</button></header>
    {error && <p role="alert" className="uw-error">{error} {data ? 'Showing the last loaded accounts.' : ''} <button onClick={load}>Try again</button></p>}
    <div className={`uw-work-grid ${selected ? 'has-detail' : ''}`}><section className="uw-work-list"><div className="uw-queue-heading"><h2>{data?.scope === 'all' ? 'All customers' : 'Assigned customers'} {data ? `(${data.accounts.length})` : ''}</h2><label className="uw-search"><input type="search" aria-label="Search customers" placeholder="Company, account, order or quote" value={search} onChange={e => setSearch(e.target.value)} /></label></div><div className="uw-queue-filters"><div>{[['all', 'All accounts'], ['attention', 'Needs attention']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
    {loading && !data ? <p className="uw-empty" role="status">Loading your assigned accounts…</p> : accounts.length ? <ul className="uw-queue">{accounts.map(account => <li key={account.id}><button className={`uw-work-row ${selected?.id === account.id ? 'is-selected' : ''}`} aria-pressed={selected?.id === account.id} onClick={() => setParams({ customer: account.id }, { replace: true })}><span className="uw-row-copy"><strong>{account.name || account.id}</strong><span className="uw-row-next">{account.orders.length} {account.orders.length===1?'order':'orders'} · {account.quotes.length} {account.quotes.length===1?'quote':'quotes'} · {account.backorders.length} open {account.backorders.length===1?'backorder':'backorders'}</span></span><span className="uw-badge">{human(account.status)}</span></button></li>)}</ul> : <div className="uw-empty"><h3>{error ? 'Accounts are unavailable.' : data?.accounts.length ? 'No matching accounts.' : 'No customers assigned yet.'}</h3><p>{data?.accounts.length ? 'Try a company name, order number or a different filter.' : error ? 'Try again to reload your customer workspace.' : 'An administrator can check your customer ownership assignments. Your daily queue is still available.'}</p>{data?.accounts.length ? <button className="uw-button" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button> : <Link className="uw-button" to="/work">Return to Today</Link>}</div>}</section>{selected && <CustomerDetail account={selected} close={() => setParams({}, { replace: true })} />}</div>
    {data && <p className="uw-work-footer">{data.scope === 'assigned' ? 'Only accounts assigned to your signed-in identity appear here.' : 'Administrator view of current customer records.'} Last loaded {new Date(data.generated_at).toLocaleString()}.</p>}
  </main></AdminShell>;
}
export function RepPortal() { const session = auth.use(); return <CustomerWorkspace key={`${session?.user_id}:${session?.role}`} />; }
