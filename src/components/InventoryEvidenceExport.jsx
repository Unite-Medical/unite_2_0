import { useState } from 'react';
import { collectEvidence, EVIDENCE_SOURCES } from '../lib/inventoryEvidenceExport.js';
export function InventoryEvidenceExport() {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [result, setResult] = useState(null);
  const [since, setSince] = useState(() => new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10));
  const [scope, setScope] = useState('all'), [showText, setShowText] = useState(false);
  async function collect() {
    setBusy(true); setResult(null); setShowText(false);
    try {
      const data = await collectEvidence(scope === 'qbo' ? EVIDENCE_SOURCES.filter(s => s.startsWith('qbo_')) : EVIDENCE_SOURCES, since, {
        progress: setStatus,
        request: async params => {
          const query = new URLSearchParams(Object.entries(params).filter(([,v]) => v !== null));
          for (let attempt = 0; attempt < 4; attempt++) {
            const response = await fetch(`/api/admin/inventory-evidence?${query}`, { credentials: 'include' });
            const body = await response.json();
            if (response.status === 429 && attempt < 3) { await new Promise(resolve => setTimeout(resolve, 10000)); continue; }
            if (!response.ok) throw new Error([body.error, ...(body.details || [])].join(': ') || 'Export request failed');
            return body;
          }
        },
      });
      setResult(data); setStatus('Collection finished. Review source coverage below, then download the evidence file.');
    } catch (error) { setStatus(error.message); } finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `unite-inventory-evidence-${result.started_at.replaceAll(':', '-')}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <section aria-label="Inventory reconciliation evidence" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, margin: '16px 0' }}>
    <h3>Inventory reconciliation evidence</h3>
    <p>Download historical QuickBooks POs, items, bills, purchases and vendor credits, plus current Shopify inventory, open orders, recent order/shipping activity and Unite stock records. Collection only reads records.</p>
    <p>POs and bills are not proof of warehouse receipt. Source balances remain provisional until reconciled with receiving records and a physical count.</p>
    <label>Sources <select disabled={busy} value={scope} onChange={e => setScope(e.target.value)}><option value="all">All inventory sources</option><option value="qbo">QuickBooks history only</option></select></label>{' '}
    <label>Recent activity since <input disabled={busy} type="date" value={since} onChange={e => setSince(e.target.value)} /></label>{' '}
    <button disabled={busy || !since} onClick={collect}>{busy ? 'Collecting evidence…' : 'Collect inventory evidence'}</button>
    <p>QuickBooks history and Shopify open orders have no date filter. ShipStation includes orders modified and labels created since the selected date; All awaiting-payment, awaiting-shipment and on-hold ShipStation orders are also collected without a date filter.</p>
    {status && <p role="status">{status}</p>}
    {result && <><ul>{Object.entries(result.datasets).map(([source, d]) => <li key={source}>{source.replaceAll('_', ' ')}: {d.pages.reduce((n,p) => n + p.records.length, 0)} records · {d.complete ? 'complete within stated coverage' : 'INCOMPLETE — review errors/warnings'}{d.errors.length > 0 && ` · ${d.errors.join('; ')}`}{d.pages.flatMap(p => p.warnings || []).map((w,i) => <div key={i}>{w}</div>)}</li>)}</ul><button onClick={download}>Download evidence JSON</button>{' '}<button onClick={() => setShowText(v => !v)}>{showText ? 'Hide export text' : 'View export text'}</button>{showText && <label style={{ display: 'block', marginTop: 12 }}>Evidence JSON (read only)<textarea aria-label="Evidence JSON (read only)" readOnly value={JSON.stringify(result, null, 2)} rows={12} style={{ display: 'block', width: '100%', fontFamily: 'monospace' }} /></label>}</>}
  </section>;
}
