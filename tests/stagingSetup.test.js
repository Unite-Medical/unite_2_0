import test from 'node:test';
import assert from 'node:assert/strict';
import { stagingSetupAllowed,validateStagingRows } from '../api/internal/staging-setup.js';
test('staging setup rejects production, absent credentials and wrong credentials',()=>{
  assert.equal(stagingSetupAllowed('production','secret','secret'),false);
  assert.equal(stagingSetupAllowed('staging','',''),false);
  assert.equal(stagingSetupAllowed('staging','secret','wrong'),false);
  assert.equal(stagingSetupAllowed('staging','secret','secret'),true);
});
test('staging import rejects privileged customer profiles and operational order writes',()=>{
  const run='shopify_20260908_abcdef123456';
  const row={table:'profiles',id:'p',data:{id:'p',role:'admin',status:'pending_activation',staging_import_run:run}};
  assert.throws(()=>validateStagingRows([row],run),/invalid_customer_profile/);
  assert.throws(()=>validateStagingRows([{...row,table:'orders'}],run),/invalid_row/);
  row.data.role='customer';assert.equal(validateStagingRows([row],run).length,1);
  assert.throws(()=>validateStagingRows([row,row],run),/duplicate_row/);
});
