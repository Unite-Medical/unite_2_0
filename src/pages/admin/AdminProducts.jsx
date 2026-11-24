import {Link} from 'react-router-dom';
import {Package,Plus,Upload} from 'lucide-react';
import {AdminShell} from '../../components/layout/AdminShell.jsx';
import {ButtonLink} from '../../components/ui/button.jsx';
import {Badge} from '../../components/ui/badge.jsx';
import {DataTable} from '../../components/ui/data-table.jsx';
import {EmptyState} from '../../components/ui/empty-state.jsx';
import {useSEO} from '../../lib/seo.js';
import {db} from '../../lib/db.js';
import '../../styles/ui.css';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
export function AdminProducts(){
 useSEO({title:'Products · Unite workspace',noindex:true});
 const products=db.useTable('products'),inventory=db.useTable('inventory');
 const rows=products.map(p=>{const variants=p.variants?.length?p.variants:[p],skus=new Set(variants.map(v=>v.sku)),stock=inventory.filter(i=>skus.has(i.sku)&&(i.inventory_owner_type||'unite')==='unite'&&!i.inventory_owner_org_id);return {...p,_variants:variants,_stock:stock,_available:stock.reduce((sum,r)=>sum+Number(r.on_hand||0)-Number(r.reserved||0),0),_image:p.hero_image||p.images?.[0]};});
 const pilot=products.some(p=>p.test_batch);
 const editLink=p=>`/admin/products/edit/${encodeURIComponent(p.id)}`;
 return <AdminShell active="products"><main id="main" className="ui-root mx-auto w-full max-w-[1500px] px-4 py-6 font-sans text-sm text-ink md:px-8"><div className="flex flex-col gap-5">
  <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="m-0 font-display text-2xl font-semibold text-ink">Products <span className="text-base font-medium text-ink-3">{products.length.toLocaleString()}</span></h1><p className="mt-1 text-sm text-ink-2">Everything you sell, with its variants and inventory in one place.</p></div><div className="flex flex-wrap gap-2"><ButtonLink to="/admin/test-data"><Upload className="h-4 w-4" aria-hidden/>Test data</ButtonLink><ButtonLink variant="primary" to="/admin/products/new"><Plus className="h-4 w-4" aria-hidden/>Add product</ButtonLink></div></header>
  {pilot&&<p className="m-0 rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink-2">Test catalog from September 8 · Prices and stock are for staging checks. Physical inventory is still pending.</p>}
  <DataTable label="Products" rows={rows} rowHref={editLink}
   searchPlaceholder="Search products, variants, SKU or vendor"
   searchText={p=>`${p.name} ${p.sku} ${p.vendor||''} ${p._variants.map(v=>`${v.sku} ${v.title||''}`).join(' ')}`}
   tabs={[{id:'all',label:'All'},{id:'active',label:'Available',filter:p=>p.available!==false},{id:'hidden',label:'Hidden',filter:p=>p.available===false},{id:'nostock',label:'No stock loaded',filter:p=>!p._stock.length}]}
   filters={[{id:'category',label:'Category',value:p=>p.category||'Uncategorized'},{id:'vendor',label:'Vendor',value:p=>p.vendor}]}
   defaultSort={{id:'name',dir:'asc'}}
   empty={<EmptyState icon={Package} title="A clean slate for your catalog" description="Start with the reviewed Shopify batch to test search, product details and variants." action={<ButtonLink variant="primary" to="/admin/test-data">Review test catalog</ButtonLink>}/>}
   columns={[
    {id:'name',header:'Product',accessor:'name',cell:p=><Link to={editLink(p)} className="flex items-center gap-3 text-ink no-underline hover:text-brand"><span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper">{p._image?<img src={p._image} alt="" loading="lazy" className="h-full w-full object-cover" onError={e=>{e.currentTarget.style.display='none';}}/>:<Package className="h-4 w-4 text-ink-3" aria-hidden/>}</span><span className="min-w-0"><span className="block font-semibold">{p.name}</span><span className="block text-xs text-ink-2">{p.sku} · {p._variants.length} {p._variants.length===1?'variant':'variants'}</span></span></Link>},
    {id:'status',header:'Status',sortValue:p=>p.available!==false?'Available':'Hidden',cell:p=><Badge tone={p.available!==false?'good':'neutral'} dot>{p.available!==false?'Available':'Hidden'}</Badge>},
    {id:'inventory',header:'Inventory',align:'right',sortValue:p=>p._stock.length?p._available:null,cell:p=><>{p._stock.length?<span className={p._available<=0?'text-warn':''}>{p._available.toLocaleString()} available</span>:<span className="text-ink-3">Not loaded</span>}{p._stock.length>0&&p._stock.length<p._variants.length&&<span className="block text-xs text-ink-3">{p._variants.length-p._stock.length} variants need review</span>}</>},
    {id:'category',header:'Category',sortValue:p=>p.category||'',cell:p=>p.category||<span className="text-ink-3">Uncategorized</span>},
    {id:'vendor',header:'Vendor',accessor:'vendor'},
    {id:'price',header:'Price',align:'right',sortValue:p=>Number(p.price_min??p.price)||0,cell:p=><span className="whitespace-nowrap font-mono">{money(p.price_min??p.price)}{p.price_max>p.price_min?' +':''}</span>},
   ]}/>
 </div></main></AdminShell>;
}
