import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planPublicInquiry} from '../api/_lib/publicInquiry.js';
const input={kind:'contact',idempotency_key:'contact-test-key-123',name:'QA Contact',email:'qa@example.test',reason:'Document request',message:'Please send the capability statement.',route_to_rep:false};
test('contact intake saves a durable request, task and owner notification with no company requirement',()=>{
 const result=planPublicInquiry(input,{ownerEmail:'support@unitemedical.net'});assert.equal(result.ok,true);assert.equal(result.inquiry.owner_name,'Support');assert.equal(result.inquiry.release_mode,'contact_request');assert.equal(result.task.owner_email,'support@unitemedical.net');assert.equal(result.outbox.to_address,'support@unitemedical.net');
 assert.equal(planPublicInquiry(input).inquiry.id,result.inquiry.id);assert.equal(planPublicInquiry(input).inquiry.request_hash,result.inquiry.request_hash);
 assert.notEqual(planPublicInquiry({...input,route_to_rep:true}).inquiry.request_hash,result.inquiry.request_hash);
});
test('contact intake rejects empty messages, unsupported reasons, bad identities and honeypots',()=>{
 for(const patch of [{message:' '},{reason:'arbitrary'},{email:'broken'},{name:''},{website_confirm:'bot'}])assert.equal(planPublicInquiry({...input,...patch}).ok,false);
});
