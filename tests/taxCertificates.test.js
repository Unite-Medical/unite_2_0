import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { validateTaxCertificateFile, planTaxCertificateVersion } from '../api/_lib/taxCertificates.js';

const pdf=Buffer.from('%PDF-1.7\nsynthetic');

test('tax certificate validation accepts real magic bytes and rejects spoofed content',()=>{
  assert.equal(validateTaxCertificateFile({bytes:pdf,contentType:'application/pdf',size:pdf.length}).ok,true);
  assert.equal(validateTaxCertificateFile({bytes:Buffer.from('not a pdf'),contentType:'application/pdf',size:9}).reason,'file_signature_invalid');
  assert.equal(validateTaxCertificateFile({bytes:pdf,contentType:'text/plain',size:pdf.length}).reason,'content_type_not_allowed');
});

test('tax certificate upload enters quarantine and never blocks checkout',()=>{
  const plan=planTaxCertificateVersion({orgId:'org_1',uploaderId:'usr_1',pathname:'tax-certificates/org_1/file.pdf',bytes:pdf,contentType:'application/pdf',now:new Date('2026-08-26T00:00:00Z')});
  assert.equal(plan.ok,true);
  assert.equal(plan.version.scan_status,'quarantine_pending');
  assert.equal(plan.certificate.checkout_blocked,false);
  assert.equal('url' in plan.version,false);
});

test('tax certificate cannot be approved before a clean attributed scan',async()=>{
  const { planTaxCertificateReview } = await import('../api/_lib/taxCertificates.js');
  const version={id:'v1',scan_status:'quarantine_pending',review_status:'pending'};
  assert.equal(planTaxCertificateReview({version,action:'approve',actorId:'admin'}).reason,'clean_scan_required');
  const scanned=planTaxCertificateReview({version,action:'record_scan',scan_result:'clean',scan_evidence:'scanner-job-1',actorId:'admin'});
  assert.equal(scanned.ok,true);
  const approved=planTaxCertificateReview({version:scanned.version,action:'approve',actorId:'admin'});
  assert.equal(approved.ok,true);
  assert.equal(approved.version.review_status,'approved');
});
