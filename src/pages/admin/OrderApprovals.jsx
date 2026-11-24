import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { Button, ButtonLink } from '../../components/ui/button.jsx';
import { Card } from '../../components/ui/card.jsx';
import { EmptyState } from '../../components/ui/empty-state.jsx';
import { auth } from '../../lib/auth.js';
import { fmt } from '../../lib/format.js';
import { useSEO } from '../../lib/seo.js';
import { cn } from '../../lib/cn.js';
import '../../styles/ui.css';

const ERRORS = {
  order_approval_authority_required: 'Only Damon or Ashley can approve orders.',
  damon_approval_authority_required: 'Orders over $10,000 need Damon’s approval.',
  approval_reason_required: 'Add a short note before deciding.',
  order_changed_review_again: 'This order changed. Refresh and review it again.',
  order_already_closed: 'This order is already closed.',
};
const when = (at) => (at ? new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export function OrderApprovals() {
  useSEO({ title: 'Waiting for approval · Unite', noindex: true });
  const session = auth.use();
  const [params] = useSearchParams();
  const submitted = params.get('submitted');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('waiting');
  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/admin/order-approvals', { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'load_failed');
      setData(json);
    } catch {
      setError('We couldn’t load orders waiting for approval.');
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  const orders = data?.orders || [];
  const waiting = orders.filter((o) => o.approval?.status === 'pending');
  const decided = orders.filter((o) => o.approval?.status !== 'pending');
  const list = tab === 'waiting' ? waiting : decided;
  const ordersPath = session?.role === 'admin' ? '/admin/orders' : '/sales/orders';
  return (
    <AdminShell active="order-approvals">
      <main id="main" className="ui-root mx-auto w-full max-w-[1100px] px-4 py-6 font-sans text-sm text-ink md:px-8">
        <header className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="m-0 font-display text-2xl font-semibold md:text-[28px]">Waiting for approval</h1>
            <p className="m-0 mt-1 text-ink-2">
              {data?.can_approve ? 'Approve to send an order to QuickBooks, payment and shipping.' : 'Damon or Ashley approves these. Check here before entering an order again.'}
            </p>
          </div>
          {['admin', 'sales', 'sales_manager'].includes(session?.role) && <ButtonLink to={`${ordersPath}/new`}>Create order</ButtonLink>}
        </header>
        {submitted && <p role="status" className="mb-4 rounded-lg border border-brand-soft bg-[#eaf2ee] px-4 py-3 text-brand">Order submitted. It’s waiting for Damon or Ashley to approve it.</p>}
        {error && <p role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warn-soft bg-[#f8ede4] px-4 py-3 text-warn">{error}<Button size="sm" onClick={load}>Try again</Button></p>}
        <div role="tablist" className="mb-3 flex gap-1 border-b border-line">
          {[['waiting', 'Waiting', waiting.length], ['decided', 'Recently decided', decided.length]].map(([id, label, n]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('-mb-px min-h-11 border-b-2 px-3 font-medium', tab === id ? 'border-brand text-ink' : 'border-transparent text-ink-2 hover:text-ink')}>
              {label} <span className="ml-1 text-ink-3">{n}</span>
            </button>
          ))}
        </div>
        {!data && !error && <p className="text-ink-2">Loading…</p>}
        {data && list.length === 0 && (
          <Card><EmptyState title={tab === 'waiting' ? 'Nothing waiting for approval' : 'No decisions in the last 14 days'} description={tab === 'waiting' ? 'Orders submitted from Create order appear here until Damon or Ashley approves them.' : 'Approved and rejected orders show here for two weeks.'} /></Card>
        )}
        <div className="grid gap-3">
          {list.map((o) => <ApprovalCard key={o.id} order={o} canApprove={data?.can_approve} highlight={o.id === submitted} onDone={load} ordersPath={ordersPath} />)}
        </div>
      </main>
    </AdminShell>
  );
}

function ApprovalCard({ order, canApprove, highlight, onDone, ordersPath }) {
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const a = order.approval || {};
  async function decide(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/order-approvals', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order_id: order.id, action, reason }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(ERRORS[json.error] || 'That didn’t work. Try again.');
      setAction('');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const status = a.status === 'pending' ? <Badge tone="warn" dot><Clock size={12} aria-hidden="true" /> Waiting</Badge> : a.status === 'approved' ? <Badge tone="good" dot><CheckCircle2 size={12} aria-hidden="true" /> Approved</Badge> : <Badge dot><XCircle size={12} aria-hidden="true" /> Rejected</Badge>;
  return (
    <Card className={cn('p-4', highlight && 'border-brand')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-semibold">{order.number}</span>{status}
          </div>
          <div className="mt-1 font-medium">{order.customer_name}</div>
          <div className="mt-1 text-ink-2">
            Submitted {when(a.requested_at)}{a.requested_by_name || a.requested_by ? ` by ${a.requested_by_name || a.requested_by}` : ''}{order.po_number ? ` · PO ${order.po_number}` : ''}
          </div>
          {a.status !== 'pending' && <div className="mt-1 text-ink-2">{a.status === 'approved' ? 'Approved' : 'Rejected'} {when(a.decided_at)} by {a.approver_name || a.approver_email}{a.reason ? `: “${a.reason}”` : ''}</div>}
          {order.lines.length > 0 && (
            <ul className="m-0 mt-2 grid list-none gap-0.5 p-0 text-ink-2">
              {order.lines.map((l, i) => <li key={i}>{l.quantity} × {l.name}{l.sku && l.sku !== l.name ? ` (${l.sku})` : ''}</li>)}
            </ul>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="font-display text-xl font-semibold">{fmt.money(order.total)}</div>
          {a.status === 'pending' && canApprove && !action && (
            <div className="flex gap-2">
              <Button onClick={() => setAction('reject')}>Reject</Button>
              <Button variant="primary" onClick={() => setAction('approve')}>Approve</Button>
            </div>
          )}
          {a.status !== 'pending' && order.status !== 'cancelled' && <ButtonLink to={`${ordersPath}/${encodeURIComponent(order.id)}`} size="sm">Open order</ButtonLink>}
        </div>
      </div>
      {action && (
        <form onSubmit={decide} className="mt-3 grid gap-2 border-t border-line pt-3">
          <label className="grid gap-1.5">
            <span className="font-medium">{action === 'approve' ? 'Approval note' : 'Why are you rejecting it?'}</span>
            <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'approve' ? 'e.g. Price and quantity checked' : 'e.g. Wrong price, customer cancelled'} className="h-11 w-full rounded-lg border border-line bg-card px-3 outline-none focus:border-brand md:h-10" />
          </label>
          <p className="m-0 text-ink-2">{action === 'approve' ? 'Approving sends this order to QuickBooks and starts payment and shipping.' : 'Rejecting cancels the order. Nothing goes to QuickBooks.'}</p>
          {error && <p role="alert" className="m-0 text-warn">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" onClick={() => { setAction(''); setError(''); }} disabled={busy}>Cancel</Button>
            <Button type="submit" variant={action === 'approve' ? 'primary' : 'danger'} disabled={busy || !reason.trim()}>{busy ? 'Saving…' : action === 'approve' ? 'Approve order' : 'Reject order'}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
