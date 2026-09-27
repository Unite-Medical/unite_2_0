import { useState } from 'react';
import { db } from '../lib/db.js';
import { readPoFile } from '../lib/poFileImport.js';

const empty = () => ({ doc_number: '', vendor_name: '', vendor_qbo_id: '', txn_date: new Date().toISOString().slice(0, 10), currency: 'USD', line_items: [{ sku: '', name: '', qty: 1, cost: '', qbo_item_id: '' }] });
async function request(body, page = 1) {
  const response = await fetch(`/api/qbo/purchase-orders${body ? '' : `?page=${page}`}`, { credentials: 'include', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error((result.error || 'Request failed').replaceAll('_', ' '));
  return result;
}
export function PurchaseOrderTransfer({ localOrders = [] }) {
  const [opened, setOpened] = useState(false), [draft, setDraft] = useState(empty), [remote, setRemote] = useState(null);
  const [list, setList] = useState(null), [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const change = patch => { setDraft(d => ({ ...d, ...patch })); setPreview(null); };
  const run = async fn => { setBusy(true); setNotice(''); try { await fn(); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  const inputStyle = { padding: 7, width: '100%', boxSizing: 'border-box' };
  if (!opened) return <button onClick={() => setOpened(true)} style={{ marginBottom: 18, padding: 12 }}>Import / export purchase orders</button>;
  return <section style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 20, marginBottom: 24 }} aria-label="Purchase order import and export">
    <h2>Import / export purchase orders</h2>
    <p>Import into Unite as a draft, or review a transfer to QuickBooks. Importing never receives stock or sends a PO to a supplier.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
      <button onClick={() => { setOpened(false); }}>Close</button>{' '}
      <button onClick={() => { setDraft(empty()); setRemote(null); setPreview(null); setNotice(''); }}>New PO</button>{' '}
      <button onClick={() => run(async () => setList(await request(null)))}>Browse QuickBooks POs</button>
      <label style={{ display: 'block', margin: '14px 0' }}>Load a Unite PO{' '}
        <select defaultValue="" onChange={e => { const po = localOrders.find(p => p.id === e.target.value); if (po) { setDraft({ ...po, doc_number: po.doc_number || po.id, txn_date: po.txn_date || po.created_at?.slice(0, 10), currency: po.currency || 'USD' }); setRemote(null); setPreview(null); } }}>
          <option value="">Select a PO</option>{localOrders.map(po => <option key={po.id} value={po.id}>{po.doc_number || po.id} · {po.vendor_name}</option>)}
        </select>
      </label>
      {list && <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #ddd', padding: 10 }}>
        <p>QuickBooks {list.environment} · Page {list.page}</p>
        {list.purchase_orders.map(po => <div key={po.Id}><button onClick={() => run(async () => { const result = await request({ action: 'read', qbo_id: po.Id }); setDraft(result.draft); setRemote({ qbo_id: result.qbo_id, sync_token: result.sync_token }); setPreview(null); setNotice('Loaded for review. Nothing has been imported or changed yet.'); })}>{po.DocNumber || po.Id} · {po.VendorRef?.name} · {po.TotalAmt} · {po.POStatus}</button></div>)}
        {!list.purchase_orders.length && <p>No purchase orders on this page.</p>}
        <button disabled={list.page === 1} onClick={() => run(async () => setList(await request(null, list.page - 1)))}>Previous</button>{' '}
        <button disabled={!list.has_more} onClick={() => run(async () => setList(await request(null, list.page + 1)))}>Next</button>
      </div>}
      <p>CSV/XLSX columns: <code>sku, description, quantity, unit_cost, qbo_item_id</code>. One PO per file. Item IDs are optional when saving a Unite draft.</p>
      <label>Import file <input type="file" accept=".csv,.xlsx,.pdf" onChange={e => { const file = e.target.files?.[0]; if (file) run(async () => { const parsed = await readPoFile(file); change({ source_text: '', line_items: empty().line_items, ...parsed, source_filename: file.name }); setNotice(parsed.source_text ? 'PDF text extracted below. Enter and verify the PO header and line items before saving.' : 'Lines imported. Review the header and all amounts before saving.'); }); e.target.value = ''; }} /></label>
      {draft.source_text && <details open><summary>Source document: {draft.source_filename}</summary><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>{draft.source_text}</pre></details>}
      {remote && <p>Updating QuickBooks PO {remote.qbo_id} after review. Use “New PO” to create a separate order.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, margin: '16px 0' }}>
        {[['doc_number', 'PO number'], ['vendor_name', 'Vendor name'], ['vendor_qbo_id', 'QuickBooks vendor ID'], ['txn_date', 'PO date']].map(([key, label]) => <label key={key}>{label}<input style={inputStyle} type={key === 'txn_date' ? 'date' : 'text'} value={draft[key] || ''} onChange={e => change({ [key]: e.target.value })} /></label>)}
      </div>
      <div style={{ overflow: 'auto' }}><table style={{ width: '100%', minWidth: 700 }}><thead><tr>{['SKU', 'Description', 'Quantity', 'Unit cost (USD)', 'QuickBooks item ID', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>
        {draft.line_items.map((line, i) => <tr key={i}>{['sku', 'name', 'qty', 'cost', 'qbo_item_id'].map(key => <td key={key}><input aria-label={`Line ${i + 1} ${key}`} style={inputStyle} value={line[key] ?? ''} onChange={e => change({ line_items: draft.line_items.map((l, j) => j === i ? { ...l, [key]: e.target.value } : l) })} /></td>)}<td><button aria-label={`Remove line ${i + 1}`} onClick={() => change({ line_items: draft.line_items.filter((_, j) => j !== i) })}>Remove</button></td></tr>)}
      </tbody></table></div>
      <button disabled={draft.line_items.length >= 200} onClick={() => change({ line_items: [...draft.line_items, empty().line_items[0]] })}>Add line</button>
      <p>Line subtotal: USD {draft.line_items.reduce((sum, line) => sum + Math.round(Number(line.qty || 0) * Number(line.cost || 0) * 100) / 100, 0).toFixed(2)}. Transfers currently support USD item-based POs without tax adjustments.</p>
      <button onClick={() => run(async () => { const result = await request({ action: 'save_draft', draft }); db.applyRemoteSnapshot({ purchase_orders: [result.purchase_order] }); setNotice(`Saved Unite draft ${result.purchase_order.id}. QuickBooks was not changed.`); })}>Save reviewed Unite draft</button>{' '}
      <button onClick={() => run(async () => { setPreview(await request({ action: 'preview', draft, ...remote })); })}>Review QuickBooks {remote ? 'update' : 'creation'}</button>
      {preview && <div style={{ border: '2px solid #BC146B', padding: 14, marginTop: 14 }}>
        <h3>Confirm {preview.action} in QuickBooks {preview.environment}</h3>
        <p>PO {preview.draft.doc_number} · {preview.draft.vendor_name} · {preview.draft.line_items.length} lines · USD {preview.draft.total_cost.toFixed(2)}</p>
        <p>This changes the connected company's purchase order. It does not send email or record a bill, payment, or receipt.</p>
        <button onClick={() => run(async () => { const result = await request({ action: 'publish', operation_id: preview.operation_id, confirmed: true }); setPreview(null); setNotice(`QuickBooks PO ${result.qbo_id} ${result.already_completed ? 'was already saved' : 'saved'}. Reload it from QuickBooks before another edit.`); })}>Confirm and {preview.action} PO</button>{' '}
        <button onClick={() => setPreview(null)}>Cancel</button>
      </div>}
    </fieldset>
    {busy && <p role="status">Working…</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
