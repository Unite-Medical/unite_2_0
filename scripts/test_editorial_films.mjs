import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
const base=process.env.COMMERCE_PREVIEW_URL||'http://127.0.0.1:4187';
const output='artifacts/editorial-films';await mkdir(output,{recursive:true});
const errors=[];
async function newPage(options={}){const p=await browser.newPage({viewport:{width:1440,height:960},...options});p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,session:null,rows:[]})}));return p;}
try{
 for(const path of ['/welllink','/case-studies/tjs']){
  const p=await newPage();const name=path.endsWith('tjs')?'tjs':'welllink';
  await p.goto(base+path);await p.locator('.ed-film h1').waitFor();
  await p.waitForFunction(()=>{const v=document.querySelector('.ed-film video');return v?.readyState>=2&&v.duration>0;});
  assert(await p.locator('.ed-film img').evaluate(i=>i.complete&&i.naturalWidth>0));
  await p.screenshot({path:`${output}/${name}-desktop.png`});
  const distance=await p.locator('.ed-film').evaluate(e=>e.offsetHeight-innerHeight);
  await p.evaluate(y=>scrollTo({top:y,behavior:'instant'}),distance*.75);
  await p.waitForFunction(()=>document.querySelector('.ed-film video').currentTime>4.8);
  const forward=await p.locator('.ed-film video').evaluate(v=>v.currentTime);
  assert(await p.locator('.ed-film-stage').evaluate(e=>Math.abs(e.getBoundingClientRect().top)<2),'film stage must stay pinned in the viewport while scrubbing');
  await p.screenshot({path:`${output}/${name}-scroll.png`});
  await p.evaluate(y=>scrollTo({top:y,behavior:'instant'}),distance*.18);
  await p.waitForFunction(()=>document.querySelector('.ed-film video').currentTime<2);
  assert(forward>await p.locator('.ed-film video').evaluate(v=>v.currentTime),'video should reverse when scrolling up');
  assert(await p.locator('.ed-film video').evaluate(v=>v.paused&&v.muted),'scroll video must remain paused and silent');
  if(name==='tjs'){
   await p.getByRole('link',{name:'Explore the case study',exact:true}).click();
   await p.getByRole('region',{name:'First 90 days results'}).waitFor();
   assert((await p.locator('.tjs-stat-grid').innerText()).includes('+43%'));
   await p.locator('.tjs-store').evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await p.waitForFunction(()=>document.querySelector('.tjs-store img').naturalWidth>0&&Number(getComputedStyle(document.querySelector('.tjs-store')).opacity)>.99);
   assert.equal(await p.locator('.tjs-operations article').count(),4);
   await p.screenshot({path:`${output}/tjs-store.png`});
  } else {
   await p.locator('.wm-product-grid').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
   await p.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.wm-products')).opacity)>.99);
   await p.screenshot({path:`${output}/welllink-products.png`});
  }
  for(const width of [360,390,768,1024,1440]){
   await p.setViewportSize({width,height:900});await p.goto(base+path);await p.locator('.ed-film h1').waitFor();
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${path}: overflow at ${width}`);
   if(width===390){await p.screenshot({path:`${output}/${name}-mobile.png`});await p.evaluate(()=>scrollTo({top:700,behavior:'instant'}));await p.waitForFunction(()=>document.querySelector('.ed-film video')?.currentTime>2);}
  }
  await p.close();
  const reduced=await newPage({reducedMotion:'reduce'});await reduced.goto(base+path);await reduced.locator('.ed-film.is-static').waitFor();assert.equal(await reduced.locator('.ed-film video').count(),0);assert(await reduced.locator('.ed-film').evaluate(e=>e.offsetHeight<innerHeight*1.1));await reduced.close();
  const failure=await newPage();await failure.route('**/*-scroll.mp4',r=>r.abort());await failure.goto(base+path);await failure.locator('.ed-film.is-static').waitFor();assert(await failure.locator('.ed-film img').isVisible());await failure.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS: both films load and scrub forward/reverse; paused/silent; mobile motion; 360–1440px without overflow; reduced-motion and network-error poster fallback; TJS results, real store image and links.');
}finally{await browser.close();}
