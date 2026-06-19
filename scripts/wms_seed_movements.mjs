#!/usr/bin/env node
/**
 * PRD-25 Phase 0 — ledger backfill + verifier snapshot export.
 *
 *   node scripts/wms_seed_movements.mjs [--out tmp/wms_snapshot.json]
 *
 * Boots the in-memory store (seeded demo state), posts one `opening_count`
 * movement per current inventory.on_hand via the ledger so that
 * `on_hand == SUM(stock_movements.qty_delta)` for every (sku, warehouse),
 * then writes a JSON snapshot of { inventory, stock_movements } that
 * scripts/wms_check.py asserts the ledger invariant against.
 *
 * Idempotent: re-running skips SKUs that already have an opening movement.
 * In production the same `seedOpeningBalances()` runs against the durable
 * store; here we run it in-process and export a snapshot for CI.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/lib/db.js';
import { ledger } from '../src/lib/wms/ledger.js';
import { availability } from '../src/lib/wms/availability.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function outPath() {
  const i = process.argv.indexOf('--out');
  const rel = i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : 'tmp/wms_snapshot.json';
  return path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
}

async function main() {
  const invBefore = db.list('inventory');
  console.log(`Inventory rows: ${invBefore.length} (across ${new Set(invBefore.map((r) => r.warehouse_id)).size} warehouses)`);

  const res = ledger.seedOpeningBalances({ actor_id: 'phase0_backfill' });
  console.log(`Opening balances — seeded: ${res.seeded}, skipped(existing): ${res.skipped}, projection rows rebuilt: ${res.rebuilt}`);

  // In-process invariant check (the Python verifier re-checks the snapshot).
  let mismatches = 0;
  const seen = new Set();
  for (const inv of db.list('inventory')) {
    const key = `${inv.sku}|${inv.warehouse_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const projected = Number(inv.on_hand) || 0;
    const fromLedger = availability.ledgerOnHand(inv.sku, inv.warehouse_id);
    if (projected !== fromLedger) {
      mismatches += 1;
      if (mismatches <= 10) console.error(`  ✗ ${key}: on_hand=${projected} != SUM(movements)=${fromLedger}`);
    }
  }

  const snapshot = {
    generated_at: new Date().toISOString(),
    tables: {
      inventory: db.list('inventory'),
      stock_movements: db.list('stock_movements'),
    },
  };
  const file = outPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(snapshot, null, 2));
  console.log(`Snapshot → ${path.relative(ROOT, file)} (${snapshot.tables.stock_movements.length} movements)`);

  if (mismatches > 0) {
    console.error(`\nFAIL — ${mismatches} (sku, warehouse) projections diverge from the ledger.`);
    process.exit(1);
  }
  console.log('\nOK — on_hand == SUM(movements) for every (sku, warehouse).');
}

main().catch((err) => { console.error(err); process.exit(1); });
