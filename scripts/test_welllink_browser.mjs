import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {planWellRequest} from '../api/_lib/welllinkIntake.js';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const base=process.env.COMMERCE_PREVIEW_URL||'http://127.0.0.1:4187';
const output=fileURLToPath(new URL('../artifacts/welllink-review/',import.meta.url));await mkdir(output,{recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const requests=[];let failing=false;
await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 if(path==='/api/welllink/requests'&&route.request().method()==='POST'){
  const input=route.request().postDataJSON();requests.push(input);
  if(failing)return reply({error:'welllink_unavailable'},503);
  const plan=planWellRequest(input);
  return plan.ok?reply({ok:true,request:{id:plan.request.id,status:'requested'}},201):reply({error:plan.error},400);
 }
 return reply({ok:true,session:null,rows:[]});
});
try{
 await page.goto(`${base}/welllink?utm_source=welllink&utm_campaign=welllink_cc_ns_0052`);
 await page.getByRole('heading',{name:'Standard Luer Lock syringes. For WellLink members.',exact:true}).waitFor();
 assert.equal(await page.locator('.wm-product-grid article').count(),6);
 const body=await page.locator('main').innerText();assert(!body.includes('$'));assert(!body.includes('2029'));assert(body.includes('BD 309646'));
 await page.screenshot({path:`${output}/welllink-desktop.png`});
 await page.getByRole('link',{name:'Member sign in',exact:false}).click();await page.waitForURL('**/login?next=**');
 assert(new URL(page.url()).searchParams.get('next').startsWith('/welllink'));
 await page.goto(`${base}/welllink`);
 const form=page.locator('.us-request-form');
 for(const [label,value] of [['Your name','QA Buyer'],['Job title','Purchasing'],['Work email','qa@unitemedical.net'],['Organization / parent organization','QA TEST — no fulfillment'],['Facility name','QA facility'],['Ship-to street address','1 Test Way'],['City','Atlanta'],['State','GA'],['ZIP code','30303']])await form.getByLabel(label,{exact:true}).fill(value);
 await form.getByRole('checkbox',{name:/I’m authorized to request information/}).check();
 failing=true;await form.getByRole('button',{name:'Request WellLink access'}).click();await page.getByRole('alert').waitFor();
 const first=requests.at(-1);assert.equal(first.marketing_opt_in,false);assert.equal(first.referral.utm_source,'welllink');
 assert.equal(await form.getByLabel('Facility name',{exact:true}).inputValue(),'QA facility');
 failing=false;await form.getByRole('button',{name:'Request WellLink access'}).click();await page.getByRole('heading',{name:'Your next step is with us.'}).waitFor();assert.equal(requests.at(-1).idempotency_key,first.idempotency_key);
 await page.getByRole('button',{name:'Start another request'}).click();
 await page.getByRole('button',{name:'Sample box',exact:true}).click();
 await form.getByRole('button',{name:'Send sample request'}).click();await page.getByRole('alert').filter({hasText:'Select at least one'}).waitFor();
 await form.getByRole('checkbox',{name:'5 mL 21IN-0503000010-B',exact:true}).check();
 await form.getByLabel('Shipping arrangement').selectOption('UPS');
 await form.getByLabel('Carrier account number (optional)').fill('SYNTHETIC-ACCOUNT');
 const before=requests.length;await form.getByRole('button',{name:'Send sample request'}).click();assert.equal(requests.length,before);
 await form.getByRole('checkbox',{name:/authorize shipping charges/}).check();
 await form.getByRole('button',{name:'Send sample request'}).click();await page.getByRole('heading',{name:'Your next step is with us.'}).waitFor();
 assert.deepEqual(requests.at(-1).skus,['21IN-0503000010-B']);assert.equal(requests.at(-1).carrier_authorization,true);
 await page.getByRole('button',{name:'Start another request'}).click();await page.getByRole('button',{name:'Contract quote',exact:true}).click();
 await form.getByRole('checkbox',{name:'5 mL 21IN-0503000010-C',exact:true}).check();
 await form.getByLabel('Cases per selected size').fill('2');
 await form.getByRole('button',{name:'Request contract pricing',exact:false}).click();await page.getByRole('heading',{name:'Your next step is with us.'}).waitFor();
 assert.equal(planWellRequest(requests.at(-1)).request.case_quantities['21IN-0503000010-C'],2);
 for(const width of [360,390,768,1024,1440]){
  await page.setViewportSize({width,height:900});await page.goto(`${base}/welllink`);await page.locator('.wm-product-grid article').first().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
  if(width===390)await page.screenshot({path:`${output}/welllink-mobile.png`,fullPage:true});
 }
 await page.screenshot({path:`${output}/welllink-full-desktop.png`,fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: six public case SKUs, no prices/dates, sign-in destination, referrals, access validation, retry identity, sample box/shipping authorization, whole-case quotes, 360–1440px. All API writes isolated.');
}finally{await browser.close();}
