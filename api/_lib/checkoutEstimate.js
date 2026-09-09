import crypto from 'node:crypto';
import {shippingOrigin} from './shippingOrigin.js';
export function estimateBinding(draft){return crypto.createHash('sha256').update(JSON.stringify({customer:draft.order.customer_id,exempt:draft.order.tax_exempt_basis,address:draft.address,lines:draft.lines.map(l=>[l.sku,l.qty,l.unit_price]),payment:draft.order.payment_method})).digest('hex');}
export function validateEstimate(estimate,draft,optionId,now=Date.now()){
 if(!estimate||!Number.isFinite(Date.parse(estimate.expires_at))||Date.parse(estimate.expires_at)<=now||estimate.binding!==estimateBinding(draft))return {ok:false,reason:'refresh_shipping_and_tax'};
 const option=estimate.options?.find(o=>o.id===optionId);if(!option)return {ok:false,reason:'shipping_option_required'};
 return {ok:true,option};
}
export function shippingPackage(lines,products){
 // A firm parcel rate requires an approved packed carton, not inferred dimensions.
 if(lines.length!==1)return {ok:false,reason:'packing_review_required'};
 const product=products.find(p=>p.sku===lines[0].sku||(p.variants||[]).some(v=>v.sku===lines[0].sku));
 const variant=product?.variants?.find(v=>v.sku===lines[0].sku);
 const packs=(variant?.shipping_packages||product?.shipping_packages||[]).filter(p=>p.approved===true&&Number(p.quantity)===lines[0].qty);
 const pack=packs[0];
 if(!pack||![pack.weight_lb,pack.length_in,pack.width_in,pack.height_in].every(v=>Number.isFinite(Number(v))&&Number(v)>0))return {ok:false,reason:'packing_review_required'};
 return {ok:true,weight:{value:Number(pack.weight_lb),units:'pounds'},dimensions:{length:Number(pack.length_in),width:Number(pack.width_in),height:Number(pack.height_in),units:'inches'}};
}
async function jsonFetch(url,options,fetchImpl){const r=await fetchImpl(url,{...options,signal:AbortSignal.timeout(20000)});const body=await r.json();if(!r.ok)throw new Error('provider_estimate_failed');return body;}
export async function calculateEstimate({draft,products,organization,fetchImpl=fetch,env=process.env,now=new Date()}){
 const pack=shippingPackage(draft.lines,products);if(!pack.ok)return pack;
 if(!env.SHIPSTATION_API_KEY||!env.SHIPSTATION_API_SECRET||!env.UNITE_SHIP_FROM_ZIP)return {ok:false,reason:'shipping_not_configured'};
 const origin=shippingOrigin(env);if(!origin)return {ok:false,reason:'shipping_origin_not_configured'};
 const exempt=organization.shopify_tax_exempt===true||organization.tax_exempt===true;
 if(!exempt&&!env.STRIPE_SECRET_KEY)return {ok:false,reason:'tax_not_configured'};
 const headers={Authorization:'Basic '+Buffer.from(`${env.SHIPSTATION_API_KEY}:${env.SHIPSTATION_API_SECRET}`).toString('base64'),'Content-Type':'application/json'};
 const carriers=String(env.UNITE_RATE_CARRIERS||'fedex,ups').split(',').filter(c=>['fedex','ups','stamps_com'].includes(c));
 const results=await Promise.allSettled(carriers.map(async carrier=>{
  const rates=await jsonFetch('https://ssapi.shipstation.com/shipments/getrates',{method:'POST',headers,body:JSON.stringify({carrierCode:carrier,fromPostalCode:env.UNITE_SHIP_FROM_ZIP,toState:draft.address.state,toCountry:draft.address.country||'US',toPostalCode:draft.address.zip,toCity:draft.address.city,weight:pack.weight,dimensions:pack.dimensions,confirmation:'delivery',residential:draft.address.residential===true})},fetchImpl);
  if(!Array.isArray(rates))throw new Error('invalid_rates');
  return rates.filter(r=>r.serviceCode&&Number.isFinite(Number(r.shipmentCost))&&Number(r.shipmentCost)>=0).map(r=>({...r,carrier}));
 }));
 const handling=organization.shipping_handling_flat??15;
 if(!Number.isFinite(Number(handling))||Number(handling)<0)return {ok:false,reason:'handling_policy_required'};
 const rates=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value).sort((a,b)=>Number(a.shipmentCost)-Number(b.shipmentCost)).slice(0,6);
 if(!rates.length)return {ok:false,reason:'no_carrier_rates'};
 const options=[];
 for(const rate of rates){
  const carrierCost=Number(rate.shipmentCost)+Number(rate.otherCost||0);
  if(!Number.isFinite(carrierCost)||carrierCost<0)continue;
  const freight=Math.round((carrierCost+Number(handling))*100)/100;
  let tax=0,taxId=null;
  if(!exempt){
   const form={'currency':'usd','customer_details[address_source]':'shipping','shipping_cost[amount]':String(Math.round(freight*100))};
   for(const [field,value] of Object.entries({line1:draft.address.line1,line2:draft.address.line2,city:draft.address.city,state:draft.address.state,postal_code:draft.address.zip,country:draft.address.country||'US'}))if(value)form[`customer_details[address][${field}]`]=value;
   for(const [i,line] of draft.lines.entries()){
    const product=products.find(p=>p.sku===line.sku||(p.variants||[]).some(v=>v.sku===line.sku));
    const taxCode=product?.stripe_tax_code;if(!taxCode)return {ok:false,reason:'product_tax_code_required',sku:line.sku};
    form[`line_items[${i}][amount]`]=String(Math.round(line.ext_price*100));form[`line_items[${i}][reference]`]=line.sku;form[`line_items[${i}][tax_code]`]=taxCode;form[`line_items[${i}][tax_behavior]`]='exclusive';
   }
   const calculation=await jsonFetch('https://api.stripe.com/v1/tax/calculations',{method:'POST',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form).toString()},fetchImpl);
   if(!calculation.id||!Number.isInteger(calculation.tax_amount_exclusive)||calculation.tax_amount_exclusive<0)return {ok:false,reason:'invalid_tax_evidence'};
   tax=calculation.tax_amount_exclusive/100;taxId=calculation.id;
  }
  options.push({id:crypto.randomUUID(),label:rate.serviceName||rate.serviceCode,service:rate.serviceCode,carrier:rate.carrier,freight,tax,total:Math.round((draft.order.subtotal+freight+tax)*100)/100,tax_calculation_id:taxId,tax_basis:exempt?'preserved_account_exemption':'stripe_tax',shipping_package:pack,ship_from:origin,carrier_cost:carrierCost,handling:Number(handling)});
 }
 return {ok:true,estimate:{id:crypto.randomUUID(),customer_id:draft.order.customer_id,binding:estimateBinding(draft),expires_at:new Date(now.getTime()+15*60000).toISOString(),created_at:now.toISOString(),options}};
}
