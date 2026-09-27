import test from 'node:test';
import assert from 'node:assert/strict';
import {planOpeningCount,countPostingWrites,inventorySnapshot} from '../api/_lib/warehouseMobile.js';
const inventory={id:'i',sku:'SKU',warehouse_id:'w',on_hand:100,reserved:0};
const product={id:'p',sku:'SKU',name:'Product',lot_tracking:'required',expiration_tracking:'required'};
const session={user_id:'u',role:'warehouse_manager'};
const bins=[{id:'a',warehouse_id:'w'},{id:'b',warehouse_id:'w'},{id:'foreign',warehouse_id:'other'}];
const line=(bin,lot,units)=>({bin_id:bin,lot_number:lot,expiration_date:'2028-01-01',cases:0,eaches:units});
const body=()=>({confirmed:true,whole_sku_confirmed:true,reason:'Initial count',snapshot:inventorySnapshot(inventory,[]),idempotency_key:'opening-test-001',allocations:[line('a','LOT1',60),line('b','LOT2',35)]});
const plan=(changes={},extra={})=>planOpeningCount({body:{...body(),...changes},session,inventory,lots:[],product,bins,...extra});
test('opening worksheet reconciles total once and creates distinct physical lots atomically',()=>{
 const result=plan();assert.equal(result.ok,true);assert.equal(result.record.units,95);assert.equal(result.record.variance,-5);
 const posted=countPostingWrites(result.record,inventory,[],session,product);assert.equal(posted.ok,true);
 assert.equal(posted.writes.find(w=>w.table==='inventory').data.on_hand,95);
 const lots=posted.writes.filter(w=>w.table==='lots');assert.deepEqual(lots.map(l=>l.data.qty_remaining),[60,35]);assert.notEqual(lots[0].data.id,lots[1].data.id);
 const move=posted.writes.find(w=>w.table==='stock_movements').data;assert.equal(move.qty_delta,-5);assert.equal(move.lot_id,null);
 assert.equal(posted.writes.find(w=>w.table==='warehouse_counts').before,result.record);
 assert.equal(posted.writes.find(w=>w.table==='warehouse_counts').data.posted_lot_ids.length,2);
});
test('opening worksheet rejects duplicates, invalid scope, stale data and incomplete evidence',()=>{
 for(const change of [{confirmed:false},{whole_sku_confirmed:false},{allocations:[]},{snapshot:'stale'},{allocations:[line('a','SAME',10),line('a','SAME',20)]},{allocations:[line('foreign','L',10)]},{allocations:[line('a','',10)]},{allocations:[line('a','L',-10)]},{allocations:[{...line('a','L',10),expiration_date:'2028-02-31'}]}])assert.equal(plan(change).ok,false,JSON.stringify(change));
 assert.equal(plan({}, {lots:[{id:'l',product_sku:'SKU',warehouse_id:'w'}]}).ok,false);
});
test('opening approval preserves restrictions and detects concurrent stock changes',()=>{
 const record=plan().record;
 assert.equal(countPostingWrites(record,inventory,[],{role:'warehouse_operator'},product).ok,false);
 assert.equal(countPostingWrites(record,{...inventory,on_hand:200},[],session,product).ok,false);
 assert.equal(countPostingWrites({...record,units:99},inventory,[],session,product).ok,false);
 assert.equal(countPostingWrites({...record,status:'posted'},inventory,[],session,product).ok,false);
});
