import test from 'node:test';
import assert from 'node:assert/strict';

test('temporary refresh failures retain a validated session; 401 signs out; sync 403 does not',async()=>{
 const original={window:globalThis.window,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 const memory=new Map();globalThis.window=new EventTarget();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear()};
 let remote;
 try{
  const {auth}=await import('../src/lib/auth.js');remote=await import('../src/lib/remoteDb.js');
  const session={user_id:'admin-test',email:'admin@example.com',role:'admin'};
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({session})});assert.deepEqual(await auth.bootstrap(),session);
  globalThis.fetch=async()=>({ok:false,status:503});assert.deepEqual(await auth.bootstrap(),session);
  let lost=0;window.addEventListener('um:authorization-lost',()=>lost++);
  globalThis.fetch=async url=>String(url).endsWith('/health')?{ok:true,json:async()=>({services:{postgres:{configured:true}}})}:{ok:false,status:403};
  await remote.startRemoteDb({session});assert.equal(lost,0);assert.deepEqual(auth.current(),session);assert.equal(remote.remoteDbStatus().enabled,false);
  globalThis.fetch=async()=>({ok:false,status:401});assert.equal(await auth.bootstrap(),null);
 }finally{remote?.stopRemoteDb();for(const [key,value] of Object.entries(original)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
