// Delayed responses are held by a gate, not an arbitrary timing threshold.
// API requests are fully isolated; this test never writes to a real account.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const base=process.env.COMMERCE_PREVIEW_URL||'http://127.0.0.1:4187';
try{
 for(const scenario of ['pending-session','pending-admin-sync','protected-session','login-session']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let release,blocked=false;const gate=new Promise(resolve=>{release=resolve});
  await page.route('**/api/**',async r=>{
   const path=new URL(r.request().url()).pathname;
   const reply=body=>r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   if(path==='/api/auth/session'){
    if(scenario!=='pending-admin-sync'){blocked=true;await gate;}
    return reply({session:scenario==='pending-admin-sync'?{user_id:'qa-admin',email:'qa@example.com',role:'admin'}:null});
   }
   if(path==='/api/health')return reply({services:{postgres:{configured:true}}});
   if(path==='/api/db/sync'){blocked=true;await gate;return reply({row_count:0,tables:{}});}
   return reply({ok:true,rows:[]});
  });
  await page.goto(base+(scenario==='protected-session'?'/admin':scenario==='login-session'?'/login':'/catalog'),{waitUntil:'domcontentloaded'});
  if(scenario==='protected-session'||scenario==='login-session'){
   await page.getByRole('status').filter({hasText:'LOADING'}).waitFor();
   assert.equal(new URL(page.url()).pathname,scenario==='protected-session'?'/admin':'/login');
   assert.equal(await page.getByRole('heading',{name:'Welcome back.'}).count(),0);
  }else{
   await page.locator('.uc-product').first().waitFor();assert.equal(await page.locator('.uc-product').count(),118);
   await page.getByRole('textbox',{name:'Search products',exact:true}).fill('impossible-no-match');
   await page.getByRole('heading',{name:'No products found.'}).waitFor();
  }
  // The catalog remains interactive before the account response is released.
  assert(blocked,scenario);release();
  if(scenario==='protected-session'){await page.waitForURL('**/login?next=**');await page.getByRole('heading',{name:'Welcome back.'}).waitFor();}
  if(scenario==='login-session')await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: public catalog interactive while session/admin sync are pending; private workspace waits before redirecting.');
}finally{await browser.close();}
