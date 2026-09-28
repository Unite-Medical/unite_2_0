import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceTextSegment, evidenceDownloadBlob, EVIDENCE_TEXT_CHUNK } from '../src/lib/inventoryEvidenceFiles.js';
const bundle = {version:1,started_at:'2026-09-28',datasets:{qbo_pos:{complete:true,errors:[],pages:[{records:[{Id:'1',description:'x'.repeat(200000)}],has_more:false}]}},finished_at:'2026-09-28'};
test('display segments are bounded and reconstruct the original page without loss',()=>{
 const first=evidenceTextSegment(bundle,'qbo_pos',0,0);assert.equal(first.text.length,EVIDENCE_TEXT_CHUNK);
 let text='';for(let i=0;i<first.segments;i++)text+=evidenceTextSegment(bundle,'qbo_pos',0,i).text;
 assert.deepEqual(JSON.parse(text),bundle.datasets.qbo_pos.pages[0]);
 assert.equal(JSON.parse(evidenceTextSegment(bundle).text).datasets.qbo_pos.record_count,1);
});
test('incremental download retains all metadata and records while yielding between pages',async()=>{
 let yields=0;const blob=await evidenceDownloadBlob(bundle,{yieldToUi:async()=>{yields++;}});
 assert.equal(yields,1);assert.deepEqual(JSON.parse(await blob.text()),bundle);
 const empty={...bundle,datasets:{}};assert.deepEqual(JSON.parse(await(await evidenceDownloadBlob(empty)).text()),empty);
});
