import {Boxes,ClipboardCheck,PackagePlus,Search} from 'lucide-react';
import {Badge} from '../../components/ui/badge.jsx';
import {Button,ButtonLink} from '../../components/ui/button.jsx';
import {Card as UiCard} from '../../components/ui/card.jsx';
import {Input} from '../../components/ui/input.jsx';
import {Table,THead,TRow,TH,TD} from '../../components/ui/table.jsx';
import {EmptyState} from '../../components/ui/empty-state.jsx';
import {cn} from '../../lib/cn.js';
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
 const [search,setSearch]=useState(''),[location,setLocation]=useState(''),[filter,setFilter]=useState('all');
 const rows=useMemo(()=>products.flatMap(p=>(p.variants?.length?p.variants:[p]).map(v=>({product:{...p,...v,id:v.id,product_id:p.id,name:p.variants?.length>1?(v.title?.startsWith(p.name)?v.title:`${p.name} · ${v.title}`):p.name},loaded:inventory.some(i=>i.sku===v.sku&&(!location||i.warehouse_id===location)),onHand:availability.onHand(v.sku,location||null),reserved:availability.reserved(v.sku,location||null),available:availability.availableToPromise(v.sku,location||null)}))),[products,inventory,lots,location]); // eslint-disable-line react-hooks/exhaustive-deps
 const shown=rows.filter(r=>(filter!=='out'||r.loaded&&r.available<=0)&&`${r.product.name} ${r.product.sku}`.toLowerCase().includes(search.toLowerCase()));
 const tab=(v,t)=><button key={v} role="tab" aria-selected={filter===v} onClick={()=>setFilter(v)} className={cn('min-h-11 rounded-lg px-3 text-sm font-medium whitespace-nowrap md:min-h-10',filter===v?'bg-paper text-ink':'text-ink-2 hover:bg-paper/60')}>{t}</button>;
 const where=location?warehouses.find(w=>w.id===location)?.name:'All Unite-owned locations';
 const editLink=r=>`/admin/products/edit/${encodeURIComponent(r.product.product_id)}`;
 const qty=(r,n)=>r.loaded?n.toLocaleString():'—';
 return <AdminShell active="inventory"><main id="main" className="ui-root mx-auto w-full max-w-[1500px] px-4 py-6 font-sans text-sm text-ink md:px-8"><div className="flex flex-col gap-5">
  <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="m-0 font-display text-2xl font-semibold text-ink">Inventory</h1><p className="mt-1 text-sm text-ink-2">Track available, committed and on-hand stock by location.</p></div><div className="flex flex-wrap gap-2"><ButtonLink to="/admin/inventory/count"><ClipboardCheck className="h-4 w-4"/>Stock count</ButtonLink><ButtonLink variant="primary" to="/admin/inventory/receive"><PackagePlus className="h-4 w-4"/>Receive inventory</ButtonLink></div></header>
  {inventory.some(i=>i.test_batch)&&<p className="m-0 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink-2">Provisional stock · September 8 Shopify export at Unite Medical Warehouse. A physical count is pending. “Not loaded” means the source stock needs review.</p>}
  <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Inventory totals">{[['Variants',rows.length],['On hand',rows.reduce((n,r)=>n+r.onHand,0)],['Available',rows.reduce((n,r)=>n+r.available,0)]].map(([label,value])=><UiCard key={label} className="px-4 py-3"><div className="text-xs font-medium text-ink-2">{label}</div><div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div><div className="text-xs text-ink-3">{where}</div></UiCard>)}</section>
  <UiCard className="overflow-hidden">
   <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div role="tablist" aria-label="Inventory views" className="flex gap-1">{tab('all','All')}{tab('out','Out of stock')}</div><select aria-label="Inventory location" className="h-11 rounded-lg border border-line bg-white px-3 text-sm md:h-10" value={location} onChange={e=>setLocation(e.target.value)}><option value="">All locations</option>{warehouses.filter(w=>w.active!==false).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
    <div className="flex flex-wrap items-center gap-2"><div className="min-w-60 flex-1"><Input icon={Search} type="search" aria-label="Search inventory" placeholder="Search products or SKU" value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="text-sm text-ink-2">{shown.length} variants</span></div>
   </div>
   {!rows.length?<EmptyState icon={Boxes} title="Your inventory starts here" description="Add products first, then receive or count stock to record your opening inventory." action={<ButtonLink variant="primary" to="/admin/products">Go to products</ButtonLink>}/>:!shown.length?<EmptyState icon={Search} title="No products match" description="Try a different search, view or location." action={<Button onClick={()=>{setSearch('');setFilter('all');setLocation('');}}>Clear filters</Button>}/>:<>
    <ul className="m-0 list-none divide-y divide-line p-0 md:hidden">{shown.map(r=><li key={r.product.id}><Link to={editLink(r)} state={{from:'/admin/inventory'}} className="flex flex-col gap-1 px-4 py-3 text-ink no-underline"><span className="flex items-center justify-between gap-3"><span className="truncate font-semibold">{r.product.name}</span><AvailBadge r={r}/></span><span className="flex items-center justify-between gap-3 text-xs text-ink-2"><span className="font-mono">{r.product.sku}</span><span>On hand {qty(r,r.onHand)} · Held {qty(r,r.reserved)}</span></span></Link></li>)}</ul>
    <div className="hidden md:block"><Table><THead><tr><TH>Product</TH><TH>SKU</TH><TH className="text-right">Available</TH><TH className="text-right">Held / committed</TH><TH className="text-right">On hand</TH></tr></THead><tbody>{shown.map(r=><TRow key={r.product.id}><TD><Link className="font-semibold text-ink hover:text-brand" to={editLink(r)} state={{from:'/admin/inventory'}}>{r.product.name}</Link></TD><TD className="font-mono">{r.product.sku}</TD><TD className="text-right"><AvailBadge r={r}/></TD><TD className="text-right tabular-nums">{qty(r,r.reserved)}</TD><TD className="text-right tabular-nums">{qty(r,r.onHand)}</TD></TRow>)}</tbody></Table></div>
   </>}
  </UiCard>
 </div></main></AdminShell>;
}

function AvailBadge({r}){if(!r.loaded)return <Badge tone="neutral">Not loaded</Badge>;return <Badge tone={r.available<=0?'warn':'good'}>{r.available.toLocaleString()}</Badge>;}
