/**
 * GUDID intake template generator — mirrors Damon's
 * GUDID_Intake_Templates_Class1_Class2.xlsx (three tabs: Class 1
 * minimum, Class 2 full, How to Use), built from the same field set
 * that `validateIntake` enforces so the sheet and the validator can
 * never drift apart.
 */

import { writeXlsx, downloadBlob } from './xlsxWrite.js';
import { GUDID_CORE_FIELDS, FIELD_510K, LABELERS } from './gudid.js';

const NOTES = {
  device_count: 'integer',
  distribution_status: 'In Distribution / Not in Distribution',
  fda_product_code: '3-letter, e.g. KGN',
  gmdn_term: 'Global device nomenclature term/code',
  mri_safety: 'Safe / Conditional / Unsafe / Labeled: no info',
  sterile: 'Y/N',
  sterilization_method: 'e.g. EO, Gamma, Steam (if sterile)',
  requires_sterilization: 'Y/N',
  rx_or_otc: 'Rx / OTC',
  single_use: 'Y/N',
  kit: 'Y/N',
  combination_product: 'Y/N',
  contains_nrl: 'Y/N',
  pi_has_lot: 'Y/N — flag only; value at production',
  pi_has_serial: 'Y/N — flag only',
  pi_has_mfg_date: 'Y/N — flag only',
  pi_has_expiry: 'Y/N — flag only',
};

function classSheet(deviceClass) {
  const title = `GUDID Intake Template — Class ${deviceClass}`;
  const subtitle = deviceClass === 1
    ? "Class 1 (minimum): core identity fields. 510(k) field = 'Exempt' for most Class 1."
    : 'Class 2 (full): all core fields PLUS a real 510(k)/premarket number + full sterilization/GMDN/MRI detail.';

  const rows = [
    [{ v: title, s: 'title' }],
    [{ v: subtitle, s: 'subtle' }],
    [
      { v: 'GUDID Field', s: 'headerReq' },
      { v: 'Required', s: 'headerReq' },
      { v: 'Value (fill in)', s: 'headerReq' },
      { v: 'Notes', s: 'headerReq' },
    ],
    ['Primary DI', 'Required', '', 'Assigned by Unite from GS1 prefix (or customer DI for model B)'],
    ['Labeler DUNS', 'Required', '', `Unite ${LABELERS.unite.duns} / Medava ${LABELERS.medava.duns} / customer`],
    ...GUDID_CORE_FIELDS.map((f) => [f.label, 'Required', '', NOTES[f.key] || '']),
    [
      FIELD_510K.label,
      deviceClass === 2 ? 'Required' : "Enter 'Exempt'",
      '',
      "K-number (Class 1: enter 'Exempt')",
    ],
  ];
  return {
    name: `Class ${deviceClass} (${deviceClass === 1 ? 'Minimum' : 'Full'})`,
    cols: [{ width: 38 }, { width: 14 }, { width: 28 }, { width: 56 }],
    rows,
    freezeHeader: false,
  };
}

function howToUseSheet() {
  const lines = [
    'GUDID INTAKE TEMPLATES — Unite Medical / Medava',
    'PURPOSE: capture the DI-level GUDID data required to register a device with FDA.',
    'Class 1 tab = minimum fields (most Class 1 devices are 510(k)-exempt).',
    'Class 2 tab = full fields incl. a real 510(k)/premarket number.',
    'LABELER MODELS:',
    '  A) Unite/Medava brand -> Unite/Medava DI + Unite/Medava submits GUDID.',
    '  B) Customer brand, customer has GS1 -> their DI + THEY submit GUDID.',
    "  C) Customer brand, no GS1 -> Unite issues DI + 'Distributed by Unite Medical' as labeler of record (paid service; signed acknowledgment required).",
    'PI DATA (lot #, serial #, mfg date, expiration): NOT entered here. These are captured per',
    'production run at the labeling/production stage. Here you only flag Y/N whether each applies.',
    'DI: assigned by Unite from a medical-flagged GS1 prefix. Do not use a non-medical prefix for devices.',
  ];
  return {
    name: 'How to Use',
    cols: [{ width: 110 }],
    rows: lines.map((l, i) => [{ v: l, s: i === 0 ? 'title' : 'default' }]),
  };
}

/** Build the workbook Blob (Class 1 + Class 2 + How to Use). */
export async function generateGudidIntakeXlsx() {
  return writeXlsx({ sheets: [classSheet(1), classSheet(2), howToUseSheet()] });
}

/** Browser download helper. */
export async function downloadGudidIntakeTemplate() {
  const blob = await generateGudidIntakeXlsx();
  downloadBlob(blob, 'Unite_GUDID_Intake_Templates_Class1_Class2.xlsx');
}
