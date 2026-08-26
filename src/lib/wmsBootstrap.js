import { useEffect } from 'react';
import { auth } from './auth.js';
import { db } from './db.js';

export async function fetchWmsWorkstation({ fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl('/api/wms/workstation', { credentials: 'include' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, reason: body.error || 'workstation_bootstrap_failed', status: response.status };
    return { ok: true, data: body };
  } catch (error) {
    if (import.meta.env?.DEV) return { ok: true, local: true, data: null };
    return { ok: false, reason: 'workstation_unreachable', detail: error.message };
  }
}

export function useWmsWorkstationBootstrap() {
  const session = auth.use();
  useEffect(() => {
    let cancelled = false;
    if (!session || !['admin', 'warehouse_manager', 'warehouse_operator'].includes(session.role)) return () => { cancelled = true; };
    fetchWmsWorkstation().then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) db.applyRemoteSnapshot(result.data);
      else if ([401, 403].includes(result.status)) auth.logout();
    });
    return () => { cancelled = true; };
  }, [session]);
}
