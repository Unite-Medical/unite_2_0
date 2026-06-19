#!/usr/bin/env node
/**
 * Runtime verifier for the orchestration PRDs:
 *   PRD-17 (PDF documents), PRD-20 (webhook bus),
 *   PRD-22 (multi-currency), PRD-24 (fulfillment),
 *   PRD-16/19 (quote acceptance + multi-vendor compare).
 *
 * Exercises the actual modules (not mocks) against the in-memory DB and
 * the deterministic AI/service stubs. Run:  node scripts/verify_orchestration.mjs
 *
 * Exit 0 = all checks pass, 1 = at least one failed.
 */

import { createPdf } from '../src/lib/pdf.js';
import { buildQuotePdf } from '../src/lib/documents.js';
import { convert, normalizeCurrency } from '../src/lib/external/exchangeRates.js';
import { parseVendorSheetText, convertLineCurrencies } from '../src/lib/vendorSheet.js';
import { recordEvent, processEvent, replayEvent, MAX_ATTEMPTS, busStats } from '../src/lib/webhookBus.js';
import { runFulfillment, createReturn, PIPELINE_STEPS } from '../src/lib/fulfillment.js';
import { compareVendorOffers } from '../src/lib/quoting.js';
import { acceptQuote } from '../src/lib/quoteAcceptance.js';
import { buildSelfServeQuote, requestSourcing } from '../src/lib/selfServeQuote.js';
import { inviteTeammate, updateMemberRole, removeMember, listTeam } from '../src/lib/team.js';
import { mailer } from '../src/lib/mailer.js';
import { db } from '../src/lib/db.js';
import { uid } from '../src/lib/format.js';
import { ledger } from '../src/lib/wms/ledger.js';
import { availability } from '../src/lib/wms/availability.js';
import { reservations } from '../src/lib/wms/reservations.js';
import { purchaseOrders } from '../src/lib/wms/purchaseOrders.js';
import { lots as lotsApi } from '../src/lib/wms/lots.js';
import { shipping } from '../src/lib/wms/shipping.js';
import { picking } from '../src/lib/wms/picking.js';
import { transfers } from '../src/lib/wms/transfers.js';
import { counts } from '../src/lib/wms/counts.js';
import { adjustments } from '../src/lib/wms/adjustments.js';
import { bundles } from '../src/lib/wms/bundles.js';

let pass = 0; let fail = 0;
const ok = (cond, msg) => { if (cond) { pass += 1; } else { fail += 1; console.error('  ✗', msg); } };
const section = (s) => console.log(`\n${s}`);

// ── PRD-17: PDF documents ──────────────────────────────────────────────────
section('PRD-17 · PDF documents');
{
  const doc = createPdf();
  doc.text(54, 54, 'Test (with parens) & symbols', { size: 14, bold: true });
  doc.addPage();
  doc.text(54, 54, 'Page two');
  const bytes = doc.toBytes();
  const text = new TextDecoder().decode(bytes);
  ok(text.startsWith('%PDF-1.4'), 'PDF has 1.4 header');
  ok(text.includes('%%EOF'), 'PDF has EOF');
  ok(text.includes('/Count 2'), 'PDF reports 2 pages');

  const quote = { id: 'Q-TEST-1', customer_name: 'Verifier Health', total: 1234.5, created_at: new Date().toISOString(), valid_until: new Date(Date.now() + 7 * 864e5).toISOString() };
  const items = [{ name: 'Nitrile gloves', hts: '4015.19', target_qty: 1000, sell_per_unit: 0.12, ext_sell: 120, landed_per_unit: 0.08 }];
  const blob = buildQuotePdf(quote, items, { view: 'customer' });
  ok(blob && blob.size > 500, `quote PDF blob built (${blob?.size} bytes)`);
}

// ── PRD-22: multi-currency ──────────────────────────────────────────────────
section('PRD-22 · multi-currency');
{
  ok(normalizeCurrency('¥') === 'CNY', 'symbol ¥ → CNY');
  ok(normalizeCurrency('RMB') === 'CNY', 'alias RMB → CNY');
  const c = await convert(100, 'CNY', 'USD');
  ok(c.amount > 10 && c.amount < 18, `100 CNY → ${c.amount} USD`);
  const csv = 'product,price,currency,qty\nGloves,¥8.50,CNY,1000\nGauze,2.10,USD,500\n';
  const parsed = parseVendorSheetText({ text: csv });
  ok(parsed.lines[0].fob_currency === 'CNY', 'row currency detected');
  const conv = await convertLineCurrencies(parsed.lines);
  ok(conv.converted === 1, 'one line converted to USD');
  ok(parsed.lines[0].converted && parsed.lines[0].fob < 8.5, 'CNY price normalized down to USD');
}

// ── PRD-20: webhook bus ─────────────────────────────────────────────────────
section('PRD-20 · webhook bus');
{
  const before = busStats().total;
  const evt = { source: 'stripe', type: 'invoice.paid', id: `evt_${uid('x')}`, payload: { id: 'evt_x', type: 'invoice.paid' } };
  const r1 = recordEvent(evt);
  const r2 = recordEvent(evt);
  ok(!r1.duplicate && r2.duplicate, 'duplicate events deduped by id');
  ok(busStats().total === before + 1, 'only one row recorded for dup');

  // Unknown source → dispatch throws → retries → dead-letter after MAX_ATTEMPTS
  const bad = recordEvent({ source: 'made_up', type: 'x', id: `bad_${uid('x')}`, payload: {} }).row;
  for (let i = 0; i < MAX_ATTEMPTS; i++) await processEvent(bad.id);
  const deadRow = db.get('webhook_events', bad.id);
  ok(deadRow.status === 'dead', `exhausted event dead-lettered (status=${deadRow.status})`);
  ok(deadRow.attempts === MAX_ATTEMPTS, `attempts capped at ${MAX_ATTEMPTS}`);
  await replayEvent(bad.id);
  ok(db.get('webhook_events', bad.id).attempts >= 1, 'replay resets + reprocesses');
}

// ── PRD-24: fulfillment orchestrator ────────────────────────────────────────
section('PRD-24 · fulfillment');
{
  // Build a synthetic order with one in-stock SKU and one short SKU.
  const sku = db.list('inventory')[0]?.sku || 'SKU-1';
  const orderId = `UM-TEST-${db.count('orders')}`;
  db.insert('orders', { id: orderId, customer_id: 'org_test', customer_name: 'Verifier Health', total: 500, payment_method: 'ach', payment_terms: 'net30', payment_status: 'invoiced', status: 'processing', segment: 'asc' });
  db.insert('order_items', { id: uid('oi'), order_id: orderId, sku, name: 'In-stock item', qty: 1, unit_price: 100, ext_price: 100 });
  db.insert('order_items', { id: uid('oi'), order_id: orderId, sku: 'SKU-NONEXISTENT', name: 'Short item', qty: 999999, unit_price: 1, ext_price: 999999 });

  const res = await runFulfillment(orderId);
  const steps = db.list('fulfillment_pipeline', { where: { order_id: orderId } });
  ok(steps.length === PIPELINE_STEPS.length, `all ${PIPELINE_STEPS.length} pipeline steps recorded`);
  ok(steps.find((s) => s.step === 'validate')?.status === 'completed', 'validate completed');
  ok(res.backorders.length >= 1, 'shortfall created a backorder');
  ok(db.list('shipments', { where: { order_id: orderId } }).length >= 1, 'shipment created');
  ok(db.list('documents', { where: { document_type: 'packing_slip', ref_id: orderId } }).length >= 1, 'packing slip document generated');

  // Idempotent re-run: completed steps skip.
  const res2 = await runFulfillment(orderId);
  ok(res2.steps.length === PIPELINE_STEPS.length, 're-run keeps step count stable (idempotent)');

  // Returns
  const rma = await createReturn(orderId, [{ sku, qty: 1, unit_price: 100 }]);
  ok(rma.status === 'refunded', `return processed (${rma.status})`);
}

// ── PRD-16/19: quote acceptance + compare ──────────────────────────────────
section('PRD-16/19 · acceptance + compare');
{
  const token = `tok_${uid('x')}`;
  const qid = `Q-TEST-${db.count('quotes')}`;
  db.insert('quotes', { id: qid, customer_name: 'Verifier Health', total: 240, status: 'draft', acceptance_token: token, valid_until: new Date(Date.now() + 7 * 864e5).toISOString() });
  db.insert('quote_items', { id: `${qid}-li-0`, quote_id: qid, name: 'Gauze', target_qty: 1000, sell_per_unit: 0.24, ext_sell: 240 });
  const acc = await acceptQuote(token, { runPipeline: false });
  ok(acc.ok && acc.order, 'quote accepted → order created');
  ok(db.get('quotes', qid).status === 'accepted', 'quote marked accepted');
  const again = await acceptQuote(token);
  ok(again.alreadyAccepted, 'second acceptance is idempotent');

  const cmp = compareVendorOffers([
    { vendor: 'A', lines: [{ name: 'Gloves', landed_per_unit: 0.10 }] },
    { vendor: 'B', lines: [{ name: 'Gloves', landed_per_unit: 0.08 }] },
  ]);
  ok(cmp.products[0].best_vendor === 'B', 'cheapest vendor selected');
  ok(cmp.total_savings > 0, 'savings computed');
}

// ── PRD-19: self-serve quoting ─────────────────────────────────────────────
section('PRD-19 · self-serve quoting');
{
  const sku = db.list('products')[0]?.sku;
  ok(Boolean(sku), 'catalog has products to quote');
  const res = buildSelfServeQuote({ items: [{ sku, qty: 100 }], org: { id: 'org_atlsurgical', name: 'Atlanta Surgical Center', tier: 'A' } });
  ok(res.ok && res.quote, 'self-serve quote built');
  ok(res.quote.acceptance_token && res.quote.source === 'self_serve', 'quote has acceptance token + source');
  ok(res.lines[0].sell_per_unit > 0 && res.lines[0].ext_sell > 0, 'line priced via tier engine');
  const acc = await acceptQuote(res.quote.acceptance_token);
  ok(acc.ok, 'self-serve quote is acceptable end-to-end');
  const src = requestSourcing({ description: '5000 nitrile gloves size L', org: { id: 'org_x', name: 'X' } });
  ok(src.ok && src.lead, 'sourcing request captured as lead');
}

// ── PRD-14: team management ────────────────────────────────────────────────
section('PRD-14 · team management');
{
  const orgId = 'org_atlsurgical';
  const before = listTeam(orgId).length;
  const inv = inviteTeammate({ orgId, email: `teammate_${uid('x')}@atlanta-surgical.com`, name: 'New Buyer', org_role: 'buyer' });
  ok(inv.ok && inv.profile.status === 'invited', 'teammate invited (pending)');
  ok(listTeam(orgId).length === before + 1, 'team list grew by one');
  ok(updateMemberRole(inv.profile.id, 'viewer').profile.org_role === 'viewer', 'member role updated');
  ok(inviteTeammate({ orgId, email: 'not-an-email', name: 'x' }).reason === 'bad_email', 'bad email rejected');
  ok(removeMember(inv.profile.id).ok && listTeam(orgId).length === before, 'member removed');
}

// ── PRD-05: email provider chain (Resend → Gmail → outbox) ──────────────────
section('PRD-05 · mailer');
{
  // No proxy in Node → falls through to the durable outbox queue.
  const row = await mailer.send({ to: 'buyer@example.com', subject: 'Test', body: 'Hello', template_key: 'verify/test' });
  ok(row && row.subject === 'Test', 'mailer returns a mirrored outbox row');
  ok(row.status === 'queued' && row.provider === 'outbox', 'queues when no provider configured (nothing lost)');
  ok(db.list('gmail_outbox', { where: { id: row.id } }).length === 1, 'message persisted to unified outbox');
}

// ── PRD-25: UniteWMS ledger + reservations ──────────────────────────────────
section('PRD-25 · WMS ledger + reservations');
{
  // Backfill opening balances so on_hand == SUM(movements), then assert it.
  ledger.seedOpeningBalances({ actor_id: 'verifier' });
  const sample = db.list('inventory').slice(0, 50);
  const invariantOk = sample.every((r) => availability.ledgerOnHand(r.sku, r.warehouse_id) === (Number(r.on_hand) || 0));
  ok(invariantOk, 'ledger invariant: on_hand == SUM(qty_delta) after backfill');

  // Idempotency: re-posting the same key is a no-op.
  const sku0 = sample[0].sku; const wh0 = sample[0].warehouse_id;
  const before = availability.onHand(sku0, wh0);
  ledger.post({ sku: sku0, warehouse_id: wh0, qty_delta: 5, reason: 'receipt', idempotency_key: 'verif_idem_1' });
  ledger.post({ sku: sku0, warehouse_id: wh0, qty_delta: 5, reason: 'receipt', idempotency_key: 'verif_idem_1' });
  ok(availability.onHand(sku0, wh0) === before + 5, 'idempotency-key replay is a no-op');

  // Concurrency gate: two orders for the LAST unit — exactly one wins.
  const lastSku = `WMS-LAST-${uid('x')}`;
  db.insert('products', { id: lastSku, sku: lastSku, name: 'Single-unit test', price: 1, cogs: 0.5 });
  ledger.post({ sku: lastSku, warehouse_id: 'wh_atl', qty_delta: 1, reason: 'receipt', idempotency_key: `seed_${lastSku}` });
  const r1 = reservations.reserve({ id: `O1_${lastSku}`, items: [{ sku: lastSku, qty: 1 }] });
  const r2 = reservations.reserve({ id: `O2_${lastSku}`, items: [{ sku: lastSku, qty: 1 }] });
  const won = [r1, r2].filter((r) => r.shortfall === 0).length;
  ok(won === 1, `exactly one order reserved the last unit (won=${won})`);
  ok(availability.availableToPromise(lastSku, 'wh_atl') === 0, 'available-to-promise is 0 after the unit is held');
  ok(availability.onHand(lastSku, 'wh_atl') === 1, 'on_hand unchanged by a hold (reserve != consume)');

  // Commit the winner → on_hand drops via a ship movement; release the loser.
  const winnerId = r1.shortfall === 0 ? `O1_${lastSku}` : `O2_${lastSku}`;
  const loserId = r1.shortfall === 0 ? `O2_${lastSku}` : `O1_${lastSku}`;
  reservations.commit(winnerId, { actor_id: 'verifier' });
  reservations.release(loserId);
  ok(availability.onHand(lastSku, 'wh_atl') === 0, 'commit posted a ship movement → on_hand == 0');
  ok(availability.reserved(lastSku, 'wh_atl') === 0, 'reserved freed after commit + release');
  ok(availability.ledgerOnHand(lastSku, 'wh_atl') === 0, 'ledger invariant holds through the ship');
}

// ── PRD-25 Phase 2: purchase orders + receiving + lots ──────────────────────
section('PRD-25 · PO receiving + lots (FEFO)');
{
  const sku = `WMS-PO-${uid('x')}`;
  db.insert('products', { id: sku, sku, name: 'PO receive test', price: 2, cogs: 1 });
  const po = purchaseOrders.create({ vendor_name: 'Test Vendor', line_items: [{ sku, name: 'PO receive test', qty: 100, cost: 1 }], warehouse_id: 'wh_atl' });
  ok(po.status === 'draft', 'PO created in draft');
  ok(purchaseOrders.approve(po.id).ok, 'PO approved');
  await purchaseOrders.send(po.id);
  ok(db.get('purchase_orders', po.id).status === 'sent', 'PO sent');

  const onHandBefore = availability.onHand(sku, 'wh_atl');
  // Partial receipt with a lot + expiry.
  const r1 = await purchaseOrders.receive(po.id, [{ sku, qty: 40, lot_number: 'LOTA', expiration_date: '2027-01-01', unit_cost: 1 }], { warehouse_id: 'wh_atl' });
  ok(r1.status === 'partial', `partial receipt leaves PO partial (got ${r1.status})`);
  ok(availability.onHand(sku, 'wh_atl') === onHandBefore + 40, 'on_hand += 40 via ledger receipt');

  // Idempotent replay of the same receipt is a no-op.
  const dup = await purchaseOrders.receive(po.id, [{ sku, qty: 40, lot_number: 'LOTA', expiration_date: '2027-01-01', unit_cost: 1, idempotency_key: r1.lots[0] ? `po_recv:${po.id}:${sku}:LOTA:40` : undefined }]);
  ok(availability.onHand(sku, 'wh_atl') === onHandBefore + 40, 'replayed receipt did not double on_hand');
  void dup;

  // Finish the PO with a second, earlier-expiring lot.
  const r2 = await purchaseOrders.receive(po.id, [{ sku, qty: 60, lot_number: 'LOTB', expiration_date: '2026-09-01', unit_cost: 1 }], { warehouse_id: 'wh_atl' });
  ok(r2.status === 'received', 'full receipt → PO received');
  const line = db.get('purchase_orders', po.id).line_items[0];
  ok(line.received_qty === 100, 'line.received_qty == 100 (PO math)');

  // Lot conservation: qty_remaining sums to the lot-movement total.
  const lotRows = db.list('lots', { where: { product_sku: sku, warehouse_id: 'wh_atl' } });
  const remaining = lotRows.reduce((a, l) => a + l.qty_remaining, 0);
  ok(remaining === 100, `lots hold all 100 units (got ${remaining})`);

  // FEFO: earliest-expiry lot (LOTB, 2026-09) is consumed first.
  const pick = lotsApi.pickFEFO(sku, 'wh_atl', 50);
  ok(pick.allocations[0].lot_number === 'LOTB', 'FEFO picks the earliest-expiry lot first');
  ok(pick.shortfall === 0, 'FEFO satisfied the pick');
}

// ── PRD-25 Phase 3: pick / ship FEFO + recall genealogy ─────────────────────
section('PRD-25 · ship FEFO + recall (<1s)');
{
  const sku = `WMS-SHIP-${uid('x')}`;
  db.insert('products', { id: sku, sku, name: 'Ship FEFO test', price: 5, cogs: 2 });
  // Two lots: LATER (expires 2028) received first, SOONER (expires 2026) second.
  lotsApi.receiveLot({ sku, lot_number: 'LATER', expiration_date: '2028-01-01', warehouse_id: 'wh_atl', qty: 30, ref_id: 'seed', idempotency_key: `r1_${sku}` });
  lotsApi.receiveLot({ sku, lot_number: 'SOONER', expiration_date: '2026-03-01', warehouse_id: 'wh_atl', qty: 30, ref_id: 'seed', idempotency_key: `r2_${sku}` });

  const orderId = `UM-SHIP-${uid('x')}`;
  db.insert('orders', { id: orderId, customer_id: 'org_atlsurgical', customer_name: 'Recall Test ASC', status: 'processing', total: 100 });
  db.insert('order_items', { id: uid('oi'), order_id: orderId, sku, name: 'Ship FEFO test', qty: 40, unit_price: 5 });

  // Pick-list preview is FEFO (SOONER first).
  const plan = picking.buildPickList(orderId);
  ok(plan.lines[0].picks[0].lot_number === 'SOONER', 'pick list previews FEFO (earliest expiry first)');

  reservations.reserve({ id: orderId, items: [{ sku, qty: 40 }] });
  const onHandBefore = availability.onHand(sku, 'wh_atl');
  const ship = shipping.confirmShip(orderId);
  ok(availability.onHand(sku, 'wh_atl') === onHandBefore - 40, 'ship decremented on_hand by 40 via ledger');
  ok(availability.reserved(sku, 'wh_atl') === 0, 'reserved freed on ship');

  // FEFO: SOONER lot (30) fully consumed, LATER lot down to 20.
  const sooner = db.list('lots', { where: { product_sku: sku, lot_number: 'SOONER' } })[0];
  const later = db.list('lots', { where: { product_sku: sku, lot_number: 'LATER' } })[0];
  ok(sooner.qty_remaining === 0, 'earliest-expiry lot fully consumed first (FEFO)');
  ok(later.qty_remaining === 20, 'later lot only partially consumed');

  // Recall query returns the customer in < 1s.
  const t0 = performance.now();
  const recall = shipping.recall('SOONER');
  const ms = performance.now() - t0;
  ok(recall.length >= 1 && recall[0].customer_id === 'org_atlsurgical', 'recall returns the affected customer');
  ok(ms < 1000, `recall query < 1s (${ms.toFixed(2)}ms)`);

  // Idempotent re-ship is a no-op.
  const before = availability.onHand(sku, 'wh_atl');
  shipping.confirmShip(orderId);
  ok(availability.onHand(sku, 'wh_atl') === before, 're-confirming ship is idempotent');
  ok(availability.ledgerOnHand(sku, 'wh_atl') === availability.onHand(sku, 'wh_atl'), 'ledger invariant holds post-ship');
}

// ── PRD-25 Phase 4: transfers + counts + adjustments ────────────────────────
section('PRD-25 · transfers + cycle counts + adjustments');
{
  const sku = `WMS-X4-${uid('x')}`;
  db.insert('products', { id: sku, sku, name: 'Phase4 test', price: 3, cogs: 1 });
  ledger.post({ sku, warehouse_id: 'wh_atl', qty_delta: 100, reason: 'receipt', idempotency_key: `seed_${sku}` });

  // Transfer 40 ATL → RNO. Source on_hand drops on ship; dest rises on receive.
  const t = transfers.createTransfer({ from_wh: 'wh_atl', to_wh: 'wh_reno', lines: [{ sku, qty: 40 }] });
  ok(t.ok, 'transfer created');
  transfers.shipTransfer(t.transfer.id);
  ok(availability.onHand(sku, 'wh_atl') === 60, 'transfer ship dropped source on_hand to 60');
  ok(availability.onHand(sku, 'wh_reno') === 0, 'dest on_hand still 0 while in transit');
  transfers.receiveTransfer(t.transfer.id);
  ok(availability.onHand(sku, 'wh_reno') === 40, 'transfer receive landed 40 at destination');
  ok(availability.onHand(sku, 'wh_atl') + availability.onHand(sku, 'wh_reno') === 100, 'transfer conserved total units (60 + 40)');

  // Cycle count: physical count of 55 at ATL (system 60) → −5 variance posted.
  const c = counts.openCount({ warehouse_id: 'wh_atl', skus: [sku] });
  ok(c.ok, 'count session opened');
  counts.recordCount(c.session_id, sku, 55);
  const posted = counts.postCount(c.session_id);
  ok(posted.posted === 1 && posted.net_variance === -5, 'count posted a −5 variance movement');
  ok(availability.onHand(sku, 'wh_atl') === 55, 'on_hand reconciled to the physical count (55)');

  // Adjustment: damage 5 → on_hand 50; found 2 → 52.
  adjustments.damage(sku, 'wh_atl', 5, 'crushed carton');
  adjustments.found(sku, 'wh_atl', 2, 'misplaced units');
  ok(availability.onHand(sku, 'wh_atl') === 52, 'damage(−5) + found(+2) → on_hand 52');
  ok(availability.ledgerOnHand(sku, 'wh_atl') === 52, 'ledger invariant holds across count/adjust');

  // Idempotent count re-post is a no-op.
  const again = counts.postCount(c.session_id);
  ok(again.noop === true && availability.onHand(sku, 'wh_atl') === 52, 'closed count re-post is a no-op');
}

// ── PRD-25 Phase 5: bundles / kits ──────────────────────────────────────────
section('PRD-25 · bundles (kit explosion)');
{
  const a = `WMS-CMPA-${uid('x')}`;
  const b = `WMS-CMPB-${uid('x')}`;
  db.insert('products', { id: a, sku: a, name: 'Component A', price: 1, cogs: 0.5 });
  db.insert('products', { id: b, sku: b, name: 'Component B', price: 1, cogs: 0.5 });
  ledger.post({ sku: a, warehouse_id: 'wh_atl', qty_delta: 100, reason: 'receipt', idempotency_key: `seedA_${a}` });
  ledger.post({ sku: b, warehouse_id: 'wh_atl', qty_delta: 30, reason: 'receipt', idempotency_key: `seedB_${b}` });

  const kit = `KIT-${uid('x')}`;
  db.insert('bundles', { id: uid('bndl'), bundle_sku: kit, name: 'Test Kit', components: [{ sku: a, qty: 2 }, { sku: b, qty: 1 }] });

  // available = min(floor(100/2), floor(30/1)) = min(50, 30) = 30.
  ok(bundles.availableToPromise(kit) === 30, `kit ATP is the binding component (got ${bundles.availableToPromise(kit)})`);

  // Reserving 10 kits explodes to 20×A + 10×B.
  const orderId = `UM-KIT-${uid('x')}`;
  reservations.reserve({ id: orderId, items: [{ sku: kit, qty: 10 }] });
  ok(availability.reserved(a, 'wh_atl') === 20, 'kit reserve held 20 of component A (2×10)');
  ok(availability.reserved(b, 'wh_atl') === 10, 'kit reserve held 10 of component B (1×10)');
  ok(bundles.availableToPromise(kit) === 20, 'kit ATP dropped to 20 after holding 10 kits');

  reservations.release(orderId);
  ok(availability.reserved(a, 'wh_atl') === 0 && availability.reserved(b, 'wh_atl') === 0, 'releasing the kit freed both components');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
