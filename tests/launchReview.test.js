import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv,reviewShopifyCsv } from '../src/lib/shopifyFileReview.js';
import { currentMonthOrders,operationQueues } from '../src/lib/operationsSummary.js';
import { planTaxCertificateVersion } from '../api/_lib/taxCertificates.js';

test('CSV preflight preserves quoted multiline fields, BOM, escaped quotes and trailing cells',()=>{
 const parsed=parseCsv('\uFEFFA,B,C\r\n"one\nline","say ""hi""",\r\n');
 assert.deepEqual(parsed.rows,[{A:'one\nline',B:'say "hi"',C:''}]);
 assert.throws(()=>parseCsv('A,B\n"unfinished,x'),/quoted field/);
 assert.throws(()=>parseCsv('A,B\na,b,c'),/extra columns/);
});
test('product review counts products rather than image rows and flags duplicate SKU/invalid price',()=>{
 const r=reviewShopifyCsv('Handle,Variant SKU,Option1 Value,Variant Price\none,A,Large,20\none,,,\ntwo,A,Small,0','products');
 assert.equal(r.count,2);assert.equal(r.issues.find(i=>i.message.includes('duplicate')).count,1);assert.equal(r.issues.find(i=>i.message.includes('prices')).count,1);
});
test('inventory review distinguishes locations and rejects product-only exports',()=>{
 const r=reviewShopifyCsv('SKU,Location,On hand (current)\na,Unite,2\na,CATO,0\na,Unite,-1','inventory');
 assert.equal(r.issues.find(i=>i.message.includes('repeated')).count,1);
 assert.equal(r.issues.find(i=>i.message.includes('negative')).count,1);
 assert.throws(()=>reviewShopifyCsv('Handle,Variant SKU\none,a','inventory'),/location inventory/);
});
test('customer review flags missing IDs, emails and exemption columns without retaining personal rows',()=>{
 const r=reviewShopifyCsv('First Name,Email\nA,\nB,noreply@example.com','customers');
 assert.equal(r.count,2);assert.equal(r.issues.length,4);assert.equal(r.rows,2);assert.ok(!JSON.stringify(r).includes('noreply@example.com'));
});
test('order count does not count each line as a separate order',()=>{
 const r=reviewShopifyCsv('Name,Lineitem quantity\n#1,1\n#1,2\n#2,1','orders');assert.equal(r.count,2);
});
test('monthly totals exclude same month from a previous year',()=>{
 assert.equal(currentMonthOrders([{placed_at:'2025-09-02'},{placed_at:'2026-09-02'}],new Date('2026-09-08')).length,1);
 assert.equal(operationQueues({orders:[{status:'delivered'},{status:'pending_shopify_ack'}]}).orders,1);
});
test('identical certificate bytes cannot collide between organizations',()=>{
 const args={uploaderId:'user',bytes:Buffer.from('%PDF-test'),contentType:'application/pdf'};
 const a=planTaxCertificateVersion({...args,orgId:'a',pathname:'tax-certificates/a/one.pdf'});
 const b=planTaxCertificateVersion({...args,orgId:'b',pathname:'tax-certificates/b/one.pdf'});
 assert.notEqual(a.version.id,b.version.id);
});

test('inventory review accepts not stocked and uses current quantities, never proposed quantities',()=>{
 const r=reviewShopifyCsv('SKU,Location,On hand (new),On hand (current)\nA,Main,99,Not stocked\nB,Main,99,2.5','inventory');
 assert.equal(r.issues.find(i=>i.message.includes('not stocked')).count,1);
 assert.equal(r.issues.find(i=>i.message.includes('missing or invalid')).count,1);
});
