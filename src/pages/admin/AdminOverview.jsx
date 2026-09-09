import { useSEO } from '../../lib/seo.js';
import { Link } from 'react-router-dom';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { operationQueues } from '../../lib/operationsSummary.js';
import '../../styles/workspace.css';

export function AdminOverview() {
 useSEO({title:'Operations',noindex:true});
  const orders = db.useTable('orders', { orderBy:'placed_at', dir:'desc' });
  const inventory = db.useTable('inventory');
  const organizations = db.useTable('organizations');
  const invoices = db.useTable('invoices');
  const queues = operationQueues({ orders, inventory, organizations, invoices });
  return <AdminShell active="overview"><main id="main" className="um-workspace">
    <header className="ws-header"><div><div className="ws-eyebrow">Unite Medical · Operations</div><h1>What needs attention?</h1><p>Start with an order, a delivery, or a customer.</p></div><Link className="ws-button primary" to="/admin/launch">Prepare for launch</Link></header>
    <div className="ws-grid">{[['Orders to review',queues.orders,'Review orders','/admin/orders'],['Inventory to reconcile',queues.inventory,'Review inventory','/admin/inventory'],['Customers to review',queues.customers,'Review customers','/admin/customers']].map(([title,count,label,path])=><section key={path} className="ws-card"><h2>{title}</h2><div className="ws-count">{count}</div><p>In the loaded records</p><Link className="ws-button" to={path}>{label} →</Link></section>)}</div>
    <section className="ws-card"><h2>Warehouse and payments</h2><ul className="ws-list">{[['Receive a delivery','Scan against a purchase order.','/admin/inventory/receive'],['Pick and ship','Review items, lots and carrier handoff.','/admin/fulfillment'],['Review payments',`${queues.invoices} overdue invoices in the loaded records.`,'/admin/finance']].map(([title,detail,path])=><li key={path} className="ws-row"><div><strong>{title}</strong><span className="ws-muted">{detail}</span></div><Link className="ws-button" to={path}>Open →</Link></li>)}</ul></section>
    <section className="ws-card"><div className="ws-header"><h2>Recent orders</h2><Link to="/admin/orders">View all orders</Link></div>{orders.length ? <ul className="ws-list">{orders.slice(0,6).map(o=><li className="ws-row" key={o.id}><div><Link to={`/admin/orders?order=${encodeURIComponent(o.id)}`}>{o.source_order_number || o.id}</Link><p style={{margin:0}}>{o.customer_name || 'Customer details pending'}</p></div><span className="ws-pill">{(o.status || 'Unknown').replaceAll('_',' ')}</span></li>)}</ul> : <p className="ws-empty">No orders loaded. Open launch preparation to review your Shopify exports.</p>}</section>
  </main></AdminShell>;
}
