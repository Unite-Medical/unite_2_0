import test from 'node:test';
import assert from 'node:assert/strict';
import {needsWmsProjection,fetchWmsWorkstation} from '../src/lib/wmsBootstrap.js';
test('only warehouse sessions hydrate the restricted projection; admin full catalog stays intact',()=>{
 assert.equal(needsWmsProjection({role:'admin'}),false);
 assert.equal(needsWmsProjection({role:'warehouse_manager'}),true);
 assert.equal(needsWmsProjection({role:'warehouse_operator'}),true);
 for(const role of ['customer','sales','finance','distributor'])assert.equal(needsWmsProjection({role}),false);
 assert.equal(needsWmsProjection(null),false);
});
test('warehouse bootstrap preserves authorization errors instead of treating them as an empty catalog',async()=>{
 const result=await fetchWmsWorkstation({fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:'role_changed'})})});
 assert.equal(result.ok,false);assert.equal(result.status,403);assert.equal(result.reason,'role_changed');assert.equal(result.data,undefined);
});
