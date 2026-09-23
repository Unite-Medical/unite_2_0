import path from 'node:path';

const RAW_DATA_NAMES = /(^|\/)(customers?|orders?|transactions?|payouts?|customer[-_ ]?addresses?|tax[-_ ]?certificates?)[^/]*\.(csv|json|jsonl|xlsx|zip|pdf|png|jpe?g)$/i;
const CERTIFICATE_NAMES = /certificate[^/]*\.(pdf|png|jpe?g)$/i;

export function isForbiddenCustomerArtifact(filePath) {
  const normalized = String(filePath || '').replaceAll('\\', '/');
  if (/tests\/fixtures\/(synthetic|fake|sample)[^/]*\//i.test(`${normalized}/`)) return false;
  if (/tests\/fixtures\/(synthetic|fake|sample)[^/]*\.(csv|json|jsonl|xlsx)$/i.test(normalized)) return false;
  return RAW_DATA_NAMES.test(normalized) || CERTIFICATE_NAMES.test(path.basename(normalized));
}

export function assertStagingTarget(target) {
  if (String(target || '').trim().toLowerCase() !== 'staging') {
    throw new Error('customer migration is staging-only');
  }
}
