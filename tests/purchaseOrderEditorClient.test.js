import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseDraftPayload,purchaseDraftTotals,switchPurchaseSupplier,warehousePurchaseAddress,samePurchaseAddress} from '../src/lib/purchaseOrderEditorClient.js';
import {sanitizePurchaseOrderForVendor} from '../api/vendor/purchase-orders/review.js';
const draft={id:'po-qa',vendor_id:'supplier-a',warehouse_id:'wh-qa',ship_to:{address1:'QA warehouse'},reference:'supplier-a-quote',notes:'Supplier A note',payment_terms:'Net 30',expected_delivery:'2026-11-01',status:'sent',received_qty:20,line_items:[{id:'stable-line',product_id:'catalog-qa',catalog_table:'commerce_products',sku:'QA-BOX',qty:10,cost:4,supplier_sku:'A-123',received_qty:2}]};
test('supplier switch preserves products/quantities/stable IDs and clears supplier-private context',()=>{
 const changed=switchPurchaseSupplier(draft,'supplier-b');
 assert.equal(changed.line_items[0].id,'stable-line');assert.equal(changed.line_items[0].qty,10);assert.equal(changed.line_items[0].cost,null);assert.equal(changed.line_items[0].supplier_sku,'');
 for(const key of ['reference','notes','payment_terms','expected_delivery'])assert.equal(changed[key],'');
 assert.equal(changed.warehouse_id,'wh-qa');assert.deepEqual(changed.ship_to,draft.ship_to);assert.equal(draft.notes,'Supplier A note');
 assert.equal(switchPurchaseSupplier({...draft,vendor_id:''},'supplier-a').line_items[0].cost,4);
});
test('blank cost is unknown, explicit zero is a truthful zero, and totals round each line',()=>{
 assert.deepEqual(purchaseDraftTotals([{qty:3,cost:1.111},{qty:1,cost:null}]),{subtotal:3.33,total:null,unpriced:1});
 assert.deepEqual(purchaseDraftTotals([{qty:3,cost:0}]),{subtotal:0,total:0,unpriced:0});
 assert.equal(purchaseDraftTotals([{qty:'',cost:4}]).total,null);
});
test('save payload cannot carry lifecycle, receiving or accounting fields',()=>{
 const payload=purchaseDraftPayload(draft);assert.equal(payload.status,undefined);assert.equal(payload.received_qty,undefined);assert.equal(payload.line_items[0].received_qty,undefined);assert.equal(payload.line_items[0].id,'stable-line');
});
test('warehouse address is sourced, not fabricated, and saved overrides can be detected',()=>{
 const address=warehousePurchaseAddress({id:'w',name:'QA warehouse',ship_to:{address1:'2 Test Road',city:'Test',country:'US'}});
 assert.equal(address.address1,'2 Test Road');assert.equal(address.zip,'');assert.equal(warehousePurchaseAddress({}).country,'');assert.equal(samePurchaseAddress(address,{...address,address1:'Manual edited address'}),false);assert.equal(samePurchaseAddress(address,{...address,address1:' 2 Test Road '}),true);
});
test('supplier projection carries only intended PO context, never historical internal notes',()=>{
 const po={...draft,source:'manual_composer',doc_number:'PO-QA',internal_margin:55,ship_to:{address1:'QA warehouse',secret:'never'},line_items:[{sku:'QA-BOX',supplier_sku:'SUP-BOX',qty:10,cost:4}]};
 const view=sanitizePurchaseOrderForVendor(po);assert.equal(view.reference,'supplier-a-quote');assert.equal(view.payment_terms,'Net 30');assert.equal(view.supplier_notes,'Supplier A note');assert.equal(view.ship_to.secret,undefined);assert.equal(view.internal_margin,undefined);assert.equal(view.line_items[0].supplier_sku,'SUP-BOX');
 const historic=sanitizePurchaseOrderForVendor({...po,source:'import',notes:'Internal customer discussion'});assert.equal(historic.supplier_notes,null);assert.equal(historic.ship_to,null);
});
