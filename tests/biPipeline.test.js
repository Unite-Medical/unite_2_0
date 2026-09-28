import test from 'node:test';
import assert from 'node:assert/strict';
import { newBiRun, advanceBiState, runBiPipeline, pipelineStatus } from '../api/_lib/biPipeline.js';
import { readBiSourcePage } from '../api/_lib/biSources.js';
import { summarizeBiTopic, readBiReport } from '../api/_lib/biReports.js';
import { callCommerceAgentTool, agentTools } from '../api/_lib/commerceAgentTools.js';
import { projectSyncPage } from '../api/_lib/syncPage.js';
const at=Date.parse('2026-09-28T12:00:00Z');
const page=(records=[],extra={})=>({page:1,records,has_more:false,identity:'test',warnings:[],coverage:'All fixture records',retrieved_at:new Date(at).toISOString(),...extra});
test('publication waits for final page, preserves previous generation and refuses stalled or changed sources',()=>{
  const previous={generation:'previous'};let state=newBiRun('shopify_all_orders',{published:previous},at);
  state=advanceBiState(state,page([{id:'a'}],{has_more:true,next_cursor:'next'}),at);
  assert.deepEqual(state.published,previous);assert.equal(state.page,2);
  assert.throws(()=>advanceBiState(state,page([{id:'b'}],{has_more:true,next_cursor:'next'}),at),/stalled/);
  assert.throws(()=>advanceBiState(state,page([{id:'b'}],{identity:'another_account'}),at),/account_changed/);
  state=advanceBiState(state,page([{id:'b'}]),at);assert.equal(state.published.records_received,2);assert.equal(state.status,'ready');
});
test('truncated nested records publish only partial coverage and duplicate IDs fail explicitly',()=>{
  const state=newBiRun('qbo_pos',{},at);
  assert.throws(()=>advanceBiState(state,page([{Id:'a'},{Id:'a'}]),at),/duplicate/);
  const result=advanceBiState(state,page([{Id:'a'}],{warnings:['Nested lines truncated']}),at);
  assert.equal(result.status,'partial');assert.equal(result.published.status,'partial');
  assert.equal(pipelineStatus([result],at+31*3600000).find(s=>s.source==='qbo_pos').published.stale,true);
});
test('worker respects exclusive lease, retries failed page without moving cursor and continues healthy sources',async()=>{
  let states=[],released=false,locked=false;const commits=[];
  const repository={acquire:async()=>!locked,release:async()=>{released=true;},states:async()=>states,commit:async(_owner,state,result)=>{commits.push({state,result});states=[...states.filter(s=>s.source!==state.source),structuredClone(state)];}};
  await runBiPipeline(null,{repository,now:()=>at,maxPages:2,readPage:async(_sql,s)=>{if(s.source==='qbo_pos')throw new Error('source_rate_limited');return page([{Id:'a'}]);}});
  assert.equal(released,true);assert.equal(states.find(s=>s.source==='qbo_pos').page,1);assert.equal(states.find(s=>s.source==='qbo_items').status,'ready');
  assert.equal(commits.filter(c=>c.result).length,1);
  locked=true;assert.equal((await runBiPipeline(null,{repository})).busy,true);
});
test('Stripe uses fixed read routes, bounded historical pagination, redacts private extra fields and handles missing permission',async()=>{
  const state={...newBiRun('stripe_charges',{},at),cursor:'ch_previous'};
  let request;
  const result=await readBiSourcePage(null,state,{env:{STRIPE_AGENT_API_KEY:'fixture'},fetchImpl:async(url,options)=>{request={url,options};return{ok:true,json:async()=>({data:[{id:'ch_1',amount:100,currency:'usd',billing_details:{email:'private'},livemode:true}],has_more:false})};}});
  assert.equal(request.url.pathname,'/v1/charges');assert.equal(request.url.searchParams.get('starting_after'),'ch_previous');assert.equal(request.options.body,undefined);assert.equal(result.records[0].billing_details,undefined);
  await assert.rejects(readBiSourcePage(null,state,{env:{STRIPE_AGENT_API_KEY:'fixture'},fetchImpl:async()=>({ok:false,status:403})}),/permission_missing/);
});
test('ShipStation requires Unite store filtering and rejects a returned different store',async()=>{
  let filter;
  const env={SHIPSTATION_STORE_ID:'unite'},services={shipstation:{buildUrl:(_p,q)=>{filter=q;return 'fixed';}}};
  const evidence=async(_sql,_input,d)=>{d.services.shipstation.buildUrl('/orders',{page:1});return page([{orderId:1,advancedOptions:{storeId:'other'}}]);};
  await assert.rejects(readBiSourcePage(null,newBiRun('shipstation_orders',{},at),{env,services,evidence}),/scope_mismatch/);
  assert.equal(filter.storeId,'unite');
});
test('inventory preserves unknown quantities and does not add stock units or double deduct committed inventory',()=>{
  const data={shopify_inventory:[{id:'i',sku:'S',tracked:true,inventoryLevels:{nodes:[{location:{name:'Unite',isActive:true},quantities:[{name:'on_hand',quantity:4},{name:'available',quantity:2},{name:'committed',quantity:2}]},{location:{name:'Other',isActive:true},quantities:[]}]}}]};
  const r=summarizeBiTopic('inventory',data);assert.equal(r.rows[0].on_hand,null);assert.equal(r.rows.find(r=>r.location==='Unite').available,2);assert.equal(r.summary.total_units,undefined);assert.equal(r.summary.negative_on_hand_rows,0);
});
test('purchasing separates currencies and does not present closed POs as receipts',()=>{
  const po=(Id,currency)=>({Id,TxnDate:'2020-01-01',POStatus:'Closed',CurrencyRef:{value:currency},Line:[{Id:'1',Amount:100,ItemBasedExpenseLineDetail:{Qty:2,UnitPrice:50,ItemRef:{value:'i'}}}]});
  const r=summarizeBiTopic('purchasing',{qbo_pos:[po('1','USD'),po('2','EUR')]});
  assert.equal(r.summary.by_status.length,2);assert.equal(r.summary.open_purchase_orders,0);assert.equal(r.rows[0].unit_status,'Unverified source unit');assert.match(r.definitions[1],/do not prove/);
});
test('shipping matches stable IDs, sums split active lines, deduplicates snapshots and avoids number-only matches',()=>{
  const order=(id,qty)=>({orderId:id,orderKey:'123-extra',orderNumber:'#1',orderStatus:'on_hold',modifyDate:'2026-09-28',items:[{lineItemKey:'456',quantity:qty,sku:'A'}]});
  const data={shipstation_orders:[order(1,2),order(2,3)],shipstation_on_hold:[order(1,2)],shopify_all_orders:[{id:'gid://shopify/Order/123',name:'#1',lineItems:{nodes:[{id:'gid://shopify/LineItem/456',unfulfilledQuantity:5}]}}]};
  const r=summarizeBiTopic('shipping',data);assert.equal(r.summary.orders,2);assert.equal(r.summary.matched_quantity_differences.length,0);
  data.shopify_all_orders[0].lineItems.nodes[0].unfulfilledQuantity=9;
  assert.equal(summarizeBiTopic('shipping',data).summary.matched_quantity_differences[0].shipstation_active_quantity,5);
});
test('missing sources are unavailable with null summary, protected from raw sync and non-admin agent calls',async()=>{
  const sql=async()=>[];
  const result=await readBiReport(sql,{topic:'inventory'});assert.equal(result.status,'unavailable');assert.equal(result.summary,null);
  for(const name of ['read_bi_data','refresh_bi_data'])await assert.rejects(callCommerceAgentTool(sql,{name,arguments:{}},{actor:{role:'sales'}}),/Admin access/);
  assert.ok(agentTools.some(t=>t.name==='read_bi_data'));
  const rows=['bi_sources','bi_records','bi_pages','bi_control'].map(tbl=>({tbl,data:{private:true},updated_at:new Date(at),cursor_at:new Date(at).toISOString()}));
  assert.deepEqual(projectSyncPage(rows,{cutoff:new Date(at).toISOString()}).tables,{});
});
