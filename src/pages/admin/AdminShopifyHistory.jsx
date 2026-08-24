import { useMemo, useState } from 'react';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { D } from '../../tokens.js';

export function AdminShopifyHistory() {
  const rows = db.useTable('shopify_history_rows');
  const [entity, setEntity] = useState('all');
  const counts = useMemo(() => rows.reduce((out, row) => ({ ...out, [row.entity]: (out[row.entity] || 0) + 1 }), {}), [rows]);
  const visible = entity === 'all' ? rows : rows.filter((row) => row.entity === entity);
  return <AdminShell active="shopify-history"><main style={{ padding: '40px', maxWidth: 1320 }}>
    <p style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.2, color: D.plum }}>SHOPIFY · HISTORICAL SNAPSHOT</p>
    <h1 style={{ fontFamily: D.display, fontWeight: 400, fontSize: 48, margin: '8px 0' }}>Migration history</h1>
    <p style={{ maxWidth: 760, color: D.ink2 }}>Read-only Shopify evidence. Location inventory is source data only and is not Unite WMS on-hand stock.</p>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '26px 0' }}>
      {Object.entries(counts).map(([key, value]) => <button key={key} onClick={() => setEntity(key)} style={{ padding: '10px 14px', border: `1px solid ${D.line}`, background: entity === key ? D.plum : D.card, color: entity === key ? D.paper : D.ink, borderRadius: 4, cursor: 'pointer' }}>{key} · {value}</button>)}
      <button onClick={() => setEntity('all')} style={{ padding: '10px 14px', border: `1px solid ${D.line}`, background: entity === 'all' ? D.plum : D.card, color: entity === 'all' ? D.paper : D.ink, borderRadius: 4, cursor: 'pointer' }}>all · {rows.length}</button>
    </div>
    <div style={{ border: `1px solid ${D.line}`, borderRadius: 8, overflow: 'hidden' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr style={{ background: D.paperAlt, textAlign: 'left' }}><th style={{ padding: 12 }}>TYPE</th><th style={{ padding: 12 }}>SOURCE ID</th><th style={{ padding: 12 }}>IMPORTED</th><th style={{ padding: 12 }}>EVIDENCE HASH</th></tr></thead><tbody>{visible.slice(0, 500).map((row) => <tr key={row.id} style={{ borderTop: `1px solid ${D.line}` }}><td style={{ padding: 12 }}>{row.entity}</td><td style={{ padding: 12, fontFamily: D.mono }}>{row.source_id}</td><td style={{ padding: 12 }}>{new Date(row.imported_at).toLocaleString()}</td><td style={{ padding: 12, fontFamily: D.mono, fontSize: 11 }}>{row.payload_sha256?.slice(0, 18)}…</td></tr>)}</tbody></table></div>
  </main></AdminShell>;
}
