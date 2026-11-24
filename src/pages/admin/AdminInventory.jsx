import {Boxes,ClipboardCheck,PackagePlus} from 'lucide-react';
import {Badge} from '../../components/ui/badge.jsx';
import {ButtonLink} from '../../components/ui/button.jsx';
import {Card as UiCard} from '../../components/ui/card.jsx';
import {EmptyState} from '../../components/ui/empty-state.jsx';
import {DataTable} from '../../components/ui/data-table.jsx';
import '../../styles/ui.css';
import {useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {AdminShell} from '../../components/layout/AdminShell.jsx';
import {useSEO} from '../../lib/seo.js';
import {db} from '../../lib/db.js';
import {availability} from '../../lib/wms/availability.js';
export function AdminInventory(){
 useSEO({title:'Inventory · Unite workspace',noindex:true});
 const products=db.useTable('products'),inventory=db.useTable('inventory'),warehouses=db.useTable('warehouses');
 const lots=db.useTable('lots');
 const [location,setLocation]=useState('');
 const rows=useMemo(()=>products.flatMap(p=>(p.variants?.length?p.variants:[p]).map(v=>({product:{...p,...v,id:v.id,product_id:p.id,name:p.variants?.length>1?(v.title?.startsWith(p.name)?v.title:`${p.name} · ${v.title}`):p.name},loaded:inventory.some(i=>i.sku===v.sku&&(!location||i.warehouse_id===location)),onHand:availability.onHand(v.sku,location||null),reserved:availability.reserved(v.sku,location||null),available:availability.availableToPromise(v.sku,location||null)}))),[products,inventory,lots,location]); // eslint-disable-line react-hooks/exhaustive-deps
 const where=location?warehouses.find(w=>w.id===location)?.name:'All Unite-owned locations';
 const editLink=r=>`/admin/products/edit/${encodeURIComponent(r.product.product_id)}`;
 const qty=(r,n)=>r.loaded?n.toLocaleString():'—';
 return <AdminShell active="inventory"><main id="main" className="ui-root mx-auto w-full max-w-[1500px] px-4 py-6 font-sans text-sm text-ink md:px-8"><div className="flex flex-col gap-5">
  <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="m-0 font-display text-2xl font-semibold text-ink">Inventory</h1><p className="mt-1 text-sm text-ink-2">Track available, committed and on-hand stock by location.</p></div><div className="flex flex-wrap gap-2"><ButtonLink to="/admin/inventory/count"><ClipboardCheck className="h-4 w-4"/>Stock count</ButtonLink><ButtonLink variant="primary" to="/admin/inventory/receive"><PackagePlus className="h-4 w-4"/>Receive inventory</ButtonLink></div></header>
  {inventory.some(i=>i.test_batch)&&<p className="m-0 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink-2">Provisional stock · September 8 Shopify export at Unite Medical Warehouse. A physical count is pending. “Not loaded” means the source stock needs review.</p>}
  <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Inventory totals">{[['Variants',rows.length],['On hand',rows.reduce((n,r)=>n+r.onHand,0)],['Available',rows.reduce((n,r)=>n+r.available,0)]].map(([label,value])=><UiCard key={label} className="px-4 py-3"><div className="text-xs font-medium text-ink-2">{label}</div><div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div><div className="text-xs text-ink-3">{where}</div></UiCard>)}</section>
  <DataTable label="Inventory" rows={rows} getRowId={r=>r.product.sku||r.product.id}
   searchPlaceholder="Search products or SKU" searchText={r=>`${r.product.name} ${r.product.sku||''}`}
   tabs={[{id:'all',label:'All'},{id:'low',label:'Low stock',filter:r=>r.loaded&&r.available>0&&r.available<=Number(r.product.reorder_at||5)},{id:'out',label:'Out of stock',filter:r=>r.loaded&&r.available<=0},{id:'unloaded',label:'Not loaded',filter:r=>!r.loaded}]}
   filters={[{id:'category',label:'Category',value:r=>r.product.category},{id:'vendor',label:'Vendor',value:r=>r.product.vendor}]}
   toolbar={<select aria-label="Inventory location" className="h-11 rounded-lg border border-line bg-card px-3 text-sm shadow-xs md:h-10" value={location} onChange={e=>setLocation(e.target.value)}><option value="">All locations</option>{warehouses.filter(w=>w.active!==false).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}
   defaultSort={{id:'product',dir:'asc'}} rowHref={editLink}
   empty={<EmptyState icon={Boxes} title="Your inventory starts here" description="Add products first, then receive or count stock to record your opening inventory." action={<ButtonLink variant="primary" to="/admin/products">Go to products</ButtonLink>}/>}
   columns={[
    {id:'product',header:'Product',sortValue:r=>r.product.name,cell:r=><Link className="font-semibold text-ink hover:text-brand" to={editLink(r)} state={{from:'/admin/inventory'}}>{r.product.name}</Link>},
    {id:'sku',header:'SKU',sortValue:r=>r.product.sku,cell:r=><span className="font-mono">{r.product.sku}</span>},
    {id:'available',header:'Available',align:'right',sortValue:r=>r.loaded?r.available:null,cell:r=><AvailBadge r={r}/>},
    {id:'held',header:'Held / committed',align:'right',sortValue:r=>r.loaded?r.reserved:null,cell:r=>qty(r,r.reserved)},
    {id:'onhand',header:'On hand',align:'right',sortValue:r=>r.loaded?r.onHand:null,cell:r=>qty(r,r.onHand)},
   ]}/>
 </div></main></AdminShell>;
}

function AvailBadge({r}){if(!r.loaded)return <Badge tone="neutral">Not loaded</Badge>;return <Badge tone={r.available<=0?'warn':'good'}>{r.available.toLocaleString()}</Badge>;}
