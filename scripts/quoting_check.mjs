/**
 * PRD-16 quoting engine verifier — runs the real lib layer in Node,
 * mirroring scripts/smoke_e2e.mjs. Covers Phases 3–7:
 *   - engine run: tier auto-resolution from the org record
 *   - freight: LCL/FCL/AIR all compared + stored, preference honored
 *   - landed cost: per-line sum of the 6 stored components (±$0.01)
 *   - margin: tier target applied, 10% floor enforced
 *   - desk ops: margin override (+approval gate), freight switch, refresh
 *   - customer verbs: counter → desk apply (floor holds), decline, accept → order
 *
 * Run from the repo root: node scripts/quoting_check.mjs
 */
import { db } from '../src/lib/db.js';
import {
  runQuotingEngine, repriceQuote, approveQuoteMargin, refreshQuote,
  applyCounterOffers, selectFreightOption, resolveOrgTier, MARGIN_FLOOR,
} from '../src/lib/quoting.js';
import {
  findQuoteByToken, acceptQuote, counterQuote, declineQuote, requestRefresh,
} from '../src/lib/quoteAcceptance.js';
import { marginForTier, loadMarginPolicy } from '../src/lib/marginPolicy.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const LINES = [
  { name: 'Compression stockings 20-30mmHg', fob: 2.40, moq: 5000, hts: '6115.10', target_qty: 5000, fda_product_code: 'NHM', gtin: '00012345678905' },
  { name: 'Thermometer probes, disposable', fob: 0.08, moq: 25000, hts: '9025.19', target_qty: 25000, fda_product_code: 'KGN' },
  { name: 'N95 respirator, fluid-resistant', fob: 0.21, moq: 50000, hts: '6307.90', target_qty: 50000, fda_product_code: 'NHM' },
];

console.log('\n— TIER RESOLUTION (Phase 5) —');
const r1 = resolveOrgTier({ customer_name: 'Atlanta Surgical Center' });
ok('org matched by name', r1.resolved && r1.org?.id === 'org_atlsurgical');
ok('tier from org record', r1.tier === 'A', r1.tier);
const rGov = resolveOrgTier({ customer_name: 'VA Medical Center · Dublin' });
ok('MSPV terms → gov tier', rGov.tier === 'gov', rGov.tier);
const rMiss = resolveOrgTier({ customer_name: 'No Such Clinic', fallback_tier: 'B' });
ok('unknown customer falls back', !rMiss.resolved && rMiss.tier === 'B');

console.log('\n— ENGINE RUN (Phases 3–5) —');
const run = await runQuotingEngine({
  vendor: 'Verifier Manufacturer',
  customer_name: 'Atlanta Surgical Center',
  contact_name: 'QA Harness',
  lines: LINES.map((l) => ({ ...l })),
});
const q = run.quote;
ok('quote persisted', !!db.get('quotes', q.id), q.id);
ok('tier auto-resolved on quote', q.tier_resolved === true && q.customer_tier === 'A');
ok('margin = tier A target', Math.abs(q.margin_target - marginForTier('A', loadMarginPolicy())) < 1e-9, `${q.margin_target}`);
ok('3 freight modes stored', (q.freight_options || []).length === 3, (q.freight_options || []).map((o) => o.mode).join(','));
ok('AIR option present', (q.freight_options || []).some((o) => o.mode === 'AIR'));
ok('selected mode is cheapest', q.freight_total === Math.min(...q.freight_options.map((o) => o.total_usd)), `${q.freight_mode} $${q.freight_total}`);

const items = db.list('quote_items', { where: { quote_id: q.id } });
ok('all lines persisted', items.length === LINES.length);
const componentSum = items.every((it) => {
  const sum = Object.values(it.cost_components || {}).reduce((a, v) => a + Number(v), 0);
  return Math.abs(sum - it.landed_per_unit) <= 0.01;
});
ok('landed = Σ 6 components (±$0.01)', componentSum);
ok('6 components on every line', items.every((it) => Object.keys(it.cost_components || {}).length === 6));
ok('floor: sell ≥ landed × 1.10', items.every((it) => it.sell_per_unit >= +(it.landed_per_unit * (1 + MARGIN_FLOOR)).toFixed(2) - 0.01));
ok('compliance flags stored', items.every((it) => typeof it.fda_validated === 'boolean'));
ok('GTIN validated when present', items.find((it) => it.gtin)?.gtin_validated === true);

console.log('\n— FREIGHT PREFERENCE —');
const fastest = selectFreightOption(q.freight_options, 'fastest');
ok('fastest preference picks min transit', fastest.transit_days === Math.min(...q.freight_options.map((o) => o.transit_days)), `${fastest.mode} ${fastest.transit_days}d`);
const explicit = selectFreightOption(q.freight_options, 'AIR');
ok('explicit AIR honored', explicit.mode === 'AIR');

console.log('\n— DESK: MARGIN OVERRIDE + APPROVAL GATE (Phase 5) —');
const tierDefault = marginForTier('A', loadMarginPolicy());
const over = repriceQuote(q.id, { margin_pct: tierDefault + 0.05, actor: 'verifier' });
ok('override above default: no approval', over.ok && !over.quote.needs_approval);
const under = repriceQuote(q.id, { margin_pct: 0.15, actor: 'verifier', reason: 'strategic account' });
ok('override below default: needs approval', under.ok && under.quote.needs_approval === true);
ok('override repriced all lines', under.items.every((it) => Math.abs(it.margin_pct - 0.15) < 1e-9));
const appr = approveQuoteMargin(q.id, { approver: 'verifier-mgr' });
ok('manager approval clears gate', appr.ok && appr.quote.needs_approval === false);
const floorReject = repriceQuote(q.id, { margin_pct: 0.02 });
ok('override below floor clamped to floor', floorReject.ok && floorReject.items.every((it) => it.margin_pct >= MARGIN_FLOOR));
const audits = db.list('audit_log').filter((a) => a.ref_id === q.id && a.kind === 'quote.repriced');
ok('overrides audit-logged', audits.length >= 3, `${audits.length} entries`);

console.log('\n— DESK: FREIGHT SWITCH —');
const beforeTotal = db.get('quotes', q.id).total;
const sw = repriceQuote(q.id, { freight_mode: 'AIR', actor: 'verifier' });
ok('switch to AIR ok', sw.ok && sw.quote.freight_mode === 'AIR');
ok('switch repriced quote', sw.quote.total !== beforeTotal, `${beforeTotal} → ${sw.quote.total}`);
ok('unknown mode rejected', repriceQuote(q.id, { freight_mode: 'TRUCK' }).reason === 'unknown_freight_mode');

console.log('\n— CUSTOMER: COUNTER → DESK APPLY (Phase 7) —');
db.update('quotes', q.id, { status: 'sent' });
const token = db.get('quotes', q.id).acceptance_token;
const line0 = db.list('quote_items', { where: { quote_id: q.id } })[0];
const lowball = +(line0.landed_per_unit * 0.5).toFixed(2); // below floor on purpose
const ctr = counterQuote(token, { counters: [{ item_id: line0.id, price: lowball }], note: 'verifier counter' });
ok('counter recorded', ctr.ok && ctr.quote.status === 'countered');
ok('counter task queued', db.list('tasks').some((t) => t.kind === 'quote_counter' && t.ref_id === q.id));
const applied = applyCounterOffers(q.id, { actor: 'verifier' });
ok('counter applied at desk', applied.ok && applied.quote.status === 'sent');
ok('floor held against lowball', applied.floored === 1, `${applied.floored} floored`);
const line0After = db.get('quote_items', line0.id);
ok('countered line = floor price', Math.abs(line0After.sell_per_unit - +(line0After.landed_per_unit * (1 + MARGIN_FLOOR)).toFixed(2)) < 0.011);

console.log('\n— CUSTOMER: EXPIRY → REFRESH (Phase 7) —');
db.update('quotes', q.id, { valid_until: new Date(Date.now() - 86400000).toISOString() });
const rr = requestRefresh(token);
ok('refresh request recorded', rr.ok && !!rr.quote.refresh_requested_at);
ok('refresh task queued', db.list('tasks').some((t) => t.kind === 'quote_refresh' && t.ref_id === q.id));
const prevRev = db.get('quotes', q.id).revision || 1;
const rf = await refreshQuote(q.id, { actor: 'verifier' });
ok('refresh re-runs freight + validity', rf.ok && new Date(rf.quote.valid_until) > new Date());
ok('refresh bumps revision', rf.quote.revision === prevRev + 1, `rev ${rf.quote.revision}`);
ok('refresh clears request flag', !rf.quote.refresh_requested_at);

console.log('\n— CUSTOMER: ACCEPT → ORDER —');
const acc = await acceptQuote(token);
ok('accept creates order', acc.ok && !!acc.order?.id, acc.order?.id);
ok('quote marked accepted', db.get('quotes', q.id).status === 'accepted');
ok('order items match lines', db.list('order_items', { where: { order_id: acc.order.id } }).length === LINES.length);
ok('accept is idempotent', (await acceptQuote(token)).alreadyAccepted === true);
ok('locked after accept', repriceQuote(q.id, { margin_pct: 0.5 }).reason === 'locked');

console.log('\n— CUSTOMER: DECLINE (fresh quote) —');
const run2 = await runQuotingEngine({ vendor: 'Verifier Manufacturer', customer_name: 'Buckhead ASC', contact_name: 'QA', lines: LINES.map((l) => ({ ...l })) });
ok('tier B auto-resolved', run2.quote.customer_tier === 'B');
const dec = declineQuote(run2.quote.acceptance_token, { reason: 'Price too high — verifier' });
ok('decline with reason', dec.ok && dec.quote.status === 'declined' && dec.quote.decline_reason.includes('Price too high'));
ok('declined quote locked', repriceQuote(run2.quote.id, { margin_pct: 0.5 }).reason === 'locked');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
