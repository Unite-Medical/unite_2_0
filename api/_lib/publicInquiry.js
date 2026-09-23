import {CONTACT_REASONS,inquiryLabel} from '../../src/lib/contactReasons.js';
import crypto from 'node:crypto';
import { buildCustomerIoOutbox } from './customerioOutbox.js';
const clean = (v, max = 4000) => String(v || '').trim().slice(0, max);
export function planPublicInquiry(input = {}, { ownerEmail = null, now = new Date(), sourceIpHash = null } = {}) {
  if (!['regenicool', 'surplus', 'contact'].includes(input.kind)) return { ok: false, reason: 'invalid_inquiry_type' };
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(String(input.idempotency_key || ''))) return { ok: false, reason: 'request_reference_required' };
  if (input.website_confirm) return { ok: false, reason: 'invalid_submission' };
  const contact = { name: clean(input.name || input.contact_name, 200), company: clean(input.company || input.hospital_name, 200), email: clean(input.email || input.contact_email, 254).toLowerCase(), phone: clean(input.phone || input.contact_phone, 100), business_type: clean(input.business_type, 200), message: clean(input.message || input.notes) };
  if(input.kind==='contact'){
    if(!CONTACT_REASONS.includes(input.reason)||!contact.message)return {ok:false,reason:'contact_reason_and_message_required'};
    if(!contact.company)contact.company=contact.name;
  }
  if (!contact.name || !contact.company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) return { ok: false, reason: 'contact_details_required' };
  if (input.kind === 'regenicool' && !contact.business_type) return { ok: false, reason: 'business_type_required' };
  let lines = [];
  if (input.kind === 'surplus') {
    if (input.us_business !== true || input.eligibility_confirmed !== true) return { ok: false, reason: 'us_business_and_eligibility_required' };
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 200) return { ok: false, reason: 'inventory_lines_required' };
    for (const line of input.lines) {
      const qty = Number(line.qty), expiry = clean(line.expiry_date, 10);
      if (!clean(line.product_identifier) || !clean(line.category) || !clean(line.provenance)) return { ok: false, reason: 'product_identity_and_provenance_required' };
      if (line.condition !== 'new_in_box') return { ok: false, reason: 'unopened_goods_only' };
      if (!clean(line.raw_description) || !Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'description_and_quantity_required' };
      if (expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isFinite(Date.parse(expiry)) || expiry <= now.toISOString().slice(0,10))) return { ok: false, reason: 'unexpired_goods_only' };
      lines.push({ raw_description: clean(line.raw_description), qty, condition: 'new_in_box', expiry_date: expiry || null, product_identifier: clean(line.product_identifier, 200), lot_number: clean(line.lot_number, 200), provenance: clean(line.provenance), evidence_url: clean(line.evidence_url, 1000), category: clean(line.category, 200), target_usd_per_unit: Number(line.target_usd_per_unit) > 0 ? Number(line.target_usd_per_unit) : null, review_status: 'evidence_review_required' });
    }
  }
  const canonical = { kind: input.kind, ...contact, lines, location: clean(input.pickup_location, 300),...(input.kind==='contact'?{reason:input.reason,route_to_rep:input.route_to_rep===true}:{}) };
  const hash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const id = 'inq_' + crypto.createHash('sha256').update(input.idempotency_key).digest('hex').slice(0,24);
  const at = now.toISOString();
  const inquiry = { id, ...canonical, request_hash: hash, owner_name: input.kind==='contact'&&!input.route_to_rep?'Support':'Jacobe', owner_email: ownerEmail, status: 'pending_review', visibility: 'private', release_mode: input.kind === 'surplus' ? 'intake_only' : input.kind==='contact'?'contact_request':'dealer_inquiry', created_at: at, source_ip_hash: sourceIpHash, notification_status: ownerEmail ? 'queued' : 'routing_required' };
  const task = { id: `${id}_review`, kind: `${input.kind}_inquiry`, subject: `${inquiryLabel(input.kind)} · ${contact.company}`, owner_name: input.kind==='contact'&&!input.route_to_rep?'Support':'Jacobe', owner_email: ownerEmail, status: 'open', ref_type: 'public_inquiry', ref_id: id, created_at: at };
  const outbox = ownerEmail ? buildCustomerIoOutbox({ idempotency_key: `${id}:assigned`, to: ownerEmail, transactional_message_id: 'unite_inquiry_assigned', subject: task.subject, body: `${contact.name} at ${contact.company}\n${contact.email}\n${contact.phone}\n${input.kind==='contact'?input.reason:''}\n${contact.message}\nReview privately in the Unite staff inquiry queue. Reference: ${id}`, ref_type: 'public_inquiry', ref_id: id, now }) : null;
  return { ok: true, inquiry, task, outbox };
}
