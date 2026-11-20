import { Plus, Sparkles, Truck } from 'lucide-react';
import { Button, ButtonLink } from '../../components/ui/button.jsx';
import { Card as UiCard } from '../../components/ui/card.jsx';
import { Table, THead, TRow, TH, TD } from '../../components/ui/table.jsx';
import { EmptyState } from '../../components/ui/empty-state.jsx';
import { StatusBadge } from '../../components/ui/status-badge.jsx';
import { cn } from '../../lib/cn.js';
import '../../styles/ui.css';
import { useMemo, useRef, useState } from 'react';
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
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState(null);
  const draftKey = useRef(null);

  const filtered = useMemo(
    () => (filter === 'all' ? pos : pos.filter((p) => p.status === filter)),
    [pos, filter],
  );

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

  const counts = useMemo(() => {
    const c = {};
    for (const p of pos) c[p.status] = (c[p.status] || 0) + 1;
    return c;
  }, [pos]);

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
        <UiCard className="overflow-hidden">
          <div role="tablist" aria-label="Purchase order status" className="flex gap-1 overflow-x-auto border-b border-line px-4 py-3 [scrollbar-width:none]">
            {['all', 'draft', 'approved', 'sent', 'partial', 'received', 'closed', 'cancelled'].map((st) => (
              <button key={st} role="tab" aria-selected={filter === st} onClick={() => setFilter(st)} className={cn('min-h-11 rounded-lg px-3 text-sm font-medium whitespace-nowrap capitalize md:min-h-10', filter === st ? 'bg-paper text-ink' : 'text-ink-2 hover:bg-paper/60')}>{st}{st !== 'all' && counts[st] ? <span className="ml-1.5 text-xs text-ink-3">{counts[st]}</span> : null}</button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <EmptyState icon={Truck} title={filter === 'all' ? 'No purchase orders yet' : `No ${filter} purchase orders`} description={filter === 'all' ? 'Create one for a supplier, or draft them from replenishment suggestions.' : 'Try another status.'} action={filter === 'all' ? <ButtonLink variant="primary" to="/admin/purchase-orders/new"><Plus className="h-4 w-4"/>Create purchase order</ButtonLink> : <Button onClick={() => setFilter('all')}>Show all</Button>}/>
          ) : <>
            <ul className="m-0 list-none divide-y divide-line p-0 md:hidden">
              {filtered.map((p) => { const prog = purchaseOrders.progress(p.id) || { ordered: 0, received: 0 }; return (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-3">
                  <Link to={`/admin/purchase-orders/${p.id}`} className="flex flex-col gap-1 text-ink no-underline">
                    <span className="flex items-center justify-between gap-3"><span className="font-mono font-semibold">{p.id}</span><StatusBadge value={p.status}/></span>
                    <span className="flex items-center justify-between gap-3 text-xs text-ink-2"><span className="truncate">{p.vendor_name}</span><span className="font-mono">{prog.received}/{prog.ordered} units · {p.total_cost == null ? 'Needs costs' : fmt.money(p.total_cost, { cents: false })}</span></span>
                  </Link>
                  <RowActions p={p} busy={busy} act={act} sendPurchaseOrder={sendPurchaseOrder}/>
                </li>); })}
            </ul>
            <div className="hidden md:block"><Table><THead><tr><TH>PO</TH><TH>Supplier</TH><TH className="text-right">Lines</TH><TH className="text-right">Received / ordered</TH><TH className="text-right">Total</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH></tr></THead><tbody>
              {filtered.map((p) => { const prog = purchaseOrders.progress(p.id) || { ordered: 0, received: 0 }; return (
                <TRow key={p.id}>
                  <TD><Link className="font-mono font-semibold text-ink hover:text-brand" to={`/admin/purchase-orders/${p.id}`}>{p.id}</Link></TD>
                  <TD><div className="font-medium">{p.vendor_name}</div>{p.vendor_response && <div className="text-xs capitalize text-ink-2">{p.vendor_response.replace(/_/g, ' ')}</div>}</TD>
                  <TD className="text-right tabular-nums">{p.line_items?.length || 0}</TD>
                  <TD className="text-right font-mono tabular-nums">{prog.received}/{prog.ordered}</TD>
                  <TD className="text-right font-mono tabular-nums">{p.total_cost == null ? <span className="text-warn">Needs costs</span> : fmt.money(p.total_cost, { cents: false })}</TD>
                  <TD><StatusBadge value={p.status}/></TD>
                  <TD><RowActions p={p} busy={busy} act={act} sendPurchaseOrder={sendPurchaseOrder}/></TD>
                </TRow>); })}
            </tbody></Table></div>
          </>}
        </UiCard>
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
