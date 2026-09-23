import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {Readable} from 'node:stream';
import crypto from 'node:crypto';
import {reviewedPackingOption} from '../api/admin/packing.js';
import {quoteDeliveryFingerprint,quoteDeliveryValid} from '../api/_lib/quoteDelivery.js';
import {scannerHandler} from '../scripts/document-scanner.mjs';
import {buildOperationsDesk} from '../api/_lib/operationsDesk.js';
import {planOrderApproval} from '../api/_lib/orderApproval.js';
import {validateExtraction} from '../api/_lib/documentProcessing.js';
import {validateEstimate,estimateBinding} from '../api/_lib/checkoutEstimate.js';
const env={UNITE_SHIP_FROM_STREET:'1 Test Warehouse',UNITE_SHIP_FROM_CITY:'Atlanta',UNITE_SHIP_FROM_STATE:'GA',UNITE_SHIP_FROM_ZIP:'30303'};
const form={freight:'25',tax:'0',length:'10',width:'10',height:'10',weight:'5',carrier:'fedex',service:'fedex_ground',shipping_evidence:'Reviewed carrier quote, plus agreed handling',tax_evidence:'Preserved customer exemption'};
test('reviewed packing requires explicit totals, actual origin, and exemption consistency',()=>{
 const draft={order:{subtotal:100,tax_exempt_basis:true}};
 assert.equal(reviewedPackingOption(form,draft,{}).reason,'shipping_origin_not_configured');
 assert.equal(reviewedPackingOption({...form,tax:''},draft,env).reason,'freight_and_tax_required');
 assert.equal(reviewedPackingOption({...form,tax:'5'},draft,env).reason,'preserved_exemption_requires_review');
 const plan=reviewedPackingOption(form,draft,env);assert.equal(plan.option.total,125);assert.equal(plan.option.ship_from.postalCode,'30303');
});
test('delivered quote review expires and binds individual lines even when subtotal is unchanged',()=>{
 const items=[{id:'a',sku:'SKU-A',qty:2,unit_price:50,ext_price:100}];
 const quote={id:'Q',customer_id:'O',subtotal:100,shipping_cost:25,tax:0,total:125,totals_verified:true,delivery_review:{actor_id:'admin',expires_at:'2027-01-01T00:00:00Z',address:{zip:'30303'}}};quote.delivery_review.fingerprint=quoteDeliveryFingerprint(quote,items);
 assert.equal(quoteDeliveryValid(quote,items,Date.parse('2026-09-09')),true);
 assert.equal(quoteDeliveryValid(quote,[{...items[0],qty:4,unit_price:25}],Date.parse('2026-09-09')),false);
 assert.equal(quoteDeliveryValid(quote,items,Date.parse('2027-01-02')),false);
});
test('changed approved orders reappear in Damon decision queue',()=>{
 const approved=planOrderApproval({order:{id:'O',total:12000,status:'payment_pending'},actor:{role:'admin',email:'damon@unitemedical.net',user_id:'D'},action:'approve',reason:'Reviewed'}).order;
 assert.equal(buildOperationsDesk({orders:[approved]}).length,0);
 const desk=buildOperationsDesk({orders:[{...approved,total:13000}]});assert.equal(desk[0].kind,'approval');assert.equal(desk[0].owner_email,'damon@unitemedical.net');
});
test('invalid calendar dates and corrupt estimate expirations fail review',()=>{
 assert.ok(validateExtraction({expiration_date:'2026-02-30'}).flags.includes('invalid_expiration_date'));
 const draft={order:{customer_id:'x'},address:{},lines:[]};assert.equal(validateEstimate({binding:estimateBinding(draft),expires_at:'bad',options:[{id:'a'}]},draft,'a').ok,false);
});
async function invokeScanner({authorization,hash,scan}){
 const bytes=Buffer.from('harmless test document');const handler=scannerHandler({token:'x'.repeat(32),scan});const req=Readable.from([bytes]);req.method='POST';req.url='/scan';req.headers={authorization,'x-content-sha256':hash};let status,body;
 await handler(req,{writeHead:s=>{status=s;},end:b=>{body=JSON.parse(b);}});return {status,body};
}
test('scanner rejects unauthorized and modified documents before invoking engine',async()=>{
 const scan=()=>{throw new Error('must not scan');};
 assert.equal((await invokeScanner({authorization:'Bearer wrong',hash:'bad',scan})).status,401);
 assert.equal((await invokeScanner({authorization:'Bearer '+'x'.repeat(32),hash:'bad',scan})).status,400);
});
test('scanner keeps failed scans unavailable and returns clean evidence only from the engine',async()=>{
 const args={authorization:'Bearer '+'x'.repeat(32),hash:crypto.createHash('sha256').update('harmless test document').digest('hex')};
 assert.equal((await invokeScanner({...args,scan:()=>{throw new Error('engine unavailable');}})).status,503);
 const result=await invokeScanner({...args,scan:async()=>({result:'clean',sha256:args.hash,engine:'test engine',signature_version:'fixture'})});assert.equal(result.status,200);assert.equal(result.body.sha256,args.hash);
});
