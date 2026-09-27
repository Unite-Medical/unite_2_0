import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingChatTurn,reconcileChatItems,chatTurns,chatHref} from '../src/lib/commerceChatState.js';
const message=(id,role,text,extra={})=>({id,type:'message',role,content:[{text}],...extra});
const old=[message('u1','user','Find Jon'),message('a1','assistant','Found Jon')];
const pending=pendingChatTurn(old,'Show his orders','local');
const optimistic=message('local','user','Show his orders');
test('stale idle snapshots retain the submitted follow-up and keep waiting',()=>{const result=reconcileChatItems([...old,optimistic],old,pending);assert.equal(result.awaitingReply,true);assert.deepEqual(result.items,[...old,optimistic]);});
test('acknowledgement replaces the optimistic message exactly once without finishing the turn',()=>{const remote=[...old,message('u2','user','Show his orders')];const result=reconcileChatItems([...old,optimistic],remote,pending);assert.equal(result.awaitingReply,true);assert.deepEqual(result.items,remote);assert.deepEqual(reconcileChatItems(result.items,remote,pending).items,remote);});
test('only a completed answer after the new message completes its turn',()=>{const remote=[...old,message('u2','user','Show his orders')];for(const extra of [{phase:'commentary'},{status:'in_progress'}])assert.equal(reconcileChatItems(old,[...remote,message('a2','assistant','Checking',extra)],pending).awaitingReply,true);assert.equal(reconcileChatItems(old,[...remote,message('a2','assistant','Three orders',{status:'completed'})],pending).awaitingReply,false);});
test('repeating an earlier prompt does not acknowledge the new turn with the old message',()=>{const repeat=pendingChatTurn(old,'Find Jon','local');assert.equal(reconcileChatItems(old,old,repeat).awaitingReply,true);});
test('short or temporarily empty snapshots do not erase loaded history',()=>{assert.deepEqual(reconcileChatItems(old,[],null).items,old);assert.deepEqual(reconcileChatItems(old,[old[1]],null).items,old);});
test('files and activity remain with their original answer after a follow-up and reload',()=>{
 const items=[message('u1','user','Export',{turn_id:'t1'}),{type:'tool_activity',id:'file1',turn_id:'t1'},message('a1','assistant','Your file is ready',{turn_id:'t1'}),message('u2','user','Export',{turn_id:'t2'}),message('p2','assistant','Checking the current records',{turn_id:'t2',phase:'commentary'}),message('a2','assistant','Updated file',{turn_id:'t2'})];
 const grouped=chatTurns(items,[{id:'file1'},{id:'file2',turn_id:'t2'}],[{id:'step2',turn_id:'t2',status:'complete'}]);
 assert.deepEqual(grouped.turns.map(t=>t.cards.map(c=>c.id)),[['file1'],['file2']]);assert.equal(grouped.turns[1].progress.length,1);assert.equal(grouped.turns[1].messages.length,1);assert.equal(grouped.turns[1].steps.length,1);
});
test('unattributed legacy files remain available without being assigned to the latest reply',()=>{const result=chatTurns(old,[{id:'older-file'}]);assert.equal(result.earlier.cards.length,1);assert.equal(result.turns[0].cards.length,0);});
test('research citations work while unsafe link schemes and embedded credentials are rejected',()=>{
 assert.equal(chatHref('https://acomedsupply.com/pages/products'),'https://acomedsupply.com/pages/products');assert.equal(chatHref('/admin/customers/123'),'/admin/customers/123');
 for(const link of ['javascript:alert(1)','data:text/html,hi','//evil.test','https://secret@example.com','/admin/../../api/secrets'])assert.equal(chatHref(link),'');
});
