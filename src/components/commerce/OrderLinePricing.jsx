import {auth} from '../../lib/auth.js';
import {useEffect,useRef,useState} from 'react';
import {commerceRequest,money} from '../../lib/commerceClient.js';
import {orderPriceChange} from '../../lib/orderPriceReview.js';

export function OrderLinePricing({line,priced,discount,onApply,onClose}){
 const canEditCatalog=auth.use()?.role==='admin';
 const [price,setPrice]=useState(line.manual_price?line.unit_price:priced?.catalog_unit_price??line.unit_price);
 const [itemDiscount,setItemDiscount]=useState(()=>line.line_discount||{type:'percent',value:0,reason:''});
 const [cost,setCost]=useState(''),[product,setProduct]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmCost,setConfirmCost]=useState(false),[version,setVersion]=useState(0),[costReadError,setCostReadError]=useState('');
 const lock=useRef(false),priceRef=useRef(null);
 useEffect(()=>{priceRef.current?.focus();},[]);
 useEffect(()=>{let active=true;commerceRequest({kind:'products',id:line.product_id}).then(result=>{if(!active)return;if(!result.data)throw new Error('Product unavailable.');setProduct(result.data);setCost(result.data.cost>0?result.data.cost:'');setConfirmCost(false);setCostReadError('');}).catch(()=>{if(active)setCostReadError('Internal cost is unavailable. You can still apply the selling price.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[line.product_id,version]);
 const changed=product&&(String(cost??'').trim()===''?null:Math.round(Number(cost)*100)/100)!==(Number(product.cost)>0?Number(product.cost):null);
 let estimate=null;
 try{estimate=orderPriceChange({price,cost,product,updateCatalogCost:confirmCost,discount,lineDiscount:itemDiscount,catalogPrice:priced?.catalog_unit_price??product?.retail});}catch{/* Fields remain editable; submit reports the actionable error. */}
 async function apply(event){
  event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const change=orderPriceChange({price,cost,product,updateCatalogCost:confirmCost,discount,lineDiscount:itemDiscount,catalogPrice:priced?.catalog_unit_price??product?.retail});
   if(change.costPatch){
    const saved=await commerceRequest({},{action:'save',kind:'products',id:product.id,revision:product.revision,patch:change.costPatch});
    setProduct(saved.data);setCost(saved.data.cost??'');setConfirmCost(false);
    window.dispatchEvent(new CustomEvent('unite-records-changed'));
   }
   onApply({unit_price:change.unit_price,manual_price:change.manual_price,line_discount:change.line_discount},change.costPatch?'Catalog cost saved. Checking order pricing…':'Order price updated. Checking order pricing…');
  }catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}
 }
 return <section className="co-price-review" aria-label={'Price and cost for '+line.name}>
  <header><div><h3>Selling price &amp; discount</h3><p>{line.name} · {line.variant} · <strong>{line.sku}</strong></p></div><button type="button" className="cw-icon-button" disabled={busy} onClick={onClose} aria-label="Close price editor">×</button></header>
  <form onSubmit={apply} noValidate>
   <p className="co-price-explainer">Enter the customer’s selling price for this order. Internal cost is optional and is never added to the customer’s bill.</p>
   <div className="co-price-fields">
    <label htmlFor={'selling-'+line.id}>Customer price per sale unit (USD)<input id={'selling-'+line.id} ref={priceRef} type="number" min="0.01" step="0.01" required value={price} disabled={busy} onChange={e=>setPrice(e.target.value)}/><small>For this order only{Number(discount)>0?'; before the '+discount+'% order discount':''}.</small></label>
    <label htmlFor={'cost-'+line.id}>Internal cost per sale unit (USD, optional)<input id={'cost-'+line.id} type="number" min="0.01" step="0.01" value={cost} placeholder={loading?'Loading current cost…':'Enter verified cost'} disabled={!canEditCatalog||loading||busy||!product} onChange={e=>{setCost(e.target.value);setConfirmCost(false);}}/><small>{product?.cost>0?'Current catalog cost: '+money(product.cost):loading?'Reading the current catalog record…':'No verified catalog cost. This does not block order creation.'}</small></label>
   </div>
   <fieldset className="co-item-discount"><legend>Item discount</legend><div><label>Discount type<select value={itemDiscount.type} disabled={busy} onChange={e=>setItemDiscount(value=>({...value,type:e.target.value}))}><option value="percent">Percentage (%)</option><option value="amount">USD off each unit</option></select></label><label>{itemDiscount.type==='amount'?'Discount per unit (USD)':'Discount (%)'}<input type="number" min="0" max={itemDiscount.type==='percent'?'99.99':undefined} step="0.01" value={itemDiscount.value} disabled={busy} onChange={e=>setItemDiscount(value=>({...value,value:e.target.value}))}/></label></div><label>Reason (optional)<input value={itemDiscount.reason} maxLength="300" disabled={busy} onChange={e=>setItemDiscount(value=>({...value,reason:e.target.value}))} placeholder="Saved with this order item"/></label><small>Applies only to this item. Any order-wide discount is applied afterwards.</small></fieldset>
   <div className="co-price-math"><span>Customer pays per unit after discounts<strong>{estimate?money(estimate.effective_price):'—'}</strong></span><span>Gross margin<strong>{estimate?.gross_margin!=null?(estimate.gross_margin*100).toFixed(1)+'%':'Unavailable'}</strong></span><p>Missing cost or margin does not block creating the order. When cost is known, Jacobe’s prices below 35% margin still need Damon. Your signed-in account’s pricing permissions apply. Applying a price keeps this as a draft until you create the order.</p></div>
   {canEditCatalog&&changed&&<label className="co-cost-confirm"><input type="checkbox" checked={confirmCost} disabled={busy} onChange={e=>setConfirmCost(e.target.checked)}/><span><strong>Update this product’s catalog cost to {money(cost)}.</strong> This saves internal cost for this exact variant for future orders too. Leave this unchecked to apply only the selling price and keep catalog cost unchanged.</span></label>}
   {!changed&&!loading&&!(product?.cost>0)&&<p className="co-price-warning">Internal cost can be reviewed separately. Enter a valid selling price and complete the remaining order requirements.</p>}
   {costReadError&&<p className="cw-muted">{costReadError}</p>}
   {error&&<p className="cw-error" role="alert">{error}</p>}
   <footer><button type="button" disabled={busy||loading} onClick={()=>{setLoading(true);setVersion(v=>v+1);}}>Reload catalog cost</button><div><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Applying…':changed&&confirmCost?'Save catalog cost & apply price':'Apply price to this order'}</button></div></footer>
  </form>
 </section>;
}
