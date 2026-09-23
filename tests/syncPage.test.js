import test from 'node:test';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import {projectSyncPage} from '../api/_lib/syncPage.js';
const cutoff='2026-09-09T05:00:00.000Z';
test('sync pagination retains timestamp precision and counts every row exactly once',()=>{
 const rows=Array.from({length:501},(_,i)=>({tbl:'products',id:String(i),data:{id:String(i)},updated_at:'2026-09-09T04:00:00.123Z',cursor_at:'2026-09-09 04:00:00.123456+00'}));
 const first=projectSyncPage(rows,{cutoff});assert.equal(first.tables.products.length,500);
 assert.deepEqual(JSON.parse(Buffer.from(first.next_cursor,'base64url').toString()),{cutoff,at:rows[499].cursor_at,table:'products',id:'499'});
 const last=projectSyncPage(rows.slice(500),{cutoff});assert.equal(last.next_cursor,null);assert.equal(last.latest,cutoff);assert.equal(last.tables.products[0].id,'500');
});
test('sync never sends credential before-images or activation tokens to admin browsers',()=>{
 const rows=['profiles','activation_tokens','staging_before_images'].map(tbl=>({tbl,id:tbl,data:{id:tbl,password_hash:'secret',password_salt:'secret'},updated_at:cutoff,cursor_at:cutoff}));
 const result=projectSyncPage(rows,{cutoff});assert.deepEqual(result.tables,{profiles:[{id:'profiles'}]});
});
