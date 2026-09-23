// September 16, 2026 handoff. Existing migrated agreements are preserved.
export const DAMON_EMAIL = 'damon@unitemedical.net';
export const JACOBE_EMAIL = 'jacobe@unitemedical.net';
export const NEW_PRICE_MARGIN = 0.35;
export const emailOf = actor => String(actor?.email || '').trim().toLowerCase();
export const isDamon = actor => actor?.role === 'admin' && emailOf(actor) === DAMON_EMAIL;
export const isJacobe = actor => ['admin','sales','sales_manager'].includes(actor?.role) && emailOf(actor) === JACOBE_EMAIL;
export const isAshley = actor => ['admin','finance'].includes(actor?.role) && Boolean(process.env.UNITE_ASHLEY_EMAIL) && emailOf(actor) === process.env.UNITE_ASHLEY_EMAIL.toLowerCase();
export function ordinaryParcelCharge(carrierCost, { laterShipment = false, arrangement = null } = {}) {
  const cost=Number(carrierCost);
  if(carrierCost==null||!Number.isFinite(cost)||cost<0)return {ok:false,reason:'carrier_cost_pending'};
  const markup=Number(arrangement?.markup_pct??20),handling=Number(arrangement?.handling_flat??(laterShipment?0:15));
  if(!Number.isFinite(markup)||markup<0||!Number.isFinite(handling)||handling<0)return {ok:false,reason:'invalid_shipping_arrangement'};
  const total=Math.round((cost*(1+markup/100)+handling)*100)/100;
  return {ok:true,carrier_cost:cost,materials_markup_pct:markup,handling_fee:handling,calculated_amount:total,final_amount:total};
}
export function canSetNewPrice(actor, price, cost){
  if(!isDamon(actor)&&!isJacobe(actor))return {ok:false,reason:'pricing_authority_required'};
  if(!Number.isFinite(price)||!Number.isFinite(cost)||price<=0||cost<=0)return {ok:false,reason:'valid_price_and_landed_cost_required'};
  const margin=(price-cost)/price;
  if(margin+1e-9<NEW_PRICE_MARGIN&&!isDamon(actor))return {ok:false,reason:'damon_approval_required',minimum_price:Math.ceil(cost/(1-NEW_PRICE_MARGIN)*100)/100};
  return {ok:true,gross_margin:margin,approved_by:emailOf(actor)};
}
export function surplusFee(merchandiseValue){const value=Number(merchandiseValue);if(!Number.isFinite(value)||value<0)throw new Error('invalid_merchandise_value');return Math.round(value*10)/100;}
export function surplusFeeReversal({merchandiseValue,merchandiseRefund=0,reason,buyerPaid=false,introductionComplete=false,bothAgreed=false}){
 if(['buyer_never_paid','seller_cannot_supply'].includes(reason))return {ok:true,amount:surplusFee(merchandiseValue)};
 if(reason==='eligible_partial_refund'){if(merchandiseRefund<0||merchandiseRefund>merchandiseValue)return {ok:false,reason:'invalid_refund_amount'};return {ok:true,amount:surplusFee(merchandiseRefund)};}
 if(reason==='voluntary_cancellation'&&buyerPaid&&introductionComplete&&bothAgreed)return {ok:true,amount:0};
 return {ok:false,reason:'specific_refund_review_required'};
}
