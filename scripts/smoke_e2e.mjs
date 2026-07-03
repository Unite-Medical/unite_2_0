/**
 * End-to-end smoke test of the site's functional entry/exit points.
 * Runs the lib layer the same way the pages do. Throwaway harness.
 */
import { db } from '../src/lib/db.js';
import { auth } from '../src/lib/auth.js';
import { resolveCustomerPrice } from '../src/lib/customerPricing.js';
import { cartStore } from '../src/store/cart.js';
import { placeOrder, approveHeldOrder } from '../src/lib/orders.js';
import { assertRepAuthority } from '../src/lib/repAuthority.js';
import { parseQuickOrder } from '../src/lib/quickOrder.js';
import { buildReorder } from '../src/lib/reorder.js';
import { consignment } from '../src/lib/consignment.js';
import { scanning } from '../src/lib/scanning.js';
import { blindShip } from '../src/lib/blindShip.js';
import { poIngestion } from '../src/lib/poIngestion.js';
import { shippingRates } from '../src/lib/shippingRates.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

const atl = db.get('organizations', 'org_atlsurgical');
const sku = db.list('customer_contract_prices')[0].product_sku;
const prod = db.get('products', sku);
const cust = { user_id: 'usr_demo', org_id: 'org_atlsurgical', org_name: atl.name, segment: atl.segment, email: 'sarah@atlanta-surgical.com' };

console.log('\n— SEED / DATA —');
ok('seed: organizations', db.count('organizations') >= 6, `${db.count('organizations')} orgs`);
ok('seed: products', db.count('products') > 50, `${db.count('products')} products`);
ok('seed: orders', db.count('orders') >= 30, `${db.count('orders')} orders`);

console.log('\n— AUTH (login entry points) —');
const admin = await auth.login('damon@unitemedical.net', 'admin');
ok('login: admin', admin?.role === 'admin');
const customer = await auth.login('sarah@atlanta-surgical.com', 'demo');
ok('login: customer', customer?.role === 'customer' && customer.org_id === 'org_atlsurgical');
let badLogin = false; try { await auth.login('sarah@atlanta-surgical.com', 'wrong'); } catch { badLogin = true; }
ok('login: wrong password rejected', badLogin);
auth.logout();

console.log('\n— PRICING (PRD-26 §5) —');
const pa = resolveCustomerPrice({ org: atl, sku, qty: 1 });
const pm = resolveCustomerPrice({ org: db.get('organizations', 'org_medone'), sku, qty: 1 });
ok('pricing: two orgs differ', pa.unit_price !== pm.unit_price, `atl ${pa.unit_price} vs medone ${pm.unit_price}`);
ok('pricing: contract basis', pa.basis === 'contract');
const other = db.list('organizations').find((o) => !['org_atlsurgical', 'org_medone'].includes(o.id));
const vb = resolveCustomerPrice({ org: other, sku, qty: 60 });
ok('pricing: volume break at qty 60', vb.basis === 'volume_break', `${vb.unit_price}`);

console.log('\n— CATALOG → CART → CHECKOUT (PRD-26 Ph2/4) —');
cartStore.add(sku, 3);
ok('cart: add item', cartStore.items.length >= 1);
const r1 = await placeOrder({ customer: cust, items: [{ sku, name: prod.name, qty: 3, unit_price: prod.price }], payment_method: 'ach', payment_terms: 'ach', order_source: 'catalog' });
const steps = db.list('fulfillment_pipeline', { where: { order_id: r1.order.id } });
const doneSteps = steps.filter((s) => s.status === 'completed').map((s) => s.step);
ok('checkout: order created', !!r1.order?.id, r1.order.id);
ok('checkout: pipeline ran', ['validate', 'reserve', 'payment', 'invoice', 'shipping', 'packing_slip', 'notify'].every((s) => doneSteps.includes(s)), doneSteps.join(','));
ok('checkout: invoice created', !!r1.invoice_id, r1.invoice_id);
ok('checkout: shipment + tracking', !!db.list('shipments', { where: { order_id: r1.order.id } })[0]?.tracking_number);
const notifs = db.list('audit_log').filter((a) => a.ref_id === r1.order.id && a.kind.startsWith('notify.'));
ok('checkout: multi-recipient notify', notifs.find((n) => n.kind === 'notify.order_placed')?.payload.count >= 2, notifs.map((n) => `${n.kind.split('.')[1]}:${n.payload.count}`).join(' '));

console.log('\n— PAYMENT GATE (PRD-26 §6) —');
let wireRej = false; try { await placeOrder({ customer: cust, items: [{ sku, name: prod.name, qty: 1, unit_price: prod.price }], payment_method: 'wire', payment_terms: 'wire' }); } catch (e) { wireRej = e.code === 'method_not_allowed'; }
ok('gate: off-allowlist (wire) rejected', wireRej);
const big = Math.ceil(70000 / prod.price);
const r2 = await placeOrder({ customer: cust, items: [{ sku, name: prod.name, qty: big, unit_price: prod.price }], payment_method: 'net30', payment_terms: 'net30' });
ok('gate: over-limit → credit hold', r2.held && r2.reason === 'over_credit_limit');
const appr = await approveHeldOrder(r2.order.id);
ok('gate: admin approve runs fulfillment', appr.ok && db.get('orders', r2.order.id).status !== 'credit_hold');

console.log('\n— QUICK ORDER + REORDER (PRD-26 Ph2) —');
const qo = parseQuickOrder(`${sku}, 12\nNOT-A-SKU, 4`, atl);
ok('quick order: valid line parsed', qo.validCount === 1 && qo.valid[0].sku === sku);
ok('quick order: bad line flagged', qo.invalidCount === 1);
const reord = buildReorder(r1.order.id, atl);
ok('reorder: rebuilt from past order', reord.length >= 1 && reord[0].unit_price > 0);

console.log('\n— REP RBAC (PRD-26 §9) —');
let dep15 = false; try { assertRepAuthority('usr_ops', { discount_pct: 15 }); } catch (e) { dep15 = e.code === 'rep_authority'; }
ok('rbac: ops rep denied 15% (cap 10)', dep15);
ok('rbac: ops rep allowed 8%', assertRepAuthority('usr_ops', { discount_pct: 8 }) === true);
let noRep = false; try { assertRepAuthority('usr_demo', { discount_pct: 1 }); } catch (e) { noRep = e.code === 'rep_authority'; }
ok('rbac: non-rep denied place_order', noRep);

console.log('\n— CONSIGNMENT (PRD-27 §4) —');
const dp = db.list('distributor_products').find((p) => p.unite_sellable);
const beforeMed = consignment.availableFor({ owner_org_id: 'org_medone', sku: dp.mapped_unite_sku });
const beforeUnite = consignment.availableFor({ owner_type: 'unite', sku: dp.mapped_unite_sku });
const r3 = await placeOrder({ customer: cust, items: [{ sku: dp.mapped_unite_sku, name: 'x', qty: 5, unit_price: 50 }], payment_method: 'ach', payment_terms: 'ach' });
const afterMed = consignment.availableFor({ owner_org_id: 'org_medone', sku: dp.mapped_unite_sku });
ok('consignment: sell-through decremented distributor lot', afterMed === beforeMed - 5, `${beforeMed}→${afterMed}`);
ok('consignment: Unite pool untouched by distributor query', consignment.availableFor({ owner_type: 'unite', sku: dp.mapped_unite_sku }) === beforeUnite);
const settle = consignment.settlementFor('org_medone');
ok('consignment: settlement owed recorded', settle.owed > 0, `$${settle.owed} owed`);
const pools = consignment.poolsForSku(dp.mapped_unite_sku);
ok('consignment: pools reported separately', 'unite' in pools && 'distributors' in pools);

console.log('\n— SCANNING (PRD-27 §5) —');
const code = scanning.generateLotBarcode({ gtin: '00361414000010', lot: 'LOT-Z9', expiration: '2027-03-31' });
const parsed = scanning.parseGs1(code);
ok('scan: GS1 roundtrip', parsed?.lot === 'LOT-Z9' && parsed?.expiration === '2027-03-31');
const rec = scanning.receiveScan({ owner_org_id: 'org_medone', barcode: code, by: 'usr_ops', sku: dp.mapped_unite_sku, qty: 100 });
ok('scan: receive creates lot + provenance', rec.capture_method === 'gs1_scan' && !!db.get('scan_events', rec.scan_id));
const onhandBefore = db.get('inventory_lots', rec.lot.id).qty_on_hand;
const pick = scanning.pickScan({ order_id: r3.order.id, lot_id: rec.lot.id, qty: 10, by: 'usr_ops' });
ok('scan: pick decrements + recall trace', db.get('inventory_lots', rec.lot.id).qty_on_hand === onhandBefore - 10 && db.list('lot_tracking').some((l) => l.order_id === r3.order.id));

console.log('\n— BLIND SHIP (PRD-27 §6) —');
const blindOrder = { id: 'X', blind_ship: true, on_behalf_of_org_id: 'org_medone', shipping_bill_to: 'third_party', carrier_account_id: 'dca_medone_fedex' };
const opt = blindShip.shipOptionsFor(blindOrder);
ok('blind: ship-from is distributor brand', opt.shipFrom?.name === 'MedOne Distributors');
ok('blind: third-party billing set', !!opt.billToThirdParty?.account_number);
ok('blind: non-Unite packing slip', blindShip.packingDocsFor(blindOrder).template !== 'unite_default');

console.log('\n— PO INGESTION (PRD-27 §7) —');
const po = poIngestion.ingestPo({ owner_org_id: 'org_medone', parsedInput: `PO: 7781\n${sku}, 10\nWEIRD-PART-1, 4` });
ok('po: parsed + flags unmatched', po.status === 'needs_mapping');
const mapped = poIngestion.mapAndRecheck(po.id, 'WEIRD-PART-1', sku, 'unite');
ok('po: map + recheck → ready', mapped.status === 'ready');
ok('po: draft lines produced', poIngestion.draftLinesFromUpload(po.id).lines.length === 2);

console.log('\n— SHIPPING MARKUP (PRD-27 §8) —');
ok('shipping: 10% markup', shippingRates.applyMarkup(9.0, 'org_medone') === 9.9);
const cmp = await shippingRates.compareForDistributor({ id: 'p', customer_id: 'org_medone', on_behalf_of_org_id: 'org_medone' });
ok('shipping: comparison has both options', cmp.options.length === 2 && cmp.options[0].kind === 'unite_rate');

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
