import { Plus, Sparkles, Truck } from 'lucide-react';
import { Button, ButtonLink } from '../../components/ui/button.jsx';
import { DataTable } from '../../components/ui/data-table.jsx';
import { EmptyState } from '../../components/ui/empty-state.jsx';
import { StatusBadge } from '../../components/ui/status-badge.jsx';
import '../../styles/ui.css';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { AdminCard } from '../../components/layout/AdminCard.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { purchaseOrders } from '../../lib/wms/purchaseOrders.js';
import { draftServerPurchaseOrders, mutatePurchaseOrder } from '../../lib/serverPurchaseOrders.js';
import { PurchaseOrderTransfer } from '../../components/PurchaseOrderTransfer.jsx';

export function AdminPurchaseOrders() {
  const pos = db.useTable('purchase_orders', { orderBy: 'created_at', dir: 'desc' });
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);
  const draftKey = useRef(null);


  async function act(fn, id) {
    setBusy(id);
    setNotice(null);
    try {
      const result = await fn();
      if (result?.ok === false) setNotice(`Could not complete ${id}: ${result.reason}`);
      else if (result?.po?.status === 'sent') setNotice(result.delivery_status !== 'sent'
        ? `${id} is queued for supplier delivery. Vendor acknowledgment pending.`
        : `${id} sent to ${result.po.sent_to}. Vendor acknowledgment pending.`);
    } finally { setBusy(null); }
  }

  async function sendPurchaseOrder(po) {
    const response = await fetch('/api/vendor/purchase-orders/send', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ po_id: po.id, expected_revision: Number(po.revision || 1), idempotency_key: `send:${po.id}:${Number(po.revision || 1)}` }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) return { ok: false, reason: body.error || `HTTP ${response.status}` };
    if (body.purchase_order) db.applyRemoteSnapshot({ purchase_orders: [body.purchase_order] });
    return { ok: true, po: body.purchase_order, delivery_status: body.delivery_status };
  }

  async function draftFromReplenishment() {
    draftKey.current ||= `replenishment:${crypto.randomUUID()}`;
    const result = await draftServerPurchaseOrders('replenishment', { idempotency_key: draftKey.current });
    if (result.ok) {
      draftKey.current = null;
      setNotice(`${result.purchase_orders?.length || 0} server-backed draft PO(s) created.`);
    }
    return result;
  }

  return (
    <AdminShell active="replenish">
      <main id="main" className="ui-root mx-auto w-full max-w-[1500px] px-4 py-6 font-sans text-sm text-ink md:px-8"><div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="m-0 font-display text-2xl font-semibold text-ink">Purchase orders</h1><p className="mt-1 text-sm text-ink-2">Buy from suppliers, track acknowledgments and receive deliveries.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => act(draftFromReplenishment, 'draft-all')} disabled={busy === 'draft-all'}><Sparkles className="h-4 w-4"/>{busy === 'draft-all' ? 'Drafting…' : 'Draft from replenishment'}</Button>
            <ButtonLink variant="primary" to="/admin/purchase-orders/new"><Plus className="h-4 w-4"/>Create purchase order</ButtonLink>
          </div>
        </header>
        {notice && <p className="m-0 rounded-lg border border-line bg-paper px-4 py-3 text-sm" role="status">{notice}</p>}
        <PurchaseOrderTransfer localOrders={pos} />
        <DataTable
          label="Purchase orders"
          rows={pos}
          searchPlaceholder="Search PO number, supplier or SKU"
          searchText={(p) => `${p.id} ${p.vendor_name || ''} ${(p.line_items || []).map((l) => `${l.sku || ''} ${l.name || ''}`).join(' ')}`}
          tabs={[{ id: 'all', label: 'All' }, ...['draft', 'approved', 'sent', 'partial', 'received', 'closed', 'cancelled'].map((st) => ({ id: st, label: st[0].toUpperCase() + st.slice(1), filter: (p) => p.status === st }))]}
          filters={[{ id: 'vendor', label: 'Supplier', value: (p) => p.vendor_name }, { id: 'response', label: 'Supplier reply', value: (p) => p.vendor_response, format: (v) => v.replace(/_/g, ' ') }]}
          defaultSort={{ id: 'created', dir: 'desc' }}
          rowHref={(p) => `/admin/purchase-orders/${p.id}`}
          empty={<EmptyState icon={Truck} title="No purchase orders yet" description="Create one for a supplier, or draft them from replenishment suggestions." action={<ButtonLink variant="primary" to="/admin/purchase-orders/new"><Plus className="h-4 w-4"/>Create purchase order</ButtonLink>}/>}
          columns={[
            { id: 'po', header: 'PO', accessor: 'id', cell: (p) => <Link className="font-mono font-semibold text-ink hover:text-brand" to={`/admin/purchase-orders/${p.id}`}>{p.id}</Link> },
            { id: 'vendor', header: 'Supplier', accessor: 'vendor_name', cell: (p) => <><div className="font-medium">{p.vendor_name}</div>{p.vendor_response && <div className="text-xs capitalize text-ink-2">{p.vendor_response.replace(/_/g, ' ')}</div>}</> },
            { id: 'created', header: 'Created', accessor: 'created_at', cell: (p) => (p.created_at ? fmt.date(p.created_at) : '—') },
            { id: 'lines', header: 'Lines', align: 'right', sortValue: (p) => p.line_items?.length || 0 },
            { id: 'received', header: 'Received / ordered', align: 'right', sortValue: (p) => { const g = purchaseOrders.progress(p.id); return g?.ordered ? g.received / g.ordered : 0; }, cell: (p) => { const g = purchaseOrders.progress(p.id) || { ordered: 0, received: 0 }; return <span className="font-mono">{g.received}/{g.ordered}</span>; } },
            { id: 'total', header: 'Total', align: 'right', accessor: 'total_cost', cell: (p) => (p.total_cost == null ? <span className="text-warn">Needs costs</span> : <span className="font-mono">{fmt.money(p.total_cost, { cents: false })}</span>) },
            { id: 'status', header: 'Status', accessor: 'status', cell: (p) => <StatusBadge value={p.status}/> },
            { id: 'actions', header: '', sortable: false, cell: (p) => <RowActions p={p} busy={busy} act={act} sendPurchaseOrder={sendPurchaseOrder}/> },
          ]}
        />
      </div></main>
    </AdminShell>
  );
}

function RowActions({ p, busy, act, sendPurchaseOrder }) {
  const b = busy === p.id;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {p.status === 'draft' && <Button size="sm" disabled={b} onClick={() => act(() => mutatePurchaseOrder(p, 'approve'), p.id)}>Approve</Button>}
      {p.status === 'approved' && <Button size="sm" variant="primary" disabled={b} onClick={() => act(() => sendPurchaseOrder(p), p.id)}>Send PO</Button>}
      {p.status === 'sent' && p.vendor_response === 'changes_requested' && <Button size="sm" disabled={b} onClick={() => act(() => mutatePurchaseOrder(p, 'revise'), p.id)}>Create revision</Button>}
      {p.po_type !== 'consignment_settlement' && (p.status === 'sent' || p.status === 'partial') && <ButtonLink size="sm" to={'/admin/inventory/receive?po=' + encodeURIComponent(p.id)}>Receive</ButtonLink>}
      {p.po_type !== 'consignment_settlement' && p.status === 'received' && <Button size="sm" disabled={b} onClick={() => act(() => mutatePurchaseOrder(p, 'close'), p.id)}>Close</Button>}
      {['draft', 'approved', 'sent'].includes(p.status) && p.vendor_response !== 'acknowledged' && <Button size="sm" variant="ghost" className="text-warn" disabled={b} onClick={() => act(() => mutatePurchaseOrder(p, 'cancel'), p.id)}>Cancel</Button>}
    </div>
  );
}
