import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyTransferPreview, planLegacyOrderTransfer, LEGACY_ORDER_QUERY } from '../api/_lib/legacyShopifyOrders.js';

const live={id:'gid://shopify/Order/123',legacyResourceId:'123',name:'#2983',updatedAt:'2026-08-26T12:00:00Z',cancelledAt:null,closed:false,currencyCode:'USD',lineItems:{nodes:[
 {id:'gid://shopify/LineItem/1',sku:'SKU-A',name:'A',quantity:5,currentQuantity:5,unfulfilledQuantity:2},
 {id:'gid://shopify/LineItem/2',sku:'SKU-A',name:'A duplicate',quantity:3,currentQuantity:2,unfulfilledQuantity:1},
]}};

test('legacy Shopify operation is query-only',()=>{
 assert.match(LEGACY_ORDER_QUERY,/^query\s/);assert.doesNotMatch(LEGACY_ORDER_QUERY,/mutation/i);
});

test('legacy transfer preview preserves duplicate SKU line identity and remaining quantity',()=>{
 const preview=buildLegacyTransferPreview(live);
 assert.equal(preview.lines.length,2);assert.equal(preview.lines.reduce((n,l)=>n+l.transferable_quantity,0),3);
 assert.notEqual(preview.lines[0].source_line_id,preview.lines[1].source_line_id);
});

test('legacy transfer requires transfer decision and unchanged live preview',()=>{
 const preview=buildLegacyTransferPreview(live);
 assert.equal(planLegacyOrderTransfer({decision:{action:'archive'},liveOrder:live,previewHash:preview.hash}).reason,'order_not_approved_for_transfer');
 assert.equal(planLegacyOrderTransfer({decision:{action:'transfer'},liveOrder:{...live,updatedAt:'2026-08-26T13:00:00Z'},previewHash:preview.hash}).reason,'shopify_order_changed');
});

test('legacy transfer creates blocked order with no payment, invoice, shipment, or notifications',()=>{
 const preview=buildLegacyTransferPreview(live);const plan=planLegacyOrderTransfer({decision:{action:'transfer',shopify_order_id:'123'},liveOrder:live,previewHash:preview.hash,actorId:'admin'});
 assert.equal(plan.ok,true);assert.equal(plan.order.status,'pending_shopify_ack');assert.equal(plan.order.fulfillment_blocked,true);
 assert.equal(plan.lines.length,2);assert.deepEqual(plan.side_effects,{payments:0,invoices:0,shipments:0,notifications:0});
});
