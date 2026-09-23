import {trackFunnel} from '../lib/funnelTelemetry.js';
import {useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Nav} from '../components/layout/Nav.jsx';
import {useCart,cartStore} from '../store/cart.js';
import {auth} from '../lib/auth.js';
import {db} from '../lib/db.js';
import {placeCustomerOrder} from '../lib/orders.js';
import {METHOD_LABEL} from '../lib/paymentMethods.js';
import {fmt} from '../lib/format.js';
import {useSEO} from '../lib/seo.js';
import {commerceAccessFor} from '../lib/accessPolicy.js';
import {postWorkspace} from '../lib/workspaceRequest.js';
import '../styles/workspace.css';
export function Checkout(){
 useSEO({title:'Checkout',noindex:true});const navigate=useNavigate(),session=auth.use(),cart=useCart(),orgId=session?.org_id||'__none__';
 const addresses=db.useTable('addresses',{where:{org_id:orgId}}),methods=db.useTable('account_payment_methods',{where:{org_id:orgId}}),org=db.useRow('organizations',orgId);
 const [address,setAddress]=useState(''),[payment,setPayment]=useState(''),[po,setPo]=useState(''),[estimate,setEstimate]=useState(null),[option,setOption]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [idempotencyKey]=useState(()=>crypto.randomUUID());const allowed=commerceAccessFor(session,org).can_order;
 const request={ship_to_address_id:address,payment_method:payment,po_number:po.trim(),lines:cart.items.map(i=>({sku:i.sku,qty:i.qty}))};
 const key=JSON.stringify(request);const current=estimate?.input===key?estimate:null;const selected=current?.options.find(o=>o.id===option);
 async function review(){setBusy(true);setError('');setEstimate(null);try{const r=await postWorkspace('/api/orders/estimate',request);setEstimate({...r.estimate,input:key});setOption(r.estimate.options[0]?.id||'');trackFunnel('shipping_zip_entered');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function place(){if(!selected)return;setBusy(true);setError('');try{const r=await placeCustomerOrder({...request,idempotency_key:idempotencyKey,estimate_id:current.id,shipping_option_id:selected.id,ship_method:selected.service});trackFunnel('order_created');cartStore.clear();navigate(`/orders/${r.order.id}/confirmed`);}catch(e){setError(e.message.replaceAll('_',' '));}finally{setBusy(false);}}
 return <><Nav/><main id="main" className="um-workspace" style={{maxWidth:960}}><header className="ws-header"><div><h1>Checkout</h1><p>Confirm your delivery details, review the total, then place your order.</p></div><Link to="/cart">Back to cart</Link></header>{!allowed?<section className="ws-card"><p>Your company account must be approved for ordering.</p><Link to="/quote">Request a quote</Link></section>:!cart.items.length?<p className="ws-empty">Your cart is empty. <Link to="/catalog">Browse products</Link></p>:<>
 <section className="ws-card"><h2>1. Delivery and payment</h2><div className="ws-grid"><label>Ship to<select value={address} onChange={e=>setAddress(e.target.value)} disabled={busy}><option value="">Choose an address</option>{addresses.map(a=><option key={a.id} value={a.id}>{a.label} · {a.line1}, {a.city} {a.zip}</option>)}</select></label><label>Payment<select value={payment} onChange={e=>setPayment(e.target.value)} disabled={busy}><option value="">Choose payment</option>{methods.filter(m=>m.status==='active'&&m.method!=='card').map(m=><option key={m.id} value={m.method}>{METHOD_LABEL[m.method]||m.method}</option>)}</select></label><label>Customer PO number<input value={po} onChange={e=>setPo(e.target.value)} disabled={busy} required/></label></div><p>ACH is payable before release. Pay-later terms require prior approval.</p><Link to="/account/settings">Manage delivery details</Link></section>
 <section className="ws-card"><h2>2. Review shipping and total</h2><ul className="ws-list">{cart.items.map(i=><li className="ws-row" key={i.sku}><span>{i.qty} × {i.name}</span><span>{fmt.money(i.unit_price*i.qty)}</span></li>)}</ul><p>Review current prices, shipping and applicable tax before placing your order. Mixed cartons or missing package data need a packing review.</p><button className="ws-button" disabled={busy||!address||!payment||!po.trim()} onClick={review}>{busy?'Working…':'Get shipping and tax'}</button>{error&&<div role="alert" className="ws-error">{error} <Link to="/contact">Ask Unite for help</Link></div>}{current&&<><p>Valid until {new Date(current.expires_at).toLocaleTimeString()}.</p>{current.options.map((o,i)=><label className="ws-row" key={o.id}><span><input type="radio" name="shipping" checked={option===o.id} onChange={()=>{setOption(o.id);trackFunnel('rate_selected');}} disabled={busy}/>{o.label}{i===0?' · Lowest available rate':''}</span><span>{fmt.money(o.freight)}</span></label>)}</>}</section>
 {selected&&<section className="ws-card"><h2>3. Place your order</h2><p>Shipping and handling: {fmt.money(selected.freight)} · Tax: {fmt.money(selected.tax)}</p><p className="ws-count">{fmt.money(selected.total)}</p>{selected.total>10000&&<p className="ws-note">This order will wait for Damon’s approval before payment setup and fulfillment.</p>}<button className="ws-button primary" disabled={busy} onClick={place}>{busy?'Submitting…':'Place order'}</button></section>}
 </>}</main></>;
}
