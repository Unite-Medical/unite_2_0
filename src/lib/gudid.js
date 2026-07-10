/**
 * GUDID / UDI compliance-as-a-service — Damon's spec (docs/ALEX-SPEC-
 * gudid-udi-compliance.md), Phase 1: portal-based submission.
 *
 * What this module owns:
 *   - GS1 prefix registry per labeler (Unite / Medava), medical flag,
 *     capacity, and consumption tracking with a near-cap alert (GS1 only
 *     shows total capacity, so we count usage on our side)
 *   - Sequential DI assignment from the correct medical-flagged prefix
 *     (GTIN-13 with GS1 check digit)
 *   - Labeler-ownership models:
 *       A — Unite Ready: our brand, our DI, we submit GUDID
 *       B — Unite Custom, customer has GS1: their DI, they submit
 *       C — Unite Custom, no GS1: our DI under their brand, Unite is
 *           LABELER OF RECORD — paid service, blocked until the customer
 *           signs the acknowledgment (regulatory obligations transfer)
 *   - Class 1 / Class 2 intake field sets + validation
 *   - Label paths: (1) we generate from field values, (2) customer
 *     uploads approved artwork and we compliance-check it
 *   - The post-quote / pre-production gate: GUDID never blocks a quote;
 *     it opens on order commit
 *
 * Tables: gs1_prefixes, udi_records, labeler_acknowledgments.
 */

import { db } from './db.js';
import { uid } from './format.js';

// ---------------------------------------------------------------------------
// Labelers + prefix registry (spec §1)
// ---------------------------------------------------------------------------

export const LABELERS = {
  unite: { key: 'unite', name: 'Unite Medical, LLC', duns: '117553945' },
  medava: { key: 'medava', name: 'medava, LLC', duns: '127447715' },
};

/**
 * GS1 prefixes as confirmed by Damon (Jul 10, 2026). 10-digit prefixes
 * carry a 2-digit item reference → 100 GTIN-13 slots each. Only
 * medical-flagged prefixes may issue device DIs. Original Unite usage
 * (299/300) is seeded as consumed; new assignments draw from 0850089282.
 */
const PREFIX_SEED = [
  { prefix: '0850012035', labeler: 'unite', medical: true, capacity: 100, seed_used: 100, expires: '2027-08-31' },
  { prefix: '0850063323', labeler: 'unite', medical: true, capacity: 100, seed_used: 100, expires: '2027-08-31' },
  { prefix: '0850052096', labeler: 'unite', medical: false, capacity: 100, seed_used: 99, expires: '2027-08-31' },
  { prefix: '0850089282', labeler: 'unite', medical: true, capacity: 100, seed_used: 0, expires: '2027-08-31' },
  { prefix: '0850058304', labeler: 'medava', medical: true, capacity: 100, seed_used: 0, expires: '2026-10-31' },
];

/** Alert when remaining slots on a prefix fall to this level (spec §5). */
export const PREFIX_ALERT_THRESHOLD = 20;

/** Idempotently seed the prefix registry (safe on existing local DBs). */
export function ensurePrefixRegistry() {
  for (const p of PREFIX_SEED) {
    const existing = db.list('gs1_prefixes', { where: { prefix: p.prefix } })[0];
    if (!existing) {
      db.insert('gs1_prefixes', {
        id: uid('gs1'),
        prefix: p.prefix,
        labeler: p.labeler,
        medical: p.medical,
        capacity: p.capacity,
        used: p.seed_used,
        expires: p.expires,
      });
    }
  }
  return db.list('gs1_prefixes');
}

/** GS1 mod-10 check digit for a 12-digit body → GTIN-13. */
export function gs1CheckDigit(body) {
  const digits = String(body).replace(/\D/g, '');
  let sum = 0;
  // Rightmost body digit gets weight 3, alternating leftward.
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[digits.length - 1 - i]);
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

/** Per-prefix status: used / remaining / near-cap alert (spec §5). */
export function prefixStatus() {
  ensurePrefixRegistry();
  return db.list('gs1_prefixes').map((p) => {
    const remaining = p.capacity - p.used;
    return {
      ...p,
      remaining,
      alert: p.medical && remaining <= PREFIX_ALERT_THRESHOLD,
      exhausted: remaining <= 0,
    };
  });
}

/**
 * Assign the next DI for a labeler, sequentially from that labeler's
 * medical-flagged prefix with remaining capacity (never a non-medical
 * or exhausted prefix). Returns { ok, di?, prefix?, reason? }.
 */
export function assignDi({ labeler = 'unite', brand = '', ref = null } = {}) {
  if (!LABELERS[labeler]) return { ok: false, reason: 'unknown_labeler' };
  ensurePrefixRegistry();
  const candidates = db
    .list('gs1_prefixes', { where: { labeler } })
    .filter((p) => p.medical && p.capacity - p.used > 0)
    .sort((a, b) => a.used - b.used === 0 ? a.prefix.localeCompare(b.prefix) : (b.capacity - b.used) - (a.capacity - a.used));
  const pick = candidates[0];
  if (!pick) return { ok: false, reason: 'no_medical_capacity', labeler };

  const itemRef = String(pick.used).padStart(2, '0');
  const body = `${pick.prefix}${itemRef}`;
  const di = `${body}${gs1CheckDigit(body)}`;
  db.update('gs1_prefixes', pick.id, { used: pick.used + 1 });
  db.insert('audit_log', {
    id: uid('aud'),
    kind: 'udi.di_assigned',
    ref_id: ref,
    payload: { di, prefix: pick.prefix, labeler, brand },
  });
  const after = db.get('gs1_prefixes', pick.id);
  return {
    ok: true,
    di,
    prefix: pick.prefix,
    remaining: after.capacity - after.used,
    alert: after.capacity - after.used <= PREFIX_ALERT_THRESHOLD,
  };
}

// ---------------------------------------------------------------------------
// Intake field sets (spec §3 — mirrors the Class 1 / Class 2 workbook)
// ---------------------------------------------------------------------------

/** Core DI-level fields required for BOTH classes, captured at onboarding. */
export const GUDID_CORE_FIELDS = [
  { key: 'brand_name', label: 'Brand Name' },
  { key: 'version_model', label: 'Version or Model Number' },
  { key: 'company_name', label: 'Company Name (Labeler)' },
  { key: 'device_description', label: 'Device Description' },
  { key: 'device_count', label: 'Device Count in Base Package', type: 'int' },
  { key: 'distribution_status', label: 'Commercial Distribution Status', options: ['In Distribution', 'Not in Distribution'] },
  { key: 'fda_product_code', label: 'FDA Product Code', pattern: /^[A-Z]{3}$/, hint: '3-letter, e.g. KGN' },
  { key: 'gmdn_term', label: 'GMDN Term' },
  { key: 'mri_safety', label: 'MRI Safety', options: ['Safe', 'Conditional', 'Unsafe', 'Labeled: no info'] },
  { key: 'sterile', label: 'Sterile?', type: 'yn' },
  { key: 'sterilization_method', label: 'Sterilization Method', requiredIf: (f) => f.sterile === 'Y' },
  { key: 'requires_sterilization', label: 'Requires Sterilization Before Use?', type: 'yn' },
  { key: 'rx_or_otc', label: 'Rx or OTC', options: ['Rx', 'OTC'] },
  { key: 'single_use', label: 'Single-Use?', type: 'yn' },
  { key: 'kit', label: 'Kit?', type: 'yn' },
  { key: 'combination_product', label: 'Combination Product?', type: 'yn' },
  { key: 'contains_nrl', label: 'Contains Natural Rubber Latex (NRL)?', type: 'yn' },
  { key: 'pi_has_lot', label: 'Has Lot/Batch # (PI)?', type: 'yn' },
  { key: 'pi_has_serial', label: 'Has Serial # (PI)?', type: 'yn' },
  { key: 'pi_has_mfg_date', label: 'Has Manufacturing Date (PI)?', type: 'yn' },
  { key: 'pi_has_expiry', label: 'Has Expiration Date (PI)?', type: 'yn' },
];

/** Class 2's defining extra: a real 510(k) K-number. Class 1 = 'Exempt'. */
export const FIELD_510K = { key: 'premarket_510k', label: '510(k) / Premarket Submission #' };

/** Both classes share the same field list; Class 2 tightens 510(k) validation. */
export function fieldsForClass() {
  return [...GUDID_CORE_FIELDS, FIELD_510K];
}

const YN = new Set(['Y', 'N']);

/**
 * Validate an intake payload for a device class. Returns
 * { ok, errors: [{field,label,problem}] }. PI *values* are not captured
 * here — only the Y/N flags (values arrive per production run).
 */
export function validateIntake(deviceClass, fields = {}) {
  const errors = [];
  const push = (f, problem) => errors.push({ field: f.key, label: f.label, problem });

  for (const f of GUDID_CORE_FIELDS) {
    const v = fields[f.key];
    const required = f.requiredIf ? f.requiredIf(fields) : true;
    if (v == null || String(v).trim() === '') {
      if (required) push(f, 'missing');
      continue;
    }
    const s = String(v).trim();
    if (f.type === 'yn' && !YN.has(s.toUpperCase())) push(f, 'must be Y or N');
    if (f.type === 'int' && (!/^\d+$/.test(s) || Number(s) < 1)) push(f, 'must be a positive integer');
    if (f.pattern && !f.pattern.test(s)) push(f, f.hint ? `must match: ${f.hint}` : 'invalid format');
    if (f.options && !f.options.some((o) => o.toLowerCase() === s.toLowerCase())) {
      push(f, `must be one of: ${f.options.join(' / ')}`);
    }
  }

  const k = String(fields[FIELD_510K.key] || '').trim();
  if (Number(deviceClass) === 2) {
    if (!/^K\d{6}$/i.test(k)) push(FIELD_510K, 'Class 2 requires a real K-number (e.g. K123456)');
  } else if (!k) {
    push(FIELD_510K, "enter 'Exempt' (most Class 1) or the K-number");
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Model C acknowledgment gate (spec §2)
// ---------------------------------------------------------------------------

/** The obligations a Model C customer must explicitly accept. */
export const MODEL_C_TERMS = [
  'Unite Medical is the labeler of record: the customer brand appears on the label, but Unite is the responsible party.',
  'Unite holds the Device Identifier (DI) and files and maintains the GUDID record.',
  'Unite assumes the labeler\u2019s regulatory obligations: GUDID accuracy, complaint handling, MDR/adverse-event reporting, recalls, and corrections/removals.',
  'This is a paid compliance service; the fee reflects Unite assuming that regulatory accountability.',
];

/** Record the signed Model C acknowledgment. All terms must be accepted. */
export function recordAcknowledgment({ customer_name = '', email = '', signer = '', accepted_terms = [] } = {}) {
  if (!customer_name || !signer) return { ok: false, reason: 'missing_signer' };
  if ((accepted_terms || []).length !== MODEL_C_TERMS.length) {
    return { ok: false, reason: 'all_terms_required' };
  }
  const row = db.insert('labeler_acknowledgments', {
    id: uid('ack'),
    customer_name,
    email,
    signer,
    terms: MODEL_C_TERMS,
    signed_at: new Date().toISOString(),
  });
  db.insert('audit_log', { id: uid('aud'), kind: 'udi.model_c_acknowledged', ref_id: row.id, payload: { customer_name, signer } });
  return { ok: true, acknowledgment: row };
}

export function findAcknowledgment(customer_name) {
  return db.list('labeler_acknowledgments', { where: { customer_name } })[0] || null;
}

// ---------------------------------------------------------------------------
// UDI records (the GUDID-ready record itself)
// ---------------------------------------------------------------------------

export const UDI_MODELS = {
  A: 'Unite Ready — Unite/Medava brand, our DI, we submit GUDID',
  B: 'Unite Custom — customer has GS1: their DI, they submit GUDID',
  C: 'Unite Custom — no GS1: Unite is labeler of record (paid service)',
};

/**
 * Create a UDI record for a device. Enforces the model rules:
 *   A — assigns a DI from the chosen labeler's medical prefix
 *   B — requires the customer's own DI (we never issue for model B)
 *   C — requires a signed acknowledgment BEFORE any DI is issued
 * Returns { ok, record?, reason?, errors? }.
 */
export function createUdiRecord({
  model = 'A',
  device_class = 1,
  labeler = 'unite',
  brand = '',
  customer_name = '',
  customer_di = '',
  acknowledgment_id = null,
  fields = {},
  order_id = null,
  quote_id = null,
} = {}) {
  if (!UDI_MODELS[model]) return { ok: false, reason: 'unknown_model' };

  const validation = validateIntake(device_class, fields);

  let di = customer_di || null;
  let prefix = null;
  if (model === 'B') {
    if (!/^\d{12,14}$/.test(String(customer_di).trim())) {
      return { ok: false, reason: 'model_b_requires_customer_di' };
    }
  } else {
    if (model === 'C') {
      const ack = acknowledgment_id
        ? db.get('labeler_acknowledgments', acknowledgment_id)
        : findAcknowledgment(customer_name);
      if (!ack) return { ok: false, reason: 'model_c_requires_acknowledgment' };
      acknowledgment_id = ack.id;
    }
    const assigned = assignDi({ labeler, brand, ref: order_id || quote_id });
    if (!assigned.ok) return { ok: false, reason: assigned.reason };
    di = assigned.di;
    prefix = assigned.prefix;
  }

  const record = db.insert('udi_records', {
    id: uid('udi'),
    model,
    device_class: Number(device_class),
    labeler: model === 'B' ? 'customer' : labeler,
    labeler_duns: model === 'B' ? null : LABELERS[labeler].duns,
    brand,
    customer_name: customer_name || null,
    di,
    prefix,
    acknowledgment_id,
    fields,
    fields_complete: validation.ok,
    field_errors: validation.errors,
    label_path: null,        // 'generate' | 'upload'
    label_status: 'pending', // pending | generated | uploaded_ok | uploaded_failed
    label_issues: [],
    // GUDID submitter: models A/C = Unite (portal, Phase 1); model B = customer.
    submitter: model === 'B' ? 'customer' : 'unite',
    status: validation.ok ? 'ready_to_label' : 'draft',
    submitted_at: null,
    order_id,
    quote_id,
  });
  return { ok: true, record };
}

/** Re-validate + update fields on a draft record. */
export function updateUdiFields(id, fields) {
  const rec = db.get('udi_records', id);
  if (!rec) return { ok: false, reason: 'not_found' };
  const merged = { ...rec.fields, ...fields };
  const validation = validateIntake(rec.device_class, merged);
  const updated = db.update('udi_records', id, {
    fields: merged,
    fields_complete: validation.ok,
    field_errors: validation.errors,
    status: validation.ok && rec.status === 'draft' ? 'ready_to_label' : rec.status,
  });
  return { ok: true, record: updated, validation };
}

/**
 * Promote a gate-opened record: the desk determines model + class (+ DI
 * source) and the record becomes a real intake. Applies the same rules
 * as createUdiRecord (Model B customer DI, Model C acknowledgment gate).
 */
export function promoteGateRecord(id, { model, device_class, labeler = 'unite', brand = '', customer_di = '', acknowledgment_id = null } = {}) {
  const rec = db.get('udi_records', id);
  if (!rec) return { ok: false, reason: 'not_found' };
  if (rec.status !== 'gate_open') return { ok: false, reason: 'not_gate_open' };
  if (!UDI_MODELS[model]) return { ok: false, reason: 'unknown_model' };

  let di = null;
  let prefix = null;
  if (model === 'B') {
    if (!/^\d{12,14}$/.test(String(customer_di).trim())) return { ok: false, reason: 'model_b_requires_customer_di' };
    di = customer_di.trim();
  } else {
    if (model === 'C') {
      const ack = acknowledgment_id
        ? db.get('labeler_acknowledgments', acknowledgment_id)
        : findAcknowledgment(rec.customer_name);
      if (!ack) return { ok: false, reason: 'model_c_requires_acknowledgment' };
      acknowledgment_id = ack.id;
    }
    const assigned = assignDi({ labeler, brand: brand || rec.brand || '', ref: rec.order_id });
    if (!assigned.ok) return { ok: false, reason: assigned.reason };
    di = assigned.di;
    prefix = assigned.prefix;
  }

  const validation = validateIntake(device_class, rec.fields || {});
  const updated = db.update('udi_records', id, {
    model,
    device_class: Number(device_class),
    labeler: model === 'B' ? 'customer' : labeler,
    labeler_duns: model === 'B' ? null : LABELERS[labeler].duns,
    brand: brand || rec.brand,
    di,
    prefix,
    acknowledgment_id,
    fields_complete: validation.ok,
    field_errors: validation.errors,
    submitter: model === 'B' ? 'customer' : 'unite',
    status: validation.ok ? 'ready_to_label' : 'draft',
  });
  return { ok: true, record: updated };
}

// ---------------------------------------------------------------------------
// Label paths (spec §4)
// ---------------------------------------------------------------------------

/** Elements every device label must carry for the compliance check. */
export const LABEL_REQUIRED_ELEMENTS = [
  { key: 'di_barcode', label: 'UDI barcode (DI encoded, GS1-128 or DataMatrix)' },
  { key: 'brand_name', label: 'Brand name' },
  { key: 'version_model', label: 'Version / model number' },
  { key: 'labeler_name', label: 'Labeler name ("Distributed by Unite Medical" for Model C)' },
  { key: 'rx_statement', label: 'Rx-only statement (if Rx)' },
  { key: 'sterile_marking', label: 'Sterility marking (if sterile)' },
  { key: 'latex_statement', label: 'NRL statement (if contains latex)' },
];

/** Path 1 — generate a label spec from the captured field values. */
export function generateLabelSpec(recordId) {
  const rec = db.get('udi_records', recordId);
  if (!rec) return { ok: false, reason: 'not_found' };
  if (!rec.fields_complete) return { ok: false, reason: 'fields_incomplete', errors: rec.field_errors };
  const f = rec.fields;
  const spec = {
    di: rec.di,
    barcode: 'GS1-128',
    lines: [
      f.brand_name,
      `Model ${f.version_model}`,
      rec.model === 'C' ? 'Distributed by Unite Medical' : f.company_name,
      f.rx_or_otc === 'Rx' ? 'Rx only' : null,
      f.sterile === 'Y' ? `STERILE · ${f.sterilization_method}` : null,
      f.contains_nrl === 'Y' ? 'Contains natural rubber latex' : null,
      f.single_use === 'Y' ? 'Single use only' : null,
    ].filter(Boolean),
    pi_placeholders: [
      f.pi_has_lot === 'Y' ? 'LOT' : null,
      f.pi_has_serial === 'Y' ? 'SN' : null,
      f.pi_has_mfg_date === 'Y' ? 'MFG' : null,
      f.pi_has_expiry === 'Y' ? 'EXP' : null,
    ].filter(Boolean),
  };
  db.update('udi_records', recordId, { label_path: 'generate', label_status: 'generated', status: 'ready_for_gudid' });
  return { ok: true, spec };
}

/**
 * Path 2 — compliance-check an uploaded, already-approved label. The
 * caller reports which required elements are present on the artwork
 * (`present`: array of element keys). Conditional elements are only
 * required when the intake fields make them applicable.
 */
export function complianceCheckLabel(recordId, { present = [], filename = '' } = {}) {
  const rec = db.get('udi_records', recordId);
  if (!rec) return { ok: false, reason: 'not_found' };
  const f = rec.fields || {};
  const need = LABEL_REQUIRED_ELEMENTS.filter((el) => {
    if (el.key === 'rx_statement') return f.rx_or_otc === 'Rx';
    if (el.key === 'sterile_marking') return f.sterile === 'Y';
    if (el.key === 'latex_statement') return f.contains_nrl === 'Y';
    return true;
  });
  const have = new Set(present);
  const missing = need.filter((el) => !have.has(el.key));
  const ok = missing.length === 0;
  db.update('udi_records', recordId, {
    label_path: 'upload',
    label_status: ok ? 'uploaded_ok' : 'uploaded_failed',
    label_issues: missing.map((m) => m.label),
    label_filename: filename || null,
    status: ok ? 'ready_for_gudid' : rec.status,
  });
  return { ok, missing };
}

/** Mark the record submitted via the GUDID portal (Phase 1 = manual). */
export function markSubmitted(recordId, { submittedBy = 'desk' } = {}) {
  const rec = db.get('udi_records', recordId);
  if (!rec) return { ok: false, reason: 'not_found' };
  if (rec.submitter === 'customer') return { ok: false, reason: 'customer_submits_model_b' };
  if (rec.status !== 'ready_for_gudid') return { ok: false, reason: 'not_ready', status: rec.status };
  const updated = db.update('udi_records', recordId, { status: 'submitted', submitted_at: new Date().toISOString() });
  db.insert('audit_log', { id: uid('aud'), kind: 'udi.gudid_submitted', ref_id: recordId, payload: { di: rec.di, by: submittedBy } });
  return { ok: true, record: updated };
}

// ---------------------------------------------------------------------------
// Post-quote / pre-production gate (spec §6)
// ---------------------------------------------------------------------------

/**
 * Open the UDI gate when an order commits. NEVER blocks the quote or the
 * order — it creates draft UDI records + a desk task for lines that will
 * carry Unite/Medava (or Model C customer) labeling: private-label /
 * import lines without an existing catalog GTIN.
 */
export function openUdiGateForOrder({ order_id, quote_id = null, customer_name = '', lines = [] } = {}) {
  const needsUdi = (lines || []).filter((l) => !l.gtin && (l.private_label || l.import_line || !l.sku));
  if (!needsUdi.length) return { opened: false, records: [] };

  const records = needsUdi.map((l) =>
    db.insert('udi_records', {
      id: uid('udi'),
      model: null, // desk determines A/B/C at intake
      device_class: null,
      labeler: null,
      brand: l.brand || null,
      customer_name,
      di: null,
      prefix: null,
      fields: { device_description: l.name || l.description || '' },
      fields_complete: false,
      field_errors: [],
      label_path: null,
      label_status: 'pending',
      status: 'gate_open',
      order_id,
      quote_id,
      line_ref: l.id || l.sku || null,
    }),
  );
  db.insert('tasks', {
    id: uid('task'),
    kind: 'udi_gate',
    ref_id: order_id,
    title: `UDI/GUDID gate — ${order_id} (${records.length} line${records.length === 1 ? '' : 's'})`,
    detail: 'Determine labeler model (A/B/C) + class, assign DI, capture GUDID fields, label, submit via portal.',
    status: 'open',
  });
  return { opened: true, records };
}
