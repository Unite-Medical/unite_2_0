import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const findings = [];

async function filesUnder(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(full));
    else out.push(full);
  }
  return out;
}
function record(kind, file, detail) {
  findings.push({ kind, file: path.relative(ROOT, file), detail });
}
function parseEnv(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    rows.push([key, value]);
  }
  return rows;
}

const files = await filesUnder(DIST);
const texts = new Map();
for (const file of files) {
  if (/\.(?:html|js|json|map|txt|css)$/i.test(file)) texts.set(file, await fs.readFile(file, 'utf8'));
}

const sourceMaps = files.filter((file) => file.endsWith('.map'));
for (const file of sourceMaps) record('source_map', file, 'production source map present');

const secretCandidates = new Map();
for (const [key, value] of Object.entries(process.env)) {
  if (/(?:KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|CREDENTIAL|PRIVATE)/i.test(key) && String(value || '').length >= 8) {
    secretCandidates.set(key, String(value));
  }
}
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local', '.vercel/.env.development.local']) {
  try {
    const rows = parseEnv(await fs.readFile(path.join(ROOT, name), 'utf8'));
    for (const [key, value] of rows) {
      if (value.length >= 8 && !/^(?:changeme|example|placeholder|your[_-]|\[)/i.test(value)) secretCandidates.set(`${name}:${key}`, value);
    }
  } catch { /* absent file */ }
}
for (const [key, value] of secretCandidates) {
  for (const [file, text] of texts) {
    if (text.includes(value)) record('environment_value', file, key);
  }
}

const credentialPatterns = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['live_secret_key', /\b(?:sk|rk)_live_[A-Za-z0-9]{12,}\b/g],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['database_url', /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/gi],
  ['jwt_like_token', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\b/g],
];
for (const [file, text] of texts) {
  for (const [kind, pattern] of credentialPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) record(kind, file, 'credential-shaped value');
  }
}

const protectedMarkers = [
  /org_atlsurgical/gi,
  /sarah@atlanta-surgical\.com/gi,
  /org_holloway/gi,
  /kareem@holloway\.com/gi,
  /SECRET-CUSTOMER-PO/gi,
  /VITE_DB_SYNC_TOKEN/gi,
  /customerio_webhook_secret/gi,
];
for (const [file, text] of texts) {
  for (const pattern of protectedMarkers) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) record('protected_record_marker', file, pattern.source);
  }
}

const productHtml = [...texts].filter(([file]) => file.includes(`${path.sep}dist${path.sep}products${path.sep}`) && file.endsWith('index.html'));
for (const [file, html] of productHtml) {
  if (/\$\s*\d|USD\s*\d|"offers"\s*:|"price"\s*:/i.test(html)) record('public_product_price', file, 'price or offer marker');
  if (/stock by warehouse|reorder at|qty_remaining|on_hand|RNO|DAL/i.test(html)) record('public_operational_data', file, 'warehouse or stock marker');
}

for (const [file, text] of texts) {
  if (/"offers"\s*:\s*\{|"@type"\s*:\s*"Offer"/i.test(text) && file.endsWith('.html')) {
    record('jsonld_offer', file, 'offer schema in prerendered HTML');
  }
  if (/"(?:cogs|landed_cost|unit_cost|internal_cost|tooling_cost)"\s*:\s*-?\d/i.test(text)) {
    record('serialized_internal_cost', file, 'numeric internal cost record');
  }
  if (/"(?:customer_po|po_number)"\s*:\s*"[^"\s][^"]*"/i.test(text)) {
    record('serialized_customer_po', file, 'customer PO record');
  }
}

const summary = {
  ok: findings.length === 0,
  files_scanned: texts.size,
  product_pages_scanned: productHtml.length,
  secret_candidates_compared: secretCandidates.size,
  source_maps: sourceMaps.length,
  findings,
};
const outDir = path.join(ROOT, 'artifacts', 'security');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'production-confidentiality.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ ...summary, findings: findings.slice(0, 25) }, null, 2));
if (findings.length) process.exitCode = 1;
