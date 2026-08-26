const QUOTE_SALES_FIELDS = [
  'id', 'customer_id', 'customer_name', 'contact_email', 'assigned_owner_email',
  'status', 'revision', 'created_at', 'updated_at', 'valid_until', 'expires_at',
  'subtotal', 'total', 'shipping_cost', 'tax', 'customer_po', 'payment_terms',
  'acceptance_token', 'accepted_at', 'declined_at',
];

function pick(row, fields) {
  const projected = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(row || {}, field)) projected[field] = row[field];
  }
  return projected;
}

export function canUseRawSync(session) {
  return session?.role === 'admin';
}

export function projectRowForSession(table, row, session) {
  if (!row || !session) return null;
  if (session.role === 'admin') return row;

  if (table === 'quotes') {
    if (session.role === 'sales') {
      if (row.assigned_owner_email && String(row.assigned_owner_email).toLowerCase() !== String(session.email || '').toLowerCase()) return null;
      return pick(row, QUOTE_SALES_FIELDS);
    }
    if (session.role === 'customer' && row.customer_id === session.org_id) {
      return pick(row, ['id', 'customer_id', 'status', 'revision', 'valid_until', 'subtotal', 'shipping_cost', 'tax', 'total', 'customer_po', 'payment_terms', 'accepted_at']);
    }
    return null;
  }

  if (table === 'order_items' && session.role === 'customer' && row.customer_id === session.org_id) {
    return pick(row, ['id', 'order_id', 'sku', 'name', 'qty', 'unit_price', 'ext_price', 'status']);
  }

  if (table === 'orders' && session.role === 'customer' && row.customer_id === session.org_id) {
    return pick(row, ['id', 'customer_id', 'status', 'payment_status', 'subtotal', 'shipping_cost', 'tax', 'total', 'tracking_number', 'carrier', 'created_at', 'shipped_at', 'delivered_at']);
  }

  return null;
}

export function projectQuoteBundleForSession({ quote, items = [] }, session, view = 'sales') {
  if (!quote || !session) return null;
  const privileged = ['admin', 'finance', 'sourcing_manager'].includes(session.role);
  if (view === 'internal') return privileged ? { quote, items } : null;

  if (view === 'customer') {
    if (session.role !== 'customer' || quote.customer_id !== session.org_id) return null;
  } else if (view === 'sales') {
    if (!['sales', 'sales_manager', 'customer_service', 'admin'].includes(session.role)) return null;
    if (session.role !== 'admin' && session.role !== 'sales_manager'
        && String(quote.assigned_owner_email || '').toLowerCase() !== String(session.email || '').toLowerCase()) return null;
  } else {
    return null;
  }

  const quoteFields = [
    'id', 'customer_id', 'customer_name', 'contact_email', 'assigned_owner_email',
    'status', 'revision', 'created_at', 'updated_at', 'valid_until', 'expires_at',
    'subtotal', 'total', 'shipping_cost', 'tax', 'customer_po', 'payment_terms',
    'acceptance_token', 'accepted_at', 'declined_at', 'currency', 'terms_version',
  ];
  const itemFields = [
    'id', 'quote_id', 'sku', 'gtin', 'name', 'qty', 'target_qty', 'moq',
    'sell_per_unit', 'unit_price', 'ext_sell', 'ext_price', 'lead_time_days',
    'fda_validated', 'hts_code', 'origin_country', 'availability_status',
  ];
  return {
    quote: pick(quote, quoteFields),
    items: items.map((item) => pick(item, itemFields)),
  };
}

const SERVICE_ROLES = {
  qbo: new Set(['admin', 'finance']),
  stripe: new Set(['admin', 'finance']),
  customerio: new Set(['admin']),
  resend: new Set(['admin']),
  gmail: new Set(['admin']),
  hubspot: new Set(['admin', 'sales_manager']),
  shipstation: new Set(['admin', 'warehouse_manager']),
  flexport: new Set(['admin', 'warehouse_manager', 'sourcing']),
  fedex: new Set(['admin', 'warehouse_manager']),
};

export function canUseServiceProxy(session, service, path = '/', method = 'GET') {
  if (!session) return false;
  if (service === 'qbo' && !['GET', 'HEAD'].includes(String(method).toUpperCase())) return false;
  if (service === 'customerio' && !['GET', 'HEAD'].includes(String(method).toUpperCase())) return false;
  if (service === 'qbo' && !String(path || '').startsWith('/')) return false;
  if (session.role === 'admin') return true;
  return Boolean(SERVICE_ROLES[service]?.has(session.role));
}
