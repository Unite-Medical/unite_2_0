import {useCallback,useEffect,useState} from 'react';
import {AdminShell} from '../../components/layout/AdminShell.jsx';
import {useSEO} from '../../lib/seo.js';

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
const when=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';

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
      setResults(x=>({...x,[id]:{ok:true,text:`Label bought: ${String(d.shipment?.carrier||'').toUpperCase()} ${d.shipment?.tracking_number||''}`}}));
      await load();
    }catch(e){setResults(x=>({...x,[id]:{ok:false,text:e.message}}));}
    setBusy('');
  }
  const waiting=(orders||[]).filter(o=>o.status==='inventory_reserved'),labelled=(orders||[]).filter(o=>o.status==='ready_to_ship');
  const card=o=><li key={o.id} className="uw-label-card" style={{listStyle:'none',border:'1px solid var(--uw-line, #e3e1dc)',borderRadius:12,padding:16,display:'grid',gap:8,background:'#fff'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{o.customer_name||'Customer'}</strong><span className="uw-eyebrow">{o.id.replace(/^UM-(\w{8}).*$/,'UM-$1').toUpperCase()}</span></div>
    <div>{o.items.map(i=>`${i.qty} × ${i.name||i.sku} (${i.sku})`).join(', ')||'No lines'}</div>
    <div style={{color:'var(--uw-ink-2, #5c5a55)'}}>Ship to {[o.ship_to.name,o.ship_to.city,o.ship_to.state,o.ship_to.zip].filter(Boolean).join(', ')||'address missing'}{o.po_number?` · PO ${o.po_number}`:''}</div>
    {o.status==='ready_to_ship'
      ?<div><strong>Label bought</strong> · {String(o.carrier||'').toUpperCase()} {o.tracking_number}{o.label_created_at?` · ${when(o.label_created_at)}`:''} · <a href={`/api/orders/label?label=${encodeURIComponent(o.id)}`} target="_blank" rel="noopener noreferrer">Print label</a></div>
      :confirm===o.id
        ?<div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><span>This buys real postage in ShipStation.</span><button type="button" className="uw-button primary" onClick={()=>buy(o.id)}>Buy label now</button><button type="button" className="uw-button" onClick={()=>setConfirm('')}>Cancel</button></div>
        :<div><button type="button" className="uw-button primary" disabled={busy===o.id} onClick={()=>setConfirm(o.id)}>{busy===o.id?'Buying label…':'Buy label'}</button></div>}
    {results[o.id]&&<p role={results[o.id].ok?'status':'alert'} className={results[o.id].ok?undefined:'uw-error'}>{results[o.id].text}</p>}
  </li>;
  return <AdminShell active="labels"><main id="main" className="uw-workday">
    <header className="uw-day-heading"><div><span className="uw-eyebrow">Warehouse</span><h1>Ready to ship</h1><p>Orders that are approved, paid and released, with stock reserved. Buy the label, then pack and hand it to the carrier.</p></div><button type="button" className="uw-button" onClick={()=>load()}>Refresh</button></header>
    {error&&<p role="alert" className="uw-error">{error}</p>}
    {!orders&&!error&&<p>Loading…</p>}
    {orders&&<>
      <section style={{display:'grid',gap:12}}><h2>Needs a label ({waiting.length})</h2>{waiting.length?<ul style={{display:'grid',gap:12,padding:0,margin:0}}>{waiting.map(card)}</ul>:<p>Nothing is waiting for a label.</p>}</section>
      {labelled.length>0&&<section style={{display:'grid',gap:12,marginTop:24}}><h2>Label bought, waiting for carrier ({labelled.length})</h2><ul style={{display:'grid',gap:12,padding:0,margin:0}}>{labelled.map(card)}</ul></section>}
    </>}
  </main></AdminShell>;
}
