import crypto from 'node:crypto';
import { WELL_CONTRACT, WELL_PUBLIC_PRODUCTS, WELL_REQUEST_STATES } from '../../src/data/welllinkPublic.js';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const text = value => typeof value === 'string' ? value.trim() : '';
export const canReviewWellRequests = actor => actor?.role === 'admin' || ['sales','sales_manager'].includes(actor?.role) && actor?.email?.toLowerCase() === 'jacobe@unitemedical.net';
export function planWellRequest(input, actor = null, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok:false, error:'invalid_request' };
  const key = text(input.idempotency_key);
  if (!/^[\w-]{12,100}$/.test(key)) return { ok:false, error:'invalid_request_key' };
  if (!['access','sample','quote'].includes(input.kind)) return { ok:false, error:'invalid_request_kind' };
  const fields = {};
  for (const [field, max, required] of [['name',150,true],['title',150,true],['email',254,true],['organization',200,true],['facility',200,true],['address',300,true],['city',100,true],['state',80,true],['zip',10,true],['phone',40,false],['institution_id',100,false],['account_number',100,false],['participation_status',30,true],['quantity',200,false],['carrier',30,false],['carrier_account',50,false]]) {
    fields[field] = text(input[field]);
    if (fields[field].length > max || required && !fields[field]) return { ok:false, error:'invalid_details', field };
  }
  fields.email = fields.email.toLowerCase();
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(fields.email) || !/^\d{5}(-\d{4})?$/.test(fields.zip)) return { ok:false, error:'invalid_details' };
  if (!['not_started','submitted','accepted','unsure'].includes(fields.participation_status)) return { ok:false,error:'invalid_participation_status' };
  if (input.contact_permission !== true) return { ok:false, error:'contact_permission_required' };
  const skus = Array.isArray(input.skus) ? [...new Set(input.skus)].sort() : [];
  const allowed = WELL_PUBLIC_PRODUCTS.map(p => input.kind === 'sample' ? p.sampleSku : p.sku);
  if (skus.some(s => !allowed.includes(s)) || skus.length > 6 || input.kind !== 'access' && !skus.length) return { ok:false,error:'invalid_products' };
  if (input.kind === 'quote' && (!Number.isSafeInteger(Number(fields.quantity)) || Number(fields.quantity)<1 || Number(fields.quantity)>10000)) return {ok:false,error:'whole_cases_required'};
  if (input.kind === 'sample') {
    if (!['quote_shipping','UPS','FedEx'].includes(fields.carrier)) return { ok:false,error:'shipping_method_required' };
    if (fields.carrier_account && (fields.carrier === 'quote_shipping' || input.carrier_authorization !== true)) return { ok:false,error:'carrier_authorization_required' };
  } else { fields.carrier = ''; fields.carrier_account = ''; }
  const referral = {}, first_referral = {};
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) first_referral[key] = text(input.first_referral?.[key] || input.referral?.[key]).slice(0,200);
  for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) referral[key] = text(input.referral?.[key]).slice(0,200);
  const canonical = { ...fields, kind:input.kind, skus, case_quantities:input.kind==='quote'?Object.fromEntries(skus.map(sku=>[sku,Number(fields.quantity)])):null, referral, first_referral, marketing_opt_in:input.marketing_opt_in === true, contact_permission:true, carrier_authorization:input.kind === 'sample' && input.carrier_authorization === true };
  const at = now.toISOString(), id = `wlreq_${hash(key).slice(0,24)}`;
  const request = { ...canonical, id, request_hash:hash(JSON.stringify(canonical)), contract_id:WELL_CONTRACT, status:'requested', version:0, owner_email:'damon@unitemedical.net', profile_id:actor?.user_id || null, created_at:at, updated_at:at, pricing_enabled:false };
  const lead = { id:`lead_${id}`, revision:0, kind:'company', company:fields.organization, contact_name:fields.name, job_title:fields.title, email:fields.email, phone:fields.phone, address:fields.address, city:fields.city, state:fields.state, postal_code:fields.zip, country:'US', stage:'new', owner:'damon@unitemedical.net', source:'WellLink member request', segment:'WellLink', product_interest:`${WELL_CONTRACT} · ${input.kind} · ${skus.join(', ')}`, next_action:'Verify facility, requester authority and accepted participation before contract quoting', notes:`Facility: ${fields.facility}. Request: ${id}. Participation status is self-reported and is not approval.`, tags:['WellLink',WELL_CONTRACT], archived:false, do_not_contact:false, marketing_opt_in:canonical.marketing_opt_in, list_ids:[], user_fields:[], referral, first_referral, created_at:at, updated_at:at, events:[{id:`${id}_created`,at,actor:'WellLink request form',text:'Member requested contact. No pricing entitlement granted.'}] };
  const task = { id:`task_${id}`, kind:'welllink_request', subject:`WellLink ${input.kind}: ${fields.facility}`, owner_email:'damon@unitemedical.net', status:'open', ref_type:'welllink_request', ref_id:id, created_at:at };
  const audit = { id:`audit_${id}`, kind:'welllink.requested', ref_id:id, actor_id:actor?.user_id || 'public', created_at:at, payload:{kind:input.kind,contract_id:WELL_CONTRACT} };
  return {ok:true,request,lead,task,audit};
}
export function publicWellRequest(row) {
  return {id:row.id,kind:row.kind,facility:row.facility,status:row.status,created_at:row.created_at,updated_at:row.updated_at,pricing_enabled:false};
}
export function reviewWellRequest(existing, input, actor, now = new Date()) {
  if (!canReviewWellRequests(actor)) return {ok:false,error:'welllink_review_forbidden'};
  if (!existing) return {ok:false,error:'request_not_found'};
  if (!Number.isInteger(input.version) || input.version !== existing.version) return {ok:false,error:'request_changed'};
  if (!Object.hasOwn(WELL_REQUEST_STATES,input.status)) return {ok:false,error:'invalid_status'};
  const note=text(input.note);
  if (!note || note.length>2000) return {ok:false,error:'review_note_required'};
  return {ok:true,row:{...existing,status:input.status,staff_note:note,version:existing.version+1,updated_at:now.toISOString(),updated_by:actor.email,pricing_enabled:false}};
}
