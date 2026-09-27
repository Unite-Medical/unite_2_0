import {OrderTimeline} from './OrderTimeline.jsx';
import { useSEO } from '../../lib/seo.js';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import '../../styles/workspace.css';
const OPEN = new Set(['pending','processing','payment_pending','awaiting_payment','pending_shopify_ack']);
export function AdminOrders() {
 useSEO({title:'Orders',noindex:true});
  const [params] = useSearchParams();
  const rows = db.useTable('orders', { orderBy:'placed_at', dir:'desc' });
  const [search,setSearch] = useState('');
  const [filter,setFilter] = useState('all');
  const [selectedId,setSelectedId] = useState(params.get('order') || '');
  const orders = rows.filter(o => `${o.id} ${o.source_order_number || ''} ${o.customer_name || ''}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || (filter === 'open' ? OPEN.has(o.status) : ['shipped','in_transit','out_for_delivery'].includes(o.status))));
  const selected = orders.find(o=>o.id===selectedId) || orders[0];
  const items = db.useTable('order_items', { where:{order_id:selected?.id || '__none__'} });
  return <AdminShell active="orders"><main id="main" className="um-workspace"><header className="ws-header"><div><h1>Orders</h1><p>Find an order, check its status, then take the next step.</p></div><Link className="ws-button" to="/admin/launch?tab=orders">Review legacy Shopify orders</Link></header>
    <div className="ws-actions" style={{marginBottom:20}}><label style={{flex:'1 1 240px'}}>Find an order<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Order number or customer"/></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All orders</option><option value="open">Needs review</option><option value="shipping">Shipping</option></select></label></div>
    <div className="ws-split"><section className="ws-card" style={{padding:0}} aria-label="Order list">{orders.length ? orders.map(o=><button className="ws-order-button" aria-pressed={selected?.id===o.id} key={o.id} onClick={()=>setSelectedId(o.id)}><div className="ws-row" style={{padding:0,border:0}}><strong>{o.source_order_number || o.id}</strong><span className="ws-pill">{(o.status || 'Unknown').replaceAll('_',' ')}</span></div><div>{o.customer_name || 'Customer details pending'}</div><span className="ws-muted">{o.placed_at ? fmt.date(o.placed_at) : 'Date pending'}{Number.isFinite(Number(o.total)) && o.total != null ? ` · ${fmt.money(o.total)}` : ''}</span></button>):<p className="ws-empty" style={{padding:20}}>No orders match. Try another search or filter.</p>}</section>
    {selected && <section className="ws-card" aria-label="Order details"><h2>{selected.source_order_number || selected.id}</h2><p>{selected.customer_name || 'Customer details pending'}</p><dl><div className="ws-row"><dt>Order status</dt><dd>{(selected.status || 'Unknown').replaceAll('_',' ')}</dd></div><div className="ws-row"><dt>Payment status</dt><dd>{(selected.payment_status || 'Not confirmed').replaceAll('_',' ')}</dd></div></dl>
      {selected.fulfillment_blocked && <div className="ws-note">Fulfillment is on hold. Review the reason before releasing this order.</div>}
      <h3>Items</h3><ul className="ws-list">{items.map(i=><li className="ws-row" key={i.id}><div><strong>{i.name || i.sku}</strong><span className="ws-muted">{i.sku}</span></div><span>Qty {i.qty}</span></li>)}</ul>{!items.length && <p>Item details are not loaded.</p>}
      <h3 style={{marginTop:24}}>Next step</h3><div className="ws-actions"><Link className="ws-button primary" to="/admin/fulfillment">Open fulfillment</Link><Link className="ws-button" to="/admin/finance">Review payment or refund</Link></div><p style={{marginTop:16}}>Payment and shipping status update through their payment and fulfillment workflows.</p>
      <OrderTimeline key={selected.id} orderId={selected.id}/>
      {selected.tracking_number && <div className="ws-note">Tracking: {selected.tracking_number}</div>}
    </section>}</div>
  </main></AdminShell>;
}
