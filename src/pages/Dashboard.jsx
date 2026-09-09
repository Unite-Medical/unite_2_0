import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Nav } from '../components/layout/Nav.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useSEO } from '../lib/seo.js';
import { workspaceRequest } from '../lib/workspaceRequest.js';
import '../styles/workspace.css';
export function Dashboard(){
 const session=auth.use();const orgId=session?.org_id;const org=db.get('organizations',orgId);
 const orders=db.useTable('orders',{where:{customer_id:orgId},orderBy:'placed_at',dir:'desc'});
 const [search,setSearch]=useState('');const [history,setHistory]=useState(null);const [error,setError]=useState('');const [showHistory,setShowHistory]=useState(false);
 useSEO({title:'Your account',noindex:true});
 useEffect(()=>{if(!showHistory)return;let active=true;workspaceRequest('/api/account/legacy-orders').then(r=>{if(active){setHistory(r.orders);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[showHistory]);
 const visible=orders.filter(o=>`${o.id} ${o.source_order_number||''}`.toLowerCase().includes(search.toLowerCase()));
 return <><Nav/><main id="main" className="um-workspace"><header className="ws-header"><div><div className="ws-eyebrow">{org?.name||'Unite Medical'}</div><h1>Your account</h1><p>Orders, invoices and account details in one place.</p></div><div className="ws-actions"><Link className="ws-button primary" to="/catalog">Browse products</Link><Link className="ws-button" to="/portal/quote">Request a quote</Link></div></header>
 <div className="ws-grid">{[['Invoices and receipts','View your payment records.','/account/invoices'],['Tax documents','Upload an exemption certificate.','/account/documents'],['Account details','Manage your team and company details.','/account/settings']].map(([title,detail,path])=><section className="ws-card" key={path}><h2>{title}</h2><p>{detail}</p><Link to={path}>Open →</Link></section>)}</div>
 <section className="ws-card"><h2>Your orders</h2><label>Find an order<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Order number"/></label>{!visible.length?<p className="ws-empty">{search?'No matching orders.':'No orders are loaded for this account yet.'}</p>:<ul className="ws-list">{visible.map(o=><li className="ws-row" key={o.id}><div><Link to={`/orders/${encodeURIComponent(o.id)}/track`}>{o.source_order_number||o.id}</Link><p style={{margin:0}}>{fmt.date(o.placed_at)} · {fmt.money(o.total)}</p></div><span className="ws-pill">{(o.status||'Pending').replaceAll('_',' ')}</span></li>)}</ul>}</section>
 <section className="ws-card"><button className="ws-button" aria-expanded={showHistory} onClick={()=>setShowHistory(v=>!v)}>{showHistory?'Hide earlier Shopify orders':'View earlier Shopify orders'}</button>{showHistory&&<><p style={{marginTop:16}}>Historical orders are read-only. Contact Unite for help with an outstanding order.</p>{error?<p role="alert" className="ws-error">{error}</p>:history===null?<p role="status">Loading history…</p>:!history.length?<p>No historical orders are available for this account.</p>:history.map(o=><details className="ws-details" key={o.order_number}><summary>{o.order_number} · {o.created_at?fmt.date(o.created_at):'Date unavailable'}</summary><p>{o.fulfillment_status||'Status unavailable'}</p><ul>{o.lines.map((l,i)=><li key={i}>{l.quantity} × {l.name||l.sku}</li>)}</ul></details>)}</>}</section>
 <section className="ws-card"><h2>Need help?</h2><p>{org?.account_rep?`Your account contact is ${org.account_rep}.`:'Our team can help with pricing, delivery or account access.'}</p><div className="ws-actions"><Link className="ws-button" to="/contact">Contact Unite</Link><Link to="/account/quotes">Your quotes</Link><Link to="/account/team">Team access</Link></div></section>
 </main></>;
}
