import crypto from 'node:crypto';
import {canSetNewPrice,isDamon,isJacobe,emailOf} from './launchPolicy.js';
import {resolveAuthoritativePrice} from './commerce.js';
const qty=i=>Number(i.target_qty??i.qty??i.moq);
const price=i=>Number(i.sell_per_unit??i.unit_price??i.sell_price);
export function quotePriceFingerprint(quote,items){return crypto.createHash('sha256').update(JSON.stringify([quote.customer_id,items.map(i=>[i.id,i.sku,qty(i),price(i)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))])).digest('hex');}
export function catalogProduct(products,sku){
  const parent=products.find(p=>p.sku===sku||(p.variants||[]).some(v=>v.sku===sku));
  const variant=parent?.variants?.find(v=>v.sku===sku);
  return variant?{...parent,...variant,sku,name:`${parent.name} · ${variant.title||sku}`,landed_cost:variant.landed_cost??parent.landed_cost,cost:variant.cost??parent.cost}:parent;
}
const costOf=(item,products)=>{const p=catalogProduct(products,item.sku);return Number(p?.landed_cost??p?.cogs??p?.unit_cost??p?.cost??item.landed_per_unit);};
const costFingerprint=(items,products)=>crypto.createHash('sha256').update(JSON.stringify(items.map(i=>[i.id,costOf(i,products)]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex');
export function quotePricingGate({quote,items,products,organization,pricingRows=[],contractRows=[],volumeBreakRows=[]}){
  if(!quote||!items?.length)return {ok:false,reason:'quote_lines_required'};
  if(items.some(i=>!Number.isInteger(qty(i))||qty(i)<=0||!Number.isFinite(price(i))||price(i)<=0))return {ok:false,reason:'invalid_quote_lines'};
  const approval=quote.pricing_approval;
  if(approval?.actor_id&&['damon@unitemedical.net','jacobe@unitemedical.net'].includes(approval.actor_email)&&approval.fingerprint===quotePriceFingerprint(quote,items)&&approval.cost_fingerprint===costFingerprint(items,products))return {ok:true};
  for(const item of items){
    const resolved=resolveAuthoritativePrice({product:catalogProduct(products,item.sku),quantity:qty(item),organization,pricingRows,contractRows,volumeBreakRows});
    if(!resolved.ok||Math.abs(resolved.unit_price-price(item))>0.001)return {ok:false,reason:'quote_pricing_review_required'};
  }
  return {ok:true};
}
export function planQuotePrices({quote,items,products,actor,input,now=new Date()}){
  if(!isDamon(actor)&&!isJacobe(actor))return {ok:false,reason:'pricing_authority_required'};
  if(!quote||['accepted','declined'].includes(quote.status))return {ok:false,reason:'quote_locked'};
  if(Number(input.expected_revision)!==Number(quote.revision||0))return {ok:false,reason:'records_changed_refresh'};
  if(!String(input.reason||'').trim()||!items.length||input.prices?.length!==items.length||new Set(input.prices.map(i=>i.id)).size!==items.length)return {ok:false,reason:'price_and_reason_required'};
  const next=[];
  for(const item of items){
    const proposed=input.prices.find(i=>i.id===item.id),product=catalogProduct(products,item.sku);
    const cost=Number(product?.landed_cost??product?.cogs??product?.unit_cost??product?.cost??item.landed_per_unit);
    const unit=Math.round(Number(proposed?.unit_price)*100)/100,authority=canSetNewPrice(actor,unit,cost);
    if(!authority.ok)return {ok:false,reason:authority.reason};
    if(!Number.isInteger(qty(item))||qty(item)<=0)return {ok:false,reason:'invalid_quote_lines'};
    next.push({...item,sell_per_unit:unit,unit_price:unit,sell_price:unit,ext_sell:Math.round(unit*qty(item)*100)/100,ext_price:Math.round(unit*qty(item)*100)/100,counter_price:null});
  }
  const at=now.toISOString(),subtotal=Math.round(next.reduce((sum,i)=>sum+i.ext_sell,0)*100)/100;
  const updated={...quote,subtotal,total:Math.round((subtotal+Number(quote.shipping_cost||0)+Number(quote.tax||0))*100)/100,status:'draft',needs_approval:false,revision:Number(quote.revision||0)+1,totals_verified:false,acceptance_token_hash:null,delivery_review:null,valid_until:new Date(now.getTime()+14*86400000).toISOString(),updated_at:at};
  updated.pricing_approval={actor_id:actor.user_id,actor_email:emailOf(actor),reason:String(input.reason).trim().slice(0,2000),fingerprint:quotePriceFingerprint(updated,next),cost_fingerprint:costFingerprint(next,products),at};
  return {ok:true,quote:updated,items:next};
}
