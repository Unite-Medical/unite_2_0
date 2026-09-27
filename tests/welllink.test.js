import process from 'node:process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {canUseWellLink,wellExtension,feePreview,taskPlan,wellBoard,WELL_DOCUMENTS,wellSource} from '../api/_lib/welllink.js';
import {rawSyncMutationAllowed} from '../api/db/sync.js';
import handler from '../api/admin/welllink.js';
import {readWellDocument} from '../api/_lib/welllinkStorage.js';
// Synthetic rates only. Real contract data is private runtime configuration.
process.env.WELLLINK_SOURCE_JSON=JSON.stringify({contract:{id:'QA-CONTRACT',starts:'2026-06-01',ends:'2029-05-31'},products:[
 ['21IN-0103000012-C','1 mL',3200,'0.07123456789'],
 ['21IN-0303000002-C','3 mL',2400,'0.06234567891'],
 ['21IN-0503000010-C','5 mL',1600,'0.07345678912'],
 ['21IN-1003000008-C','10 mL',1200,'0.08456789123'],
 ['21IN-2003000002-C','20 mL',600,'0.12123456789'],
 ['21IN-5023000001-C','50/60 mL',240,'0.32123456789'],
].map(([sku,size,eachPerCase,unitPrice])=>({sku,size,eachPerCase,unitPrice,crossReference:size==='5 mL'?'BD 309646':undefined}))});

const jacobe={role:'sales',email:'jacobe@unitemedical.net'},ashley={role:'finance',email:'accounting@unitemedical.net'},damon={role:'admin',email:'damon@unitemedical.net'};
test('WellLink access requires an authorized staff role and identity',()=>{
  for(const actor of [jacobe,ashley,damon])assert.equal(canUseWellLink(actor),true);
  for(const actor of [null,{}, {role:'customer',email:jacobe.email},{role:'sales',email:'other@unitemedical.net'},{role:'finance',email:jacobe.email},{role:'warehouse_operator',email:'other@unitemedical.net'}])assert.equal(Boolean(canUseWellLink(actor)),false);
});
test('source prices extend at full precision, not rounded each or case prices',()=>{
  assert.equal(wellExtension('21IN-0103000012-C',1).total,'227.95');
  const large=wellExtension('21IN-2003000002-C',3);
  assert.equal(large.each,1800);assert.equal(large.total,'218.22');assert.equal(large.roundedCaseTotal,'218.22');
  assert.equal(wellExtension('21IN-5023000001-C',3).roundingDifferenceCents,1);
  for(const quantity of [0,-1,1.5,10001,'1',NaN,Infinity])assert.throws(()=>wellExtension('21IN-2003000002-C',quantity));
  assert.throws(()=>wellExtension('not-a-product',1));
});
test('fee preview uses exact cents and thirty calendar days after month end',()=>{
  assert.deepEqual(feePreview('2026-06','1000.50'),{month:'2026-06',gross:'1000.50',fee:'30.02',due:'2026-07-30',previewOnly:true});
  assert.equal(feePreview('2026-12','0').due,'2027-01-30');
  assert.equal(feePreview('2028-02','0').due,'2028-03-30');
  for(const month of ['2025-01','2026-13','2026-00','garbage'])assert.throws(()=>feePreview(month,'10'));
  for(const gross of ['-1','1.234','1e5','NaN'])assert.throws(()=>feePreview('2026-06',gross));
});
test('task updates enforce owner, evidence, and optimistic concurrency',()=>{
  const input={id:'pricing',version:0,status:'complete',evidence:'Controlled Appendix A reference',note:'Reviewed'};
  assert.equal(taskPlan(null,input,ashley).ok,false);
  assert.equal(taskPlan(null,{...input,evidence:''},jacobe).error,'welllink_evidence_required');
  const first=taskPlan(null,input,jacobe);assert.equal(first.row.version,1);
  assert.equal(taskPlan(first.row,input,jacobe).error,'welllink_changed_refresh');
  assert.equal(taskPlan(first.row,{...input,version:1,status:'waiting'},damon).row.status,'waiting');
  assert.equal(rawSyncMutationAllowed({table:'welllink_tasks',op:'upsert',row:first.row}),false);
});
test('preparation does not activate ordering and uses executed term',()=>{
  const board=wellBoard([{id:'pricing',status:'complete',version:1}],jacobe);
  assert.equal(board.orderingEnabled,false);assert.equal(wellSource().contract.starts,'2026-06-01');assert.equal(wellSource().contract.ends,'2029-05-31');
  assert.equal(board.products.find(p=>p.size==='5 mL').crossReference,'BD 309646');
  assert.equal(board.tasks.find(t=>t.id==='rounding').canEdit,false);
  assert.equal(board.tasks.find(t=>t.id==='pricing').canEdit,true);
  assert.ok(board.documents.every(d=>!d.file));
});
test('download registry contains only packaged controlled sources',async()=>{
  for(const doc of WELL_DOCUMENTS){assert.match(doc.file,/^[a-z-]+\.(pdf|xlsx)$/);const bytes=await readWellDocument(doc.id,{getBlob:async(path,options)=>{assert.equal(path,`welllink/${doc.file}`);assert.equal(options.access,'private');return {statusCode:200,stream:new Response('synthetic file').body};}});assert.equal(bytes.toString(),'synthetic file');}
  assert.equal(WELL_DOCUMENTS.find(d=>d.id==='../../.env'),undefined);
  const vite=await readFile(new URL('../vite.config.js',import.meta.url),'utf8');assert.ok(vite.includes('**/server-assets/**'));
});

test('Darren can complete stock readiness without viewing commercial data',()=>{
 const darren={role:'warehouse_operator',email:'darren@unitemedical.net'};
 const board=wellBoard([],darren);
 assert.equal(board.commercial,false);assert.deepEqual(board.tasks.map(t=>t.id),['inventory']);
 assert.equal(board.documents.length,0);assert.ok(board.products.every(p=>p.size&&!p.unitPrice&&!p.oneCase));
 assert.equal(board.contract.terms,undefined);assert.equal(board.contract.fee,undefined);
 assert.equal(taskPlan(null,{id:'inventory',version:0,status:'complete',evidence:'QA stock review'},darren).ok,true);
 assert.equal(taskPlan(null,{id:'pricing',version:0,status:'open'},darren).ok,false);
 assert.equal(wellBoard([],{role:'customer'}),null);
});

test('follow-up dates reject impossible calendar dates and survive older clients',()=>{
  const input={id:'pricing',version:0,status:'in_progress',due_on:'2028-02-29'};
  const valid=taskPlan(null,input,jacobe);
  assert.equal(valid.ok,true);assert.equal(valid.row.due_on,'2028-02-29');
  for(const due_on of ['2027-02-29','2026-04-31','2026-13-01','2026-09-23T10:00:00Z','2019-01-01',false])assert.equal(taskPlan(null,{...input,due_on},jacobe).error,'welllink_invalid_due_date');
  assert.equal(taskPlan(valid.row,{id:'pricing',version:1,status:'waiting'},jacobe).row.due_on,'2028-02-29');
  assert.equal(taskPlan(valid.row,{id:'pricing',version:1,status:'waiting',due_on:null},jacobe).row.due_on,null);
});

test('write endpoint rejects cross-origin and non-JSON requests before database access',async()=>{
  for(const [headers,expected] of [[{'content-type':'text/plain'},415],[{'content-type':'application/json',origin:'https://evil.example',host:'staging.unitemedical.net'},403],[{'content-type':'application/json',origin:'null',host:'staging.unitemedical.net'},403]]){
    const response={headers:{},setHeader(key,value){this.headers[key]=value;},end(body){this.body=JSON.parse(body);}};
    await handler({method:'POST',headers},response);
    assert.equal(response.statusCode,expected);assert.equal(response.headers['Cache-Control'],'private, no-store');
  }
});

test('private documents reject unknown paths and missing storage',async()=>{await assert.rejects(readWellDocument('../../.env'),/document_not_found/);await assert.rejects(readWellDocument('master',{getBlob:async()=>null}),/document_unavailable/);});
