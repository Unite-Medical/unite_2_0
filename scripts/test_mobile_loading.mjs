// Isolated browser regression: serve the build on the staging origin without
// contacting staging APIs, Intercom, or any account. Tests real loaded resources.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {readFile,stat,mkdir} from 'node:fs/promises';import path from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});const origin='https://staging.unitemedical.net';
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2});const page=await context.newPage(),requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async r=>{
  const u=new URL(r.request().url());
  if(u.hostname==='widget.intercom.io')return r.fulfill({contentType:'application/javascript',body:'window.__chatCalls = window.Intercom.q.slice(); window.Intercom = (...args) => window.__chatCalls.push(args);'});
  if(u.origin!==origin)return r.abort();
  if(u.pathname.startsWith('/api/'))return r.fulfill({contentType:'application/json',body:JSON.stringify({session:null,ok:true,rows:[]})});
  let file=path.join(process.cwd(),'dist',decodeURIComponent(u.pathname));try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{file=path.join(process.cwd(),'dist/index.html');}
  const ext=path.extname(file);const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};
  return r.fulfill({contentType:types[ext]||'application/octet-stream',body:await readFile(file)});
 });
 await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#hero-title').waitFor();
 assert(await page.locator('.uf-hero-poster').evaluate(i=>i.complete&&i.naturalWidth>0&&i.currentSrc.includes('mobile-v1/home-hero')));
 assert.equal(await page.locator('.uf-hero video').getAttribute('src'),null,'phone must not download video before play');
 assert(!requests.some(u=>/intercom|ScrollTrigger|gsap/i.test(u)),'optional SDKs must not compete with first paint');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await mkdir('artifacts/mobile-optimization',{recursive:true});await page.screenshot({path:'artifacts/mobile-optimization/home-mobile.png'});
 const controls=await page.evaluate(()=>{const a=document.querySelector('.uf-film-toggle').getBoundingClientRect(),b=document.querySelector('.um-chat-launcher').getBoundingClientRect();return {overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};});assert.equal(controls.overlap,false,'chat must not cover mobile video controls');
 await page.getByRole('button',{name:'Chat with Unite',exact:true}).click();await page.waitForFunction(()=>window.__chatCalls?.some(args=>args[0]==='show'));assert(requests.some(u=>u.includes('widget.intercom.io')));
 await page.getByRole('button',{name:'Play background video',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.uf-hero video')?.getAttribute('src')?.includes('720.mp4'));
 await page.goto(origin+'/robotics');await page.locator('#robotics-title').waitFor();assert(await page.locator('.ur-hero-film img').evaluate(i=>i.currentSrc.includes('mobile-v1/robotics-system')));
 assert.equal(await page.locator('.ur-hero-film video').count(),0);await page.screenshot({path:'artifacts/mobile-optimization/robotics-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});await page.goto(origin);await page.waitForFunction(()=>document.querySelector('.uf-hero video')?.getAttribute('src')?.includes('1080.mp4'));await page.waitForFunction(()=>document.querySelector('.uf-hero-media')?.style.transform?.includes('translate'));
 assert.deepEqual(errors,[]);console.log('PASS: mobile hero paints with optimized image; no autoplay or animation/chat SDK at startup; explicit play and chat work; Robotics poster; no overflow or runtime errors.');
}finally{await browser.close();}
