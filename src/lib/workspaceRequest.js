const ERRORS = {
  damon_approval_required:'Damon must approve this order before it can continue.',
  damon_approval_authority_required:'Only Damon’s configured administrator account can make this decision.',
  order_changed_review_again:'This order changed. Reload its details and review it again.',
  order_changed_retry:'This order changed. Refresh before continuing.',
  review_delivered_price_before_payment:'Confirm this order’s shipping and tax before setting up payment.',
  delivered_price_review_required:'Review shipping and tax, then issue the revised quote.',
  shipping_origin_not_configured:'The warehouse shipping address needs to be configured before this review can be saved.',
  shipping_review_requested:'Your shipping and tax review is queued. Refresh the estimate after Unite confirms it.',
  refresh_shipping_and_tax:'This estimate expired or your order changed. Get shipping and tax again.',
  review_changed_refresh:'Another reviewer updated this request. Refresh the list.',
  freight_and_tax_required:'Enter both freight and tax, including an explicit zero when applicable.',
  preserved_exemption_requires_review:'This account has a preserved exemption. Resolve the tax discrepancy before saving.',
  records_changed_preview_again:'Customer records changed. Generate a new merge preview.',
  commercial_policy_conflict:'These accounts have different pricing, credit or tax policies. Reconcile them before merging.',
  contract_price_conflict:'Both accounts have a price for the same SKU. Reconcile those prices first.',
  membership_conflict_review_required:'A person belongs to both accounts. Review their membership before merging.',
  stripe_not_configured:'Payment processing is not connected yet.',
  provider_invoice_total_mismatch:'The provider invoice does not match the reviewed total. Finance must reconcile it before sending.',
  order_changed_payment_reconciliation_required:'The order changed during payment setup. Finance must reconcile the provider invoice.',
  mfa_encryption_not_configured:'Authenticator sign-in needs server configuration.',

  authentication_required:'Please sign in again.', not_configured:'This service is not connected yet.',
  private_storage_not_configured:'Document storage is not connected yet. Please contact Unite support.',
  shopify_not_configured:'Shopify read access is not connected on staging yet.',
  not_found:'This action is available on the configured staging environment only.',
  shopify_order_changed:'The Shopify order changed. Refresh the preview before continuing.',
  profile_not_pending_activation:'This account does not need activation, or it needs review first.',
  activation_email_missing:'Add a valid customer email before creating an activation link.',
  clean_scan_required:'The document needs a completed security scan before approval.',
  file_too_large:'Choose a file smaller than 4 MB.',
  content_type_not_allowed:'Choose a PDF, PNG or JPEG file.',
  file_signature_invalid:'This file could not be verified as a PDF or image.',
};
export async function workspaceRequest(url, options={}) {
  let response;
  try { response=await fetch(url,{credentials:'include',...options}); }
  catch { throw new Error('Could not connect. Check your connection and try again.'); }
  const body=await response.json().catch(()=>null);
  if(!response.ok || !body?.ok) throw new Error(ERRORS[body?.error] || (response.status===401?'Please sign in again.':response.status===403?'This account does not have access.':'Could not complete this action. Try again or contact support.'));
  return body;
}
export function postWorkspace(url,body) { return workspaceRequest(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
