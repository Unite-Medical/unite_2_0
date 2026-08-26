const PLACEHOLDER_EMAIL = /^(?:no-?reply|noreply|noemail|none|unknown|test|customer)(?:[+._-].*)?@|@(noemail|example|invalid)\.(?:com|org|net)$|@no-reply\.com$|@ul\.shipping\.temuemail\.com$/i;

function yes(value) {
  return ['yes', 'true', '1', 'subscribed'].includes(String(value || '').trim().toLowerCase());
}
function clean(value) { return String(value || '').trim(); }
function validActivationEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !PLACEHOLDER_EMAIL.test(email);
}
function addressRows(addresses, orgId, customerId) {
  return (addresses || []).filter(Boolean).map((address, index) => ({
    id: `addr_shopify_${customerId}_${index + 1}`,
    org_id: orgId,
    label: index === 0 ? 'Default' : `Shopify address ${index + 1}`,
    line1: clean(address.address1 ?? address['Default Address Address1']),
    line2: clean(address.address2 ?? address['Default Address Address2']),
    city: clean(address.city ?? address['Default Address City']),
    state: clean(address.provinceCode ?? address['Default Address Province Code']),
    zip: clean(address.zip ?? address['Default Address Zip']),
    country: clean(address.countryCode ?? address['Default Address Country Code']) || 'US',
    phone: clean(address.phone ?? address['Default Address Phone']),
    is_default: index === 0,
    source: 'shopify_migration',
  }));
}

export function buildMigratedCustomer(source, { certificate_status = 'unknown', contract_prices = null, addresses = null } = {}) {
  const shopifyId = clean(source?.['Customer ID'] ?? source?.legacyResourceId);
  if (!shopifyId) throw new Error('customer migration requires Shopify customer ID');
  const email = clean(source?.Email ?? source?.email).toLowerCase();
  const activatable = validActivationEmail(email);
  const profileId = `usr_shopify_${shopifyId}`;
  const organizationId = `org_shopify_${shopifyId}`;
  const contractPrices = Array.isArray(contract_prices) ? contract_prices : [];
  const name = [source['First Name'] ?? source.firstName, source['Last Name'] ?? source.lastName].filter(Boolean).join(' ').trim();
  const company = clean(source['Default Address Company']);
  const pricingMissing = contractPrices.length === 0;
  const organization = {
    id: organizationId,
    name: company || name || `Shopify customer ${shopifyId}`,
    source: 'shopify_migration',
    shopify_customer_id: shopifyId,
    approval_status: 'manual_review',
    status: 'active',
    auto_joined_by_domain: false,
    pricing_reconciliation_status: pricingMissing ? 'source_missing' : 'preserved',
    commerce_hold_reason: pricingMissing ? 'customer_pricing_source_missing' : 'activation_required',
    shopify_tax_exempt: yes(source['Tax Exempt']),
    certificate_status,
  };
  const suppliedAddresses = addresses || [{
    address1: source['Default Address Address1'], address2: source['Default Address Address2'],
    city: source['Default Address City'], provinceCode: source['Default Address Province Code'],
    countryCode: source['Default Address Country Code'], zip: source['Default Address Zip'], phone: source['Default Address Phone'],
  }].filter((address) => address.address1 || address.city || address.zip);
  return {
    profile: activatable ? {
      id: profileId, shopify_customer_id: shopifyId, email, name: name || email,
      role: 'customer', org_id: organizationId, status: 'pending_activation',
      approval_status: 'migration_pending', activation_required: true, session_revision: 0,
    } : null,
    activation: activatable
      ? { status: 'eligible_not_issued', profile_id: profileId }
      : { status: 'reconciliation_hold', reason: email ? 'placeholder_email' : 'missing_email' },
    organization,
    membership: activatable ? {
      id: `orgusr_shopify_${shopifyId}`, user_id: profileId, org_id: organizationId,
      role: 'owner', status: 'pending_activation', source: 'shopify_migration',
    } : null,
    addresses: addressRows(suppliedAddresses, organizationId, shopifyId),
    marketing_consent: {
      email: yes(source['Accepts Email Marketing']), sms: yes(source['Accepts SMS Marketing']),
      whatsapp: yes(source['Accepts WhatsApp Marketing']),
    },
    tax_exempt: yes(source['Tax Exempt']),
    tax_certificate: {
      status: certificate_status, checkout_blocked: false,
      secure_upload_required: certificate_status !== 'approved',
    },
    pricing: contractPrices.length
      ? { status: 'preserved', launch_blocker: false, rows: contractPrices }
      : { status: 'source_missing', launch_blocker: true, rows: [] },
    tags: clean(source.Tags ?? source.tags).split(',').map((tag) => tag.trim()).filter(Boolean),
    restricted_metadata: {
      total_spent: clean(source['Total Spent'] ?? source.amountSpent?.amount),
      total_orders: clean(source['Total Orders'] ?? source.numberOfOrders),
      note: clean(source.Note ?? source.note),
    },
  };
}
