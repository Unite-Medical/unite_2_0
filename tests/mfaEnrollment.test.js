import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserQRCodeSvgWriter} from '@zxing/browser';
import {BitMatrix,QRCodeReader} from '@zxing/library';
import {mfaEnrollmentUri} from '../src/lib/mfaEnrollment.js';
const synthetic={setup_key:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',issuer:'Unite Medical',account:'synthetic+finance@example.test'};
test('authenticator URI uses the existing SHA1 six-digit 30-second policy and exact account identity',()=>{
 const uri=new URL(mfaEnrollmentUri(synthetic));
 assert.equal(uri.protocol,'otpauth:');assert.equal(uri.hostname,'totp');assert.equal(decodeURIComponent(uri.pathname),'/Unite Medical:synthetic+finance@example.test');
 assert.equal(uri.searchParams.get('issuer'),synthetic.issuer);assert.equal(uri.searchParams.get('secret'),synthetic.setup_key);assert.equal(uri.searchParams.get('algorithm'),'SHA1');assert.equal(uri.searchParams.get('digits'),'6');assert.equal(uri.searchParams.get('period'),'30');
 assert.equal(new URL(mfaEnrollmentUri({...synthetic,account:'synthetic&other@example.test'})).searchParams.size,5);
});
test('invalid enrollment produces only a generic error without echoing enrollment data',()=>{
 for(const enrollment of [{},{...synthetic,setup_key:'invalid key'},{...synthetic,account:''},{...synthetic,issuer:' '.repeat(2)}]){
  assert.throws(()=>mfaEnrollmentUri(enrollment),{message:'Authenticator setup is unavailable. Sign in again.'});
 }
});
test('locally generated SVG QR decodes to the exact synthetic authenticator URI with a quiet zone',()=>{
 const original=globalThis.document;
 globalThis.document={createElementNS(_ns,tag){return {tag,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=v;},appendChild(child){this.children.push(child);}};}};
 try{
  const uri=mfaEnrollmentUri(synthetic),svg=new BrowserQRCodeSvgWriter().write(uri,256,256),rects=svg.children;
  assert.equal(svg.tag,'svg');assert.equal(svg.attrs.width,'256');assert.ok(rects.length>100);
  const scale=Number(rects[0].attrs.width),left=Math.min(...rects.map(r=>Number(r.attrs.x))),top=Math.min(...rects.map(r=>Number(r.attrs.y))),right=Math.max(...rects.map(r=>Number(r.attrs.x))),size=(right-left)/scale+1;
  assert.ok(left>=4*scale);assert.ok(top>=4*scale);
  const matrix=new BitMatrix(size);for(const r of rects)matrix.set((Number(r.attrs.x)-left)/scale,(Number(r.attrs.y)-top)/scale);
  const decoded=new QRCodeReader().getDecoder().decodeBitMatrix(matrix).getText();assert.equal(decoded,uri);
  assert.equal(JSON.stringify(svg).includes(synthetic.setup_key),false);
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
