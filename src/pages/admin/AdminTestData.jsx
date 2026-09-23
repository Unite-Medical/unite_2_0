import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {AdminShell} from '../../components/layout/AdminShell.jsx';
import {refreshRemoteDb} from '../../lib/remoteDb.js';
import {useSEO} from '../../lib/seo.js';
import {WorkspaceIcon} from '../../components/workspace/WorkspaceIcon.jsx';
import {workspaceRequest,postWorkspace} from '../../lib/workspaceRequest.js';
export function AdminTestData(){
 useSEO({title:'Test data · Unite workspace',noindex:true});
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();workspaceRequest('/api/admin/test-data',{signal:c.signal}).then(setData).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[]);
 async function load(){setBusy(true);setError('');try{const result=await postWorkspace('/api/admin/test-data',{action:'load',version:data.version});setData(old=>({...old,...result,can_import:false}));await refreshRemoteDb();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <AdminShell active="test-data"><main id="main" className="uw-workday"><header className="uw-day-heading"><div><div className="uw-eyebrow">A clean start</div><h1>Test with the data you trust.</h1><p>A reviewed subset of your September 8 Shopify export, ready for this staging workspace.</p></div><Link to="/admin/launch" className="uw-button"><WorkspaceIcon name="upload" size={15}/>Check new CSV files</Link></header>
 {error&&<p role="alert" className="uw-error">{error}</p>}{!data&&!error&&<p role="status">Checking the workspace…</p>}{data&&<>
 <div className="uw-pilot-summary">{[['Products',data.summary.products],['Variants',data.summary.variants],['Stock records',data.summary.inventory_rows]].map(([label,n])=><div key={label}><strong>{n}</strong><span>{label} ready for testing</span></div>)}</div>
 <section className="uw-pilot-action"><div><strong>{data.loaded?'Your test catalog is loaded.':'Start with a small, usable catalog.'}</strong><p>{data.loaded?'Open products to search and inspect variants, then check provisional inventory.':'Loads products, variants and provisional Unite warehouse stock into staging.'}</p></div>{data.loaded?<Link to="/admin/products" className="uw-button primary">Open products<WorkspaceIcon name="arrow" size={15}/></Link>:<button className="uw-button primary" disabled={busy||!data.can_import} onClick={load}><WorkspaceIcon name="upload" size={15}/>{busy?'Loading…':`Load ${data.summary.products} products into staging`}</button>}</section>
 {data.loaded&&<p className="uw-notice" role="status">Loaded to the shared workspace. Product and inventory pages refresh from the saved records.</p>}{data.blocked_reason&&<p role="alert" className="uw-notice">{data.blocked_reason}</p>}
 <div className="uw-pilot-notes"><section className="uw-admin-card"><h2>Checked and ready</h2><ul><li>Active products from the approved catalog list</li><li>Unique SKUs, positive prices and costs</li><li>No duplicate barcodes or prices below cost</li><li>Variants, descriptions, images and weights retained</li></ul></section><section className="uw-admin-card"><h2>Still needs a person</h2><ul><li>{data.summary.held_products} other products stay out of this batch</li><li>Stock is from September 8, pending a physical count</li><li>{data.summary.held_inventory_rows} stock records need review and stay unloaded</li><li>Add and verify one customer before testing customer checkout</li></ul></section></div>
 <section className="uw-work-list"><div className="uw-queue-heading"><div><h2>The first test catalog</h2><p>{data.summary.products} products · {data.summary.variants} variants · No historical customers or orders</p></div><span className="uw-badge">{data.loaded?'Loaded':'Preview'}</span></div><div className="um-scroll-x"><table className="uw-catalog-table"><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Variants</th></tr></thead><tbody>{data.products.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.sku}</td><td>{p.category}</td><td>{p.variants}</td></tr>)}</tbody></table></div></section>
 <div className="uw-work-footer"><span>Staging only · Shopify remains the live store</span><Link to="/admin/workspace-reset">Manage workspace data →</Link></div>
 </>}</main></AdminShell>;
}
