import test from 'node:test';
import assert from 'node:assert/strict';
import { containerMapStatus, mapLocations } from '../src/lib/warehouseSpatial.js';
import { safeMap, resolveSpatialBarcode } from '../api/_lib/warehouseMobile.js';
const box={id:'PALLET',sku:'SKU',lot_id:'l',bin_id:'b',warehouse_id:'w',units_remaining:12,units_per_case:12,state:'sealed'};
const data=()=>({server_time:'2026-09-26T12:00:00Z',products:[{sku:'SKU',policy:{lot:'required',expiration:'required'}}],lots:[{id:'l',product_sku:'SKU',warehouse_id:'w',bin_id:'b',lot_number:'LOT',expiration_date:'2028-01-01'}],bins:[{id:'b',warehouse_id:'w',map_id:'m'}],containers:[box],outgoing_picks:[]});
test('map colors reflect verified records, not geometric detection or merely an outgoing SKU',()=>{
 const d=data();assert.equal(containerMapStatus(box,d).status,'complete');
 d.outgoing_picks=[{container_id:'different',lot_id:'l',units_verified:2}];assert.equal(containerMapStatus(box,d).status,'complete');
 d.outgoing_picks=[{container_id:'PALLET',lot_id:'l',units_verified:2}];assert.equal(containerMapStatus(box,d).status,'shipping');
 d.lots[0].lot_number='';const result=containerMapStatus(box,d);assert.equal(result.status,'missing');assert.ok(result.issues.includes('Lot number required'));assert.equal(result.outgoing.length,1);
});
test('holds, expired stock, mismatched lots, missing serials and recounts never show complete',()=>{
 for(const change of [{expiration_date:'2020-01-01'},{status:'quarantined'}]){const d=data();Object.assign(d.lots[0],change);assert.equal(containerMapStatus(box,d).status,'hold');}
 for(const change of [{lot_number:''},{expiration_date:'2028-02-31'},{bin_id:'other'},{warehouse_id:'other'}]){const d=data();Object.assign(d.lots[0],change);assert.equal(containerMapStatus(box,d).status,'missing');}
 assert.equal(containerMapStatus({...box,needs_recount:true},data()).status,'missing');
 const d=data();d.products[0].policy.serial='required';assert.equal(containerMapStatus(box,d).status,'missing');
});
test('empty locations are unverified and the worst condition takes precedence',()=>{
 const d=data();d.containers=[];assert.equal(mapLocations({id:'m'},d)[0].status,'missing');
 d.containers=[box,{...box,id:'other',needs_recount:true}];assert.equal(mapLocations({id:'m'},d)[0].status,'missing');assert.equal(mapLocations({id:'other'},d).length,0);
});
test('3D map geometry preserves measured height and rejects invalid extents',()=>{
 const surface={kind:'wall',x:0,y:1.4,z:0,width:4,height:2.8,angle:0};
 assert.equal(safeMap({name:'Area',surfaces:[surface]}).surfaces[0].height,2.8);
 for(const change of [{height:-1},{height:Infinity},{y:NaN},{x:201},{z:-201}])assert.equal(safeMap({name:'Area',surfaces:[{...surface,...change}]}).ok,false);
});

test('pallet labels resolve to the recorded SKU and location without inventing a count',()=>{
 const d=data(),p={sku:'SKU',name:'Test'};
 const resolved=resolveSpatialBarcode('PALLET',[p],[],[box],d.lots);
 assert.equal(resolved.product.sku,'SKU');assert.equal(resolved.container.bin_id,'b');assert.equal(resolved.parsed.lot,'LOT');assert.equal(resolved.quantity,undefined);
 assert.equal(resolveSpatialBarcode('PALLET',[p,{sku:'OTHER',barcode:'PALLET'}],[],[box],d.lots).reason,'barcode_conflict');
 assert.equal(resolveSpatialBarcode('PALLET',[p],[],[box],[]).ok,false);
});
