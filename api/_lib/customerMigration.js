import crypto from 'node:crypto';
import { buildMigratedCustomer } from '../../src/lib/customerMigrationPolicy.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}
function row(table, id, data) { return { table, id, data: { id, ...data } }; }

export function planCustomerMigrationBatch({ run_id, source_sha256, customers } = {}) {
  const runId = String(run_id || '').trim();
  if (!runId) throw new Error('migration run ID required');
  if (!/^[a-f0-9]{64}$/i.test(String(source_sha256 || ''))) throw new Error('valid source SHA-256 required');
  if (!Array.isArray(customers) || customers.length > 100) throw new Error('customer batch must contain at most 100 records');
  const seen = new Set();
  const rows = [];
  const summary = { customers: 0, profiles: 0, addresses: 0, activation_eligible: 0, activation_holds: 0, pricing_holds: 0 };
  for (const input of customers) {
    const source = input?.source || input;
    const customerId = String(source?.['Customer ID'] ?? source?.legacyResourceId ?? '').trim();
    if (!customerId) throw new Error('Shopify customer ID required');
    if (seen.has(customerId)) throw new Error(`duplicate Shopify customer ID: ${customerId}`);
    seen.add(customerId);
    const mapped = buildMigratedCustomer(source, {
      addresses: input?.addresses || [], certificate_status: input?.certificate_status || 'missing',
      contract_prices: input?.contract_prices || null,
    });
    summary.customers += 1;
    summary.addresses += mapped.addresses.length;
    summary.pricing_holds += mapped.pricing.launch_blocker ? 1 : 0;
    summary.activation_eligible += mapped.profile ? 1 : 0;
    summary.activation_holds += mapped.profile ? 0 : 1;
    rows.push(row('organizations', mapped.organization.id, { ...mapped.organization, import_run_id: runId }));
    rows.push(row('customer_external_identities', `shopify_customer_${customerId}`, {
      source: 'shopify', source_customer_id: customerId, org_id: mapped.organization.id,
      profile_id: mapped.profile?.id || null, import_run_id: runId,
    }));
    rows.push(row('customer_migration_records', `shopify_customer_${customerId}`, {
      source: 'shopify', source_customer_id: customerId, org_id: mapped.organization.id,
      activation_status: mapped.activation.status, activation_hold_reason: mapped.activation.reason || null,
      pricing_status: mapped.pricing.status, tax_exempt: mapped.tax_exempt,
      certificate_status: mapped.tax_certificate.status, restricted_metadata: mapped.restricted_metadata,
      import_run_id: runId,
    }));
    if (mapped.profile) {
      summary.profiles += 1;
      rows.push(row('profiles', mapped.profile.id, { ...mapped.profile, import_run_id: runId }));
      rows.push(row('organization_users', mapped.membership.id, { ...mapped.membership, import_run_id: runId }));
    }
    for (const address of mapped.addresses) rows.push(row('addresses', address.id, { ...address, import_run_id: runId }));
    for (const [channel, optedIn] of Object.entries(mapped.marketing_consent)) {
      const id = stableId('consent', `${customerId}:${channel}`);
      rows.push(row('marketing_consents', id, {
        org_id: mapped.organization.id, profile_id: mapped.profile?.id || null, channel,
        state: optedIn ? 'subscribed' : 'not_subscribed', source: 'shopify_export',
        import_run_id: runId,
      }));
    }
    for (const price of mapped.pricing.rows) {
      const id = stableId('contract', `${mapped.organization.id}:${price.product_sku}:${price.min_qty || 1}`);
      rows.push(row('customer_contract_prices', id, {
        ...price, org_id: mapped.organization.id, source_system: 'shopify_migration', import_run_id: runId,
      }));
    }
  }
  return { rows, summary, run: { id: runId, source_sha256: String(source_sha256).toLowerCase() } };
}
