import {Link} from 'react-router-dom';
import {AdminShell} from '../../components/layout/AdminShell.jsx';
export function AdminCount(){
 return <AdminShell active="inventory"><main id="main" className="uw-work-page"><header className="uw-page-heading"><div><span className="uw-eyebrow">Warehouse readiness</span><h1>Inventory counts</h1><p>Physical counts need a reconciled stock baseline.</p></div></header><section className="uw-detail"><h2>Posting is not enabled</h2><p>Darren’s physical recount is scheduled after launch. Keep count sheets with the warehouse, SKU, lot, counted quantity, time, and discrepancy reason. Damon must review the reconciliation before quantities are adjusted.</p><p>This page does not change inventory or record a completed movement.</p><div className="uw-detail-actions"><Link className="uw-button primary" to="/admin/inventory/receive">Receive a delivery</Link><Link className="uw-button" to="/work">Return to today</Link></div></section></main></AdminShell>;
}
