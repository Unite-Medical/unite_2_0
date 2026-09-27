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

test('completed pick replay is idempotent and a changed source case is rejected',()=>{
 const body={idempotency_key:'complete-pick-123',warehouse_id:'wh_unite',scan_count:10,container_id:'CASE-A'};
 const input={order,item,reservations:[reservation],barcodeResolution:{ok:true,sku:'UNIT-A',units_per_scan:1},body,actorId:'worker'};
 const first=planPickScan(input);assert.equal(first.complete,true);
 assert.equal(planPickScan({...input,existingScans:[first.event]}).idempotent,true);
 assert.equal(planPickScan({...input,existingScans:[first.event],body:{...body,container_id:'CASE-B'}}).reason,'pick_scan_intent_changed');
});
test('mobile picks bind actual lot and location even when the reservation is SKU-level',()=>{
 const body={action:'pick',idempotency_key:'physical-pick-123',warehouse_id:'wh_unite',scan_count:2,lot_id:'lot_real',bin_id:'A1'};
 const lot={id:'lot_real',product_sku:'UNIT-A',warehouse_id:'wh_unite',bin_id:'A1',qty_remaining:10};
 const input={order,item,reservations:[reservation],lots:[lot],barcodeResolution:{ok:true,sku:'UNIT-A',units_per_scan:1},body,actorId:'worker'};
 assert.equal(planPickScan(input).event.lot_id,'lot_real');
 assert.equal(planPickScan({...input,body:{...body,lot_id:null}}).reason,'physical_lot_required');
 assert.equal(planPickScan({...input,body:{...body,bin_id:'B1'}}).reason,'wrong_lot_or_location');
});
