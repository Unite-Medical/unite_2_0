import { useEffect } from 'react';
import { auth } from './auth.js';
import { db } from './db.js';

const TABLE_MAP = {
  addresses: 'addresses',
  payment_methods: 'account_payment_methods',
  orders: 'orders',
  order_items: 'order_items',
  invoices: 'invoices',
  quotes: 'quotes',
  shipments: 'shipments',
};

function upsert(table, row) {
  if (!row?.id) return;
  if (db.get(table, row.id)) db.update(table, row.id, row);
  else db.insert(table, row);
}

export async function fetchAccountBootstrap({ fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl('/api/account/bootstrap', { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, reason: body.error || 'account_bootstrap_failed', status: response.status };
    return { ok: true, data: body };
  } catch (error) {
    if (import.meta.env?.DEV) return { ok: true, local: true, data: null };
    return { ok: false, reason: 'account_bootstrap_unreachable', detail: error.message };
  }
}

export function applyAccountBootstrap(data) {
  if (!data) return;
  upsert('profiles', data.profile);
  upsert('organizations', data.organization);
  upsert('organization_users', data.membership);
  for (const [key, table] of Object.entries(TABLE_MAP)) {
    for (const row of data[key] || []) upsert(table, row);
  }
}

export function useAccountBootstrap() {
  const session = auth.use();
  useEffect(() => {
    let cancelled = false;
    if (!session || !['customer', 'distributor'].includes(session.role)) return () => { cancelled = true; };
    fetchAccountBootstrap().then((result) => {
      if (cancelled) return;
      if (result.ok) applyAccountBootstrap(result.data);
      else if ([401, 403].includes(result.status)) auth.logout();
    });
    return () => { cancelled = true; };
  }, [session]);
}
