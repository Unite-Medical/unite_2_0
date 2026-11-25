import {useCallback,useEffect,useState} from 'react';
import {Printer,RefreshCw,Truck} from 'lucide-react';
import {AdminShell} from '../../components/layout/AdminShell.jsx';
import {DataTable} from '../../components/ui/data-table.jsx';
import {Badge} from '../../components/ui/badge.jsx';
import {Button} from '../../components/ui/button.jsx';
import {EmptyState} from '../../components/ui/empty-state.jsx';
import {useSEO} from '../../lib/seo.js';
import '../../styles/ui.css';

const REASONS={
  approval_required:'This order is still waiting for approval.',
  payment_not_released:'Finance has not released this order yet.',
  inventory_not_reserved:'Stock is not reserved for this order yet.',
  shipping_address_not_found:'This order has no ship-to address.',
  verified_shipping_package_required:'This product has no approved box size and weight. Ask an admin to add one.',
  verified_shipping_origin_required:'The warehouse ship-from address is not set up.',
  split_shipment_fulfillment_review_required:'Split shipments are handled on the Split shipments page.',
  label_reconciliation_required:'A label request for this order is already in progress. Check ShipStation before trying again.',
  label_capability_required:'Your role cannot buy shipping labels.',
};
const reason=code=>REASONS[code]||`Label not bought (${code||'unknown error'}).`;
const when=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
const money=v=>v==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
const shortId=id=>String(id||'').replace(/^UM-(\w{8}).*$/,'UM-$1').toUpperCase();
const CARRIERS={stamps_com:'USPS',usps:'USPS',fedex:'FedEx',ups:'UPS',ups_walleted:'UPS'};
const carrierName=c=>c?CARRIERS[c]||String(c).toUpperCase():'';
const serviceName=s=>s?String(s).replace(/^(usps|fedex|ups)_/,'').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase()):'';
const units=o=>o.items.reduce((n,i)=>n+i.qty,0);
const shipTo=o=>[o.ship_to.name,[o.ship_to.city,o.ship_to.state].filter(Boolean).join(', '),o.ship_to.zip].filter(Boolean).join(' · ')||'Address missing';

export function WarehouseLabels(){
  useSEO({title:'Ready to ship · Unite',noindex:true});
  const [orders,setOrders]=useState(null),[error,setError]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(''),[results,setResults]=useState({});
  const load=useCallback(async(signal)=>{
    try{const r=await fetch('/api/orders/label',{credentials:'include',signal});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(reason(d.error));setOrders(d.orders);setError('');}
    catch(e){if(e.name!=='AbortError')setError(e.message);}
  },[]);
  useEffect(()=>{const c=new AbortController();load(c.signal);return()=>c.abort();},[load]);
  async function buy(id){
    setBusy(id);setConfirm('');setResults(r=>({...r,[id]:null}));
    try{
      const r=await fetch('/api/orders/label',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:id})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok)throw new Error(reason(d.error));
      setResults(x=>({...x,[id]:{ok:true,text:`Label bought: ${carrierName(d.shipment?.carrier)} ${d.shipment?.tracking_number||''}`}}));
      await load();
    }catch(e){setResults(x=>({...x,[id]:{ok:false,text:e.message}}));}
    setBusy('');
  }
  const rows=orders||[],waiting=rows.filter(o=>o.status==='inventory_reserved').length;
  const action=o=>{
    const result=results[o.id];
    const note=result&&<p role={result.ok?'status':'alert'} className={`m-0 mt-1 text-xs ${result.ok?'text-brand':'text-warn'}`}>{result.text}</p>;
    if(o.status==='ready_to_ship')return <div className="flex flex-col items-end gap-1"><a className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm font-semibold text-ink shadow-xs hover:bg-paper md:h-8" href={`/api/orders/label?label=${encodeURIComponent(o.id)}`} target="_blank" rel="noopener noreferrer"><Printer className="h-4 w-4" aria-hidden/>Print label</a>{note}</div>;
    if(confirm===o.id)return <div className="flex flex-col items-end gap-1"><span className="text-xs text-warn">Buys real postage in ShipStation.</span><div className="flex gap-2"><Button size="sm" variant="ghost" onClick={()=>setConfirm('')}>Cancel</Button><Button size="sm" variant="primary" onClick={()=>buy(o.id)}>Buy label now</Button></div></div>;
    return <div className="flex flex-col items-end gap-1"><Button size="sm" variant="primary" disabled={busy===o.id} onClick={()=>setConfirm(o.id)}><Truck className="h-4 w-4" aria-hidden/>{busy===o.id?'Buying label…':'Buy label'}</Button>{note}</div>;
  };
  return <AdminShell active="labels"><main id="main" className="ui-root mx-auto w-full max-w-[1500px] px-4 py-6 font-sans text-sm text-ink md:px-8"><div className="flex flex-col gap-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="m-0 font-display text-2xl font-semibold text-ink">Ready to ship</h1><p className="mt-1 text-sm text-ink-2">Approved, paid and released orders with stock reserved. Buy the label, pack the box and hand it to the carrier.</p></div>
      <Button onClick={()=>load()}><RefreshCw className="h-4 w-4" aria-hidden/>Refresh</Button>
    </header>
    {error&&<p role="alert" className="m-0 rounded-lg border border-warn-soft bg-[#f8ede4] px-4 py-3 text-warn">{error}</p>}
    {!orders&&!error&&<p className="m-0 text-ink-2">Loading orders…</p>}
    {orders&&<DataTable label="Orders" rows={rows} pageSize={25} defaultTab={waiting?'awaiting':'all'}
      searchPlaceholder="Search order, customer, SKU, PO or tracking"
      searchText={o=>`${o.id} ${shortId(o.id)} ${o.customer_name} ${o.po_number} ${o.tracking_number||''} ${o.items.map(i=>`${i.sku} ${i.name||''}`).join(' ')} ${o.ship_to.city} ${o.ship_to.zip}`}
      tabs={[{id:'awaiting',label:'Awaiting label',filter:o=>o.status==='inventory_reserved'},{id:'labelled',label:'Label bought',filter:o=>o.status==='ready_to_ship'},{id:'all',label:'All'}]}
      filters={[{id:'carrier',label:'Carrier',value:o=>carrierName(o.carrier)},{id:'state',label:'Ship-to state',value:o=>o.ship_to.state}]}
      defaultSort={{id:'date',dir:'asc'}}
      empty={<EmptyState icon={Truck} title="Nothing to ship" description="Orders appear here once they are approved, paid, released and have stock reserved."/>}
      mobileCard={o=><div className="flex flex-col gap-1"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-semibold">{shortId(o.id)}</span>{o.status==='ready_to_ship'?<Badge tone="good" dot>Label bought</Badge>:<Badge tone="warn" dot>Awaiting label</Badge>}</div><div className="font-semibold">{o.customer_name||'Customer'}</div><div className="text-xs text-ink-2">{o.items.map(i=>`${i.qty} × ${i.sku}`).join(', ')||'No lines'}</div><div className="text-xs text-ink-2">{shipTo(o)}{o.po_number?` · PO ${o.po_number}`:''}</div>{o.tracking_number&&<div className="font-mono text-xs">{carrierName(o.carrier)} {o.tracking_number}</div>}</div>}
      columns={[
        {id:'order',header:'Order',accessor:'id',cell:o=><><div className="whitespace-nowrap font-mono text-xs font-semibold">{shortId(o.id)}</div>{o.po_number&&<div className="text-xs text-ink-2">PO {o.po_number}</div>}<div className="mt-1">{o.status==='ready_to_ship'?<Badge tone="good" dot>Label bought</Badge>:<Badge tone="warn" dot>Awaiting label</Badge>}</div></>},
        {id:'date',header:'Released',sortValue:o=>o.inventory_reserved_at||o.placed_at||'',cell:o=><span className="text-ink-2">{when(o.inventory_reserved_at||o.placed_at)}</span>},
        {id:'customer',header:'Customer',accessor:'customer_name',cell:o=><span className="font-medium">{o.customer_name||'Customer'}</span>},
        {id:'items',header:'Items',align:'right',sortValue:units,cell:o=><div title={o.items.map(i=>`${i.qty} × ${i.name||i.sku} (${i.sku})`).join('\n')}><div>{units(o)}</div><div className="whitespace-nowrap text-xs text-ink-2">{o.items.length===1?o.items[0].sku:`${o.items.length} SKUs`}</div></div>},
        {id:'shipto',header:'Ship to',sortValue:o=>`${o.ship_to.state} ${o.ship_to.city}`,cell:o=><><div className="font-medium">{o.ship_to.name||'—'}</div><div className="whitespace-nowrap text-xs text-ink-2">{[[o.ship_to.city,o.ship_to.state].filter(Boolean).join(', '),o.ship_to.zip].filter(Boolean).join(' ')||'Address missing'}</div></>},
        {id:'carrier',header:'Carrier · tracking',sortValue:o=>o.tracking_number||'',cell:o=>o.tracking_number?<><div>{carrierName(o.carrier)}{o.service?` · ${serviceName(o.service)}`:''}</div><div className="break-all font-mono text-xs text-ink-2">{o.tracking_number}</div></>:<span className="text-ink-3">—</span>},
        {id:'cost',header:'Postage',align:'right',sortValue:o=>o.label_cost??-1,cell:o=><span className="font-mono">{money(o.label_cost)}</span>},
        {id:'actions',header:'',sortable:false,cell:action},
      ]}/>}
    {orders&&waiting>0&&<p className="m-0 text-xs text-ink-2">{waiting} order{waiting===1?'':'s'} waiting for a label. Each label buys real postage in ShipStation.</p>}
  </div></main></AdminShell>;
}
