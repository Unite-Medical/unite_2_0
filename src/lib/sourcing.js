/**
 * Unified sourcing workflow from active demand through vendor offer approval.
 */

import { db } from './db.js';
import { uid } from './format.js';
import { mailer } from './mailer.js';
import { purchaseOrders } from './wms/purchaseOrders.js';
import { verifyVendorReviewToken } from './vendorPoTokens.js';
import { vendorPriceStatus } from './commercialPolicy.js';

const CONTACTABLE_SOURCES = new Set([
  'quick_quote', 'customer_account', 'work_email', 'sales_entry',
  'phone_transcript', 'document_upload', 'customer_po', 'rfq',
  'shortage', 'backorder_request',
]);
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizedText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function duplicateFor(input, now) {
  const description = normalizedText(input.product_description);
  return db.list('sourcing_requests').find((row) => {
    const age = now.getTime() - new Date(row.created_at).getTime();
    return age >= 0 && age <= DUPLICATE_WINDOW_MS
      && row.organization_id === (input.organization_id || null)
      && normalizedText(row.contact_email) === normalizedText(input.contact_email)
      && normalizedText(row.product_description) === description
      && Number(row.quantity || 0) === Number(input.quantity || 0);
  }) || null;
}

export async function createSourcingRequest(input, { now = new Date() } = {}) {
  if (!CONTACTABLE_SOURCES.has(input.source_channel)) {
    throw new Error('Sourcing request requires a contactable source with consent provenance.');
  }
  if (!input.account_owner_email) throw new Error('Sourcing request requires an account owner email.');
  if (!normalizedText(input.product_description)) throw new Error('Sourcing request requires a product description.');

  const duplicate = duplicateFor(input, now);
  if (duplicate) {
    const sources = [...new Set([...(duplicate.source_channels || [duplicate.source_channel]), input.source_channel])];
    const updated = db.update('sourcing_requests', duplicate.id, {
      source_channels: sources,
      duplicate_count: Number(duplicate.duplicate_count || 0) + 1,
      last_seen_at: now.toISOString(),
    });
    return { ok: true, duplicate: true, request: updated };
  }

  const request = db.insert('sourcing_requests', {
    id: uid('src'),
    status: 'new',
    source_channel: input.source_channel,
    source_channels: [input.source_channel],
    source_evidence: input.source_evidence || null,
    organization_id: input.organization_id || null,
    organization_name: input.organization_name || null,
    contact_email: input.contact_email || null,
    account_owner_email: input.account_owner_email,
    account_owner_name: input.account_owner_name || null,
    product_description: String(input.product_description).trim(),
    manufacturer: input.manufacturer || null,
    part_number: input.part_number || null,
    quantity: Number(input.quantity) || null,
    required_by: input.required_by || null,
    target_price: input.target_price == null ? null : Number(input.target_price),
    destination: input.destination || null,
    compliance_requirements: input.compliance_requirements || [],
    original_artifact_id: input.original_artifact_id || null,
    response_due_at: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    last_seen_at: now.toISOString(),
    created_at: now.toISOString(),
  });

  db.insert('tasks', {
    id: uid('task'),
    kind: 'sourcing_request',
    subject: `Source ${request.product_description}`,
    owner_email: input.account_owner_email,
    status: 'open',
    due_at: request.response_due_at,
    ref_type: 'sourcing_request',
    ref_id: request.id,
    created_at: now.toISOString(),
  });

  await mailer.send({
    to: input.account_owner_email,
    from: 'sourcing@unitemedical.net',
    subject: `New sourcing request ${request.id}`,
    body: `${input.organization_name || input.contact_email || 'A customer'} requested ${request.quantity || 'an unspecified quantity of'} ${request.product_description}. Review: /admin/sourcing/${request.id}`,
    template_key: 'sourcing/assigned',
    drafted_by: 'sourcing-system',
  });
  db.insert('audit_log', {
    id: uid('aud'), kind: 'sourcing.assigned', ref_id: request.id,
    payload: { owner_email: input.account_owner_email, source_channel: input.source_channel },
  });
  return { ok: true, duplicate: false, request };
}

function consensus(extractionPasses) {
  if (!Array.isArray(extractionPasses) || extractionPasses.length < 3) return null;
  const normalized = extractionPasses.slice(0, 3).map((pass) => JSON.stringify(pass));
  return normalized.every((value) => value === normalized[0]) ? extractionPasses[0] : null;
}

export function recordVendorOffer(input, { now = new Date() } = {}) {
  const normalized = consensus(input.extraction_passes);
  const confidence = Number(input.extraction_confidence) || 0;
  const status = normalized && confidence >= 0.99 ? 'reviewable' : 'needs_review';
  const lines = Array.isArray(normalized) ? normalized : normalized ? [normalized] : [];
  return db.insert('vendor_offers', {
    id: uid('vof'),
    sourcing_request_id: input.sourcing_request_id,
    vendor_id: input.vendor_id,
    vendor_name: input.vendor_name,
    original_artifact_id: input.original_artifact_id || null,
    extraction_passes: input.extraction_passes || [],
    extraction_confidence: confidence,
    extraction_consensus: Boolean(normalized),
    line_items: lines,
    status,
    created_at: now.toISOString(),
  });
}

export function approveVendorOffer(offerId, { approved_by = 'admin', now = new Date() } = {}) {
  const offer = db.get('vendor_offers', offerId);
  if (!offer) return { ok: false, reason: 'offer_not_found' };
  if (offer.status !== 'reviewable') return { ok: false, reason: 'offer_needs_review' };
  const vendor = db.get('vendors', offer.vendor_id);
  if (!vendor || vendor.status !== 'approved') return { ok: false, reason: 'vendor_not_approved' };

  for (const line of offer.line_items || []) {
    const price = vendorPriceStatus(line, now);
    if (!price.reusable) return { ok: false, reason: `vendor_price_${price.reason}` };
  }

  const po = purchaseOrders.create({
    vendor_name: offer.vendor_name,
    vendor_id: offer.vendor_id,
    line_items: (offer.line_items || []).map((line) => ({
      sku: line.sku,
      name: line.name,
      qty: line.qty,
      cost: line.unit_price,
    })),
    created_by: approved_by,
  });
  const linkedPo = db.update('purchase_orders', po.id, {
    vendor_email: vendor.contact_email || vendor.email || null,
    vendor_offer_id: offer.id,
    sourcing_request_id: offer.sourcing_request_id,
    vendor_price_valid_until: (offer.line_items || []).map((line) => line.valid_until).filter(Boolean).sort()[0] || null,
  });
  db.update('vendor_offers', offer.id, {
    status: 'approved', approved_by, approved_at: now.toISOString(), purchase_order_id: po.id,
  });
  db.update('sourcing_requests', offer.sourcing_request_id, {
    status: 'po_draft', selected_vendor_offer_id: offer.id, purchase_order_id: po.id,
  });
  return { ok: true, offer: db.get('vendor_offers', offer.id), purchase_order: linkedPo };
}

export async function acknowledgePurchaseOrder(token, { action, vendor_name = null, note = null, now = new Date() } = {}) {
  let po = db.list('purchase_orders').find((row) => row.vendor_review_token === token);
  if (!po) {
    for (const candidate of db.list('purchase_orders')) {
      if (await verifyVendorReviewToken(candidate, token)) { po = candidate; break; }
    }
  }
  if (!po) return { ok: false, reason: 'invalid_token' };
  const responseMap = {
    acknowledge: 'acknowledged',
    request_changes: 'changes_requested',
    cannot_fulfill: 'cannot_fulfill',
  };
  const response = responseMap[action];
  if (!response) return { ok: false, reason: 'invalid_action' };
  const current = po.vendor_response || 'pending';
  if (current !== 'pending') {
    return current === response
      ? { ok: true, duplicate: true, purchase_order: po }
      : { ok: false, reason: 'response_already_final', purchase_order: po };
  }

  const patch = {
    vendor_response: response,
    vendor_response_note: note,
    vendor_responded_by: vendor_name,
    vendor_responded_at: now.toISOString(),
    ...(response === 'acknowledged' ? { vendor_acknowledged_at: now.toISOString() } : {}),
  };
  const updated = db.update('purchase_orders', po.id, patch);
  db.insert('po_communications', {
    id: uid('poc'), po_id: po.id, kind: `vendor_${response}`, actor: vendor_name,
    payload: { note }, occurred_at: now.toISOString(),
  });
  db.insert('audit_log', {
    id: uid('aud'), kind: `po.vendor_${response}`, ref_id: po.id,
    payload: { vendor_name, note },
  });
  return { ok: true, purchase_order: updated };
}
