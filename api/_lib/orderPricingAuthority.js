import { canSetNewPrice, emailOf, isDamon, isJacobe } from './launchPolicy.js';

// Order entry does not require cost reconciliation. Keep identity authority
// and known-cost margin approvals separate from unavailable cost information.
// Quote pricing retains its existing policy in canSetNewPrice.
export function canSetCustomerOrderPrice(actor, price, cost) {
  if (!isDamon(actor) && !isJacobe(actor)) return {ok:false,reason:'pricing_authority_required'};
  if (!Number.isFinite(price) || price <= 0) return {ok:false,reason:'valid_price_required'};
  const knownCost = Number(cost);
  if (!Number.isFinite(knownCost) || knownCost <= 0) {
    return {ok:true,approved_by:emailOf(actor),gross_margin:null,cost_available:false};
  }
  return {...canSetNewPrice(actor,price,knownCost),cost_available:true};
}
