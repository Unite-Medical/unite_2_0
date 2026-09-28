import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceParameters, readEvidencePage } from '../api/_lib/inventoryEvidence.js';
import { collectEvidence } from '../src/lib/inventoryEvidenceExport.js';
const params = s => evidenceParameters(new URLSearchParams(s));
test('evidence validates allowed sources, dates and bounded page numbers', () => {
  assert.equal(params('source=qbo_pos').page, 1);
  for (const query of ['source=credentials', 'source=qbo_pos&page=-1', 'source=qbo_pos&page=1.5', 'source=qbo_pos&since=2026-02-30']) assert.throws(() => params(query));
});
test('historical QBO export retains closed and linked POs without write calls', async () => {
  const po = { Id:'10', POStatus:'Closed', LinkedTxn:[{TxnId:'11'}], Line:[{Qty:2}] };
  const result = await readEvidencePage(null, params('source=qbo_pos&page=2'), {
    getQboContext: async () => ({realmId:'123', environment:'production'}),
    qboRequest: async (ctx, route, opts) => { assert.equal(route,'query'); assert.equal(opts.body,undefined); assert.match(opts.query,/startposition 101/); assert.doesNotMatch(opts.query,/where/); return {QueryResponse:{PurchaseOrder:[po]}}; },
  });
  assert.deepEqual(result.records,[po]); assert.equal(result.has_more,false);
});
test('Shopify nested pagination never silently passes as complete', async () => {
  const record = {id:'1',inventoryLevels:{pageInfo:{hasNextPage:true}}};
  const result = await readEvidencePage(null, params('source=shopify_inventory'), {
    services:{shopify:{configured:()=>true,buildUrl:()=> 'https://example.test',headers:async()=> ({})}},
    fetchImpl:async(_url,opts)=> {assert.doesNotMatch(JSON.parse(opts.body).query,/mutation/); return {ok:true,json:async()=>({data:{inventoryItems:{nodes:[record],pageInfo:{hasNextPage:false}}}})};},
  });
  assert.equal(result.warnings.length,1);
  const collected=await collectEvidence(['shopify_inventory'],'2026-09-01',{request:async()=>result});
  assert.equal(collected.datasets.shopify_inventory.complete,false);
});
test('export preserves partial pages on failures, stops stalled cursors and continues other sources', async()=>{
  const bundle=await collectEvidence(['shopify_inventory','qbo_pos'],'2026-09-01',{request:async({source,page})=>source==='qbo_pos'?{records:[],has_more:false}:{records:[{id:page}],has_more:true,next_cursor:'same'}});
  assert.equal(bundle.datasets.shopify_inventory.pages.length,2);
  assert.equal(bundle.datasets.shopify_inventory.complete,false);
  assert.match(bundle.datasets.shopify_inventory.errors[0],/stalled/);
  assert.equal(bundle.datasets.qbo_pos.complete,true);
});
test('ShipStation open orders have no date filter and exclude addresses',async()=>{
  const result=await readEvidencePage(null,params('source=shipstation_on_hold&since=2026-09-01'),{
    services:{shipstation:{configured:()=>true,buildUrl:(path,query)=>{assert.equal(query.orderStatus,'on_hold');assert.equal(query.modifyDateStart,undefined);return 'https://example.test';},headers:async()=>({})}},
    fetchImpl:async()=>({ok:true,json:async()=>({pages:1,total:1,orders:[{orderId:1,items:[],shipTo:{street1:'private'},customerEmail:'private'}]})}),
  });
  assert.equal(result.records[0].shipTo,undefined);assert.equal(result.records[0].customerEmail,undefined);
});
