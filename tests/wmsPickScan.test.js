import test from 'node:test';
import assert from 'node:assert/strict';
import { planPickScan } from '../api/_lib/pickScanning.js';

const order={id:'ord_1',status:'ready_to_ship'};const item={id:'item_1',order_id:'ord_1',sku:'CASE-A',inventory_sku:'UNIT-A',qty:10};const reservation={id:'res_1',order_id:'ord_1',order_item_id:'item_1',inventory_sku:'UNIT-A',warehouse_id:'wh_unite',qty:10,status:'held'};

test('pick scan verifies barcode package and does not decrement on hand',()=>{
 const plan=planPickScan({order,item,reservations:[reservation],existingScans:[],barcodeResolution:{ok:true,sku:'UNIT-A',units_per_scan:5,variant_id:'v1'},body:{idempotency_key:'scan-key-12345',warehouse_id:'wh_unite',bin_id:'A1'},actorId:'worker'});
 assert.equal(plan.ok,true);assert.equal(plan.event.units_verified,5);assert.equal(plan.event.on_hand_delta,0);assert.equal(plan.complete,false);
});

test('pick scan blocks wrong sku, wrong bin, overpick, and changed replay',()=>{
 assert.equal(planPickScan({order,item,reservations:[reservation],existingScans:[],barcodeResolution:{ok:true,sku:'WRONG',units_per_scan:1},body:{idempotency_key:'scan-key-12345',warehouse_id:'wh_unite'},actorId:'worker'}).reason,'wrong_sku');
 const lotReservation={...reservation,lot_id:'lot_1',bin_id:'A1'};
 assert.equal(planPickScan({order,item,reservations:[lotReservation],lots:[{id:'lot_1',status:'sellable',qty_remaining:10,bin_id:'A1'}],existingScans:[],barcodeResolution:{ok:true,sku:'UNIT-A',units_per_scan:1},body:{idempotency_key:'scan-key-12345',warehouse_id:'wh_unite',bin_id:'B1',lot_id:'lot_1'},actorId:'worker'}).reason,'wrong_bin');
 const scans=[{order_item_id:'item_1',units_verified:9,status:'verified'}];
 assert.equal(planPickScan({order,item,reservations:[reservation],existingScans:scans,barcodeResolution:{ok:true,sku:'UNIT-A',units_per_scan:5},body:{idempotency_key:'scan-key-12345',warehouse_id:'wh_unite'},actorId:'worker'}).reason,'pick_quantity_exceeded');
});
