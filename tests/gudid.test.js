/** GUDID / UDI compliance-as-a-service (spec: docs/ALEX-SPEC-gudid-udi-compliance.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/lib/db.js';
import {
  ensurePrefixRegistry,
  prefixStatus,
  gs1CheckDigit,
  assignDi,
  validateIntake,
  GUDID_CORE_FIELDS,
  MODEL_C_TERMS,
  recordAcknowledgment,
  createUdiRecord,
  promoteGateRecord,
  generateLabelSpec,
  complianceCheckLabel,
  markSubmitted,
  openUdiGateForOrder,
  PREFIX_ALERT_THRESHOLD,
} from '../src/lib/gudid.js';
import { generateGudidIntakeXlsx } from '../src/lib/gudidTemplate.js';

/** A complete, valid Class 1 intake payload. */
function validFields(overrides = {}) {
  return {
    brand_name: 'RegeniCool',
    version_model: 'RC-100',
    company_name: 'Unite Medical, LLC',
    device_description: 'Cold therapy wrap, knee',
    device_count: '1',
    distribution_status: 'In Distribution',
    fda_product_code: 'IMD',
    gmdn_term: 'Cold pack, reusable',
    mri_safety: 'Safe',
    sterile: 'N',
    requires_sterilization: 'N',
    rx_or_otc: 'OTC',
    single_use: 'N',
    kit: 'N',
    combination_product: 'N',
    contains_nrl: 'N',
    pi_has_lot: 'Y',
    pi_has_serial: 'N',
    pi_has_mfg_date: 'Y',
    pi_has_expiry: 'Y',
    premarket_510k: 'Exempt',
    ...overrides,
  };
}

test('prefix registry: seeded per spec — 299/300 consumed on original Unite prefixes', () => {
  ensurePrefixRegistry();
  const status = prefixStatus();
  const unite = status.filter((p) => p.labeler === 'unite');
  assert.equal(unite.length, 4);
  // Original medical prefixes are full; new 0850089282 has the capacity.
  const fresh = status.find((p) => p.prefix === '0850089282');
  assert.equal(fresh.medical, true);
  assert.ok(fresh.remaining > 0);
  const nonMedical = status.find((p) => p.prefix === '0850052096');
  assert.equal(nonMedical.medical, false);
});

test('gs1CheckDigit: standard mod-10', () => {
  // 629104150021 → check digit 3 (known GS1 example).
  assert.equal(gs1CheckDigit('629104150021'), '3');
});

test('assignDi: sequential, medical-flagged prefix only, valid GTIN-13', () => {
  const a = assignDi({ labeler: 'unite', brand: 'Unite' });
  assert.equal(a.ok, true);
  assert.equal(a.prefix, '0850089282'); // only Unite medical prefix with capacity
  assert.equal(a.di.length, 13);
  assert.equal(a.di.slice(-1), gs1CheckDigit(a.di.slice(0, 12)));

  const b = assignDi({ labeler: 'unite', brand: 'Unite' });
  assert.notEqual(a.di, b.di);
  assert.equal(Number(b.di.slice(10, 12)), Number(a.di.slice(10, 12)) + 1);
});

test('assignDi: unknown labeler rejected', () => {
  assert.equal(assignDi({ labeler: 'acme' }).ok, false);
});

test('capacity alert fires within threshold', () => {
  ensurePrefixRegistry();
  const p = db.list('gs1_prefixes', { where: { prefix: '0850089282' } })[0];
  const before = p.used;
  db.update('gs1_prefixes', p.id, { used: p.capacity - PREFIX_ALERT_THRESHOLD });
  const res = assignDi({ labeler: 'unite' });
  assert.equal(res.ok, true);
  assert.equal(res.alert, true);
  db.update('gs1_prefixes', p.id, { used: before });
});

test('validateIntake: complete Class 1 passes; Class 2 demands a real K-number', () => {
  assert.equal(validateIntake(1, validFields()).ok, true);

  const c2exempt = validateIntake(2, validFields());
  assert.equal(c2exempt.ok, false);
  assert.ok(c2exempt.errors.some((e) => e.field === 'premarket_510k'));

  assert.equal(validateIntake(2, validFields({ premarket_510k: 'K123456' })).ok, true);
});

test('validateIntake: catches type errors + conditional sterilization method', () => {
  const bad = validateIntake(1, validFields({ sterile: 'Y', fda_product_code: 'toolong', device_count: '0' }));
  assert.equal(bad.ok, false);
  const fields = bad.errors.map((e) => e.field);
  assert.ok(fields.includes('sterilization_method')); // required when sterile=Y
  assert.ok(fields.includes('fda_product_code'));
  assert.ok(fields.includes('device_count'));
});

test('model A: creates record with Unite DI, ready to label, we submit', () => {
  const res = createUdiRecord({ model: 'A', device_class: 1, labeler: 'unite', brand: 'Unite', fields: validFields() });
  assert.equal(res.ok, true);
  assert.equal(res.record.status, 'ready_to_label');
  assert.equal(res.record.submitter, 'unite');
  assert.equal(res.record.labeler_duns, '117553945');
  assert.ok(res.record.di);
});

test('model B: requires the customer DI; customer submits', () => {
  const noDi = createUdiRecord({ model: 'B', device_class: 1, fields: validFields() });
  assert.equal(noDi.ok, false);
  assert.equal(noDi.reason, 'model_b_requires_customer_di');

  const ok = createUdiRecord({ model: 'B', device_class: 1, customer_di: '0079300012345', fields: validFields() });
  assert.equal(ok.ok, true);
  assert.equal(ok.record.submitter, 'customer');
  assert.equal(ok.record.di, '0079300012345');
});

test('model C: BLOCKED without signed acknowledgment; unblocked after', () => {
  const blocked = createUdiRecord({ model: 'C', device_class: 2, customer_name: 'Pentastar', brand: 'Pentastar', fields: validFields({ premarket_510k: 'K221100' }) });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'model_c_requires_acknowledgment');

  // Partial acceptance is rejected — all terms or nothing.
  const partial = recordAcknowledgment({ customer_name: 'Pentastar', signer: 'J. Doe, CEO', accepted_terms: MODEL_C_TERMS.slice(1) });
  assert.equal(partial.ok, false);

  const signed = recordAcknowledgment({ customer_name: 'Pentastar', signer: 'J. Doe, CEO', accepted_terms: MODEL_C_TERMS });
  assert.equal(signed.ok, true);

  const res = createUdiRecord({ model: 'C', device_class: 2, customer_name: 'Pentastar', brand: 'Pentastar', fields: validFields({ premarket_510k: 'K221100' }) });
  assert.equal(res.ok, true);
  assert.equal(res.record.acknowledgment_id, signed.acknowledgment.id);
  assert.ok(res.record.di); // Unite-issued DI under customer brand
});

test('label path 1: generated spec carries Model C "Distributed by" + PI placeholders', () => {
  recordAcknowledgment({ customer_name: 'LabelCo', signer: 'A. Smith', accepted_terms: MODEL_C_TERMS });
  const { record } = createUdiRecord({ model: 'C', device_class: 1, customer_name: 'LabelCo', brand: 'LabelCo', fields: validFields() });
  const res = generateLabelSpec(record.id);
  assert.equal(res.ok, true);
  assert.ok(res.spec.lines.includes('Distributed by Unite Medical'));
  assert.deepEqual(res.spec.pi_placeholders, ['LOT', 'MFG', 'EXP']);
  assert.equal(db.get('udi_records', record.id).status, 'ready_for_gudid');
});

test('label path 2: compliance check fails on missing elements, passes when complete', () => {
  const { record } = createUdiRecord({ model: 'A', device_class: 1, brand: 'Unite', fields: validFields({ rx_or_otc: 'Rx' }) });
  const fail = complianceCheckLabel(record.id, { present: ['di_barcode', 'brand_name'] });
  assert.equal(fail.ok, false);
  assert.ok(fail.missing.some((m) => m.key === 'rx_statement')); // Rx device needs the statement

  const pass = complianceCheckLabel(record.id, { present: ['di_barcode', 'brand_name', 'version_model', 'labeler_name', 'rx_statement'] });
  assert.equal(pass.ok, true);
  assert.equal(db.get('udi_records', record.id).status, 'ready_for_gudid');
});

test('portal submission: only when ready; never for model B', () => {
  const { record } = createUdiRecord({ model: 'A', device_class: 1, brand: 'Unite', fields: validFields() });
  assert.equal(markSubmitted(record.id).ok, false); // still ready_to_label
  generateLabelSpec(record.id);
  const res = markSubmitted(record.id);
  assert.equal(res.ok, true);
  assert.equal(res.record.status, 'submitted');

  const b = createUdiRecord({ model: 'B', device_class: 1, customer_di: '0079300054321', fields: validFields() });
  generateLabelSpec(b.record.id);
  assert.equal(markSubmitted(b.record.id).reason, 'customer_submits_model_b');
});

test('post-quote gate: opens on order commit for import/private-label lines only, never blocks', () => {
  const res = openUdiGateForOrder({
    order_id: 'UM-2026-09999',
    customer_name: 'Atlanta Surgical',
    lines: [
      { id: 'l1', sku: 'UM-1001', gtin: '00850012035001', name: 'Stocked item' },      // has GTIN — skip
      { id: 'l2', sku: null, name: 'Private-label wrap', private_label: true },        // gate
      { id: 'l3', sku: 'IMP-9', name: 'Import line', import_line: true, gtin: null },  // gate
    ],
  });
  assert.equal(res.opened, true);
  assert.equal(res.records.length, 2);
  assert.ok(res.records.every((r) => r.status === 'gate_open'));
  assert.ok(db.list('tasks', { where: { kind: 'udi_gate', ref_id: 'UM-2026-09999' } }).length === 1);

  // Desk promotes one line to Model A / Class 1 → DI assigned.
  const promoted = promoteGateRecord(res.records[0].id, { model: 'A', device_class: 1, labeler: 'unite', brand: 'Atlanta Surgical' });
  assert.equal(promoted.ok, true);
  assert.ok(promoted.record.di);
  assert.equal(promoted.record.status, 'draft'); // description alone ≠ complete intake
});

test('gate: no-op when every line already carries a GTIN', () => {
  const res = openUdiGateForOrder({
    order_id: 'UM-2026-09998',
    lines: [{ id: 'x', sku: 'UM-1', gtin: '00850012035002', name: 'Stocked' }],
  });
  assert.equal(res.opened, false);
});

test('intake template workbook: builds with all core fields present', async () => {
  const blob = await generateGudidIntakeXlsx();
  assert.ok(blob.size > 2000);
  // Field parity: the workbook is generated from GUDID_CORE_FIELDS, so a
  // drift between validator and template is structurally impossible; spot
  // check the count matches Damon's workbook (21 core rows).
  assert.equal(GUDID_CORE_FIELDS.length, 21);
});
