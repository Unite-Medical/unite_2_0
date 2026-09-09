import crypto from 'node:crypto';

function stable(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function lotUsable(lot,now=new Date()){if(!lot)return true;if(['quarantined','recalled','restricted','expired','disposed','quality_hold'].includes(String(lot.status||'').toLowerCase()))return false;if(lot.expiration_date&&Date.parse(`${lot.expiration_date}T23:59:59.999Z`)<=now.getTime())return false;return Number(lot.qty_remaining??lot.qty_on_hand??0)>0;}
export function planPickScan({order,item,reservations=[],lots=[],existingScans=[],barcodeResolution,body={},actorId,now=new Date()}={}){
 if(!order||!['inventory_reserved','ready_to_ship'].includes(order.status))return {ok:false,reason:'order_not_pickable'};
 if(!item||item.order_id!==order.id)return {ok:false,reason:'order_item_not_found'};
 if(!actorId)return {ok:false,reason:'picker_required'};
 if(!/^[A-Za-z0-9_-]{12,128}$/.test(String(body.idempotency_key||'')))return {ok:false,reason:'idempotency_key_required'};
 if(!barcodeResolution?.ok)return {ok:false,reason:barcodeResolution?.reason||'barcode_unresolved'};
 const inventorySku=item.inventory_sku||item.sku;if(barcodeResolution.sku!==inventorySku)return {ok:false,reason:'wrong_sku'};
 const held=reservations.filter((row)=>row.order_id===order.id&&row.order_item_id===item.id&&row.status==='held');if(!held.length)return {ok:false,reason:'held_reservation_required'};
 const reservation=held.find((row)=>row.warehouse_id===body.warehouse_id)||held[0];if(body.warehouse_id&&reservation.warehouse_id!==body.warehouse_id)return {ok:false,reason:'wrong_warehouse'};
 const expectedLot=reservation.lot_id||reservation.inventory_lot_id||null;if(expectedLot&&body.lot_id!==expectedLot)return {ok:false,reason:'wrong_lot'};
 if(reservation.bin_id&&body.bin_id!==reservation.bin_id)return {ok:false,reason:'wrong_bin'};
 const lot=expectedLot?lots.find((candidate)=>candidate.id===expectedLot):null;if(expectedLot&&!lotUsable(lot,now))return {ok:false,reason:'lot_not_sellable'};
 const units=Number(barcodeResolution.units_per_scan||1)*Number(body.scan_count||1);if(!Number.isInteger(units)||units<=0)return {ok:false,reason:'invalid_scan_quantity'};
 const already=existingScans.filter((scan)=>scan.order_item_id===item.id&&scan.status==='verified').reduce((sum,scan)=>sum+Number(scan.units_verified||0),0);if(already+units>Number(item.qty||0))return {ok:false,reason:'pick_quantity_exceeded'};
 const intent={order_id:order.id,order_item_id:item.id,barcode:body.barcode||null,sku:inventorySku,units,warehouse_id:reservation.warehouse_id,bin_id:body.bin_id||null,lot_id:expectedLot};const requestHash=stable(intent);const id=`pickscan_${crypto.createHash('sha256').update(`${order.id}:${body.idempotency_key}`).digest('hex').slice(0,24)}`;
 const replay=existingScans.find((scan)=>scan.id===id);if(replay)return replay.request_hash===requestHash?{ok:true,idempotent:true,event:replay,complete:already>=Number(item.qty||0)}:{ok:false,reason:'pick_scan_intent_changed'};
 const at=(now instanceof Date?now:new Date(now)).toISOString();const event={id,kind:'pick_verify',status:'verified',...intent,barcode_mapping_id:barcodeResolution.variant_id||null,units_verified:units,on_hand_delta:0,idempotency_key:body.idempotency_key,request_hash:requestHash,scanned_by:actorId,scanned_at:at};return {ok:true,idempotent:false,event,complete:already+units===Number(item.qty||0)};
}
