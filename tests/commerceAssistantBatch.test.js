import test from 'node:test';
import assert from 'node:assert/strict';
import {executePending} from '../api/admin/commerce-assistant.js';

function fixture(count){
 const receipts=new Map(),runs=[],sent=[];
 const sql=async (parts,...values)=>{
  const query=parts.join('?');
  if(query.startsWith('SELECT'))return receipts.has(values[0])?[{data:structuredClone(receipts.get(values[0]))}]:[];
  if(query.startsWith('INSERT')){if(receipts.has(values[0]))return [];receipts.set(values[0],JSON.parse(values[1]));return [{id:values[0]}];}
  if(query.startsWith('UPDATE')){receipts.set(values[1],JSON.parse(values[0]));return [];}
  throw new Error('Unexpected query');
 };
 const session={id:'batch-session',required_actions:Array.from({length:count},(_,i)=>({type:'function_call',turn_id:'turn',call_id:'call-'+i,name:'read_bi_data',arguments:'{"topic":"inventory"}'}))};
 const deps={runTool:async(_sql,action)=>{runs.push(action.call_id);return {ready:true};},sendResult:async(_path,body)=>{sent.push(body.events[0].call_id);return {};}};
 return {sql,session,actor:{user_id:'admin'},deps,receipts,runs,sent};
}

test('parallel batches larger than four progress past acknowledged actions retained by the provider',async()=>{
 const f=fixture(7);
 await executePending(f.sql,f.session,f.actor,f.deps);
 assert.equal(f.runs.length,4);assert.equal(f.sent.length,4);
 await executePending(f.sql,f.session,f.actor,f.deps);
 assert.equal(f.runs.length,7);assert.equal(f.sent.length,7);
 await executePending(f.sql,f.session,f.actor,f.deps);
 assert.equal(f.runs.length,7);assert.equal(f.sent.length,7);
 assert.ok([...f.receipts.values()].every(r=>r.status==='complete'&&r.submitted_at));
});

test('a failed result submission retries the stored outcome without rerunning the tool',async()=>{
 const f=fixture(1);let fail=true;
 const sendResult=async(...args)=>{if(fail){fail=false;throw new Error('temporary provider failure');}return f.deps.sendResult(...args);};
 await assert.rejects(executePending(f.sql,f.session,f.actor,{...f.deps,sendResult}),/temporary provider failure/);
 assert.equal(f.runs.length,1);assert.equal(f.sent.length,0);
 assert.equal([...f.receipts.values()][0].submitted_at,undefined);
 await executePending(f.sql,f.session,f.actor,{...f.deps,sendResult});
 assert.equal(f.runs.length,1);assert.equal(f.sent.length,1);
});
