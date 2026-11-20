import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSearch, Search } from 'lucide-react';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Table, THead, TRow, TH, TD } from '../../components/ui/table.jsx';
import { EmptyState } from '../../components/ui/empty-state.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import { cn } from '../../lib/cn.js';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { draftServerPurchaseOrders } from '../../lib/serverPurchaseOrders.js';
import { vendorPriceStatus } from '../../lib/commercialPolicy.js';
import '../../styles/ui.css';

const TABS = [
  ['all', 'All', () => true],
  ['new', 'New', (r) => r.stage === 'new'],
  ['needs_review', 'Needs review', (r) => r.stage === 'needs_review'],
  ['ready', 'Ready for PO', (r) => r.stage === 'reviewable'],
  ['po_draft', 'PO drafted', (r) => r.stage === 'po_draft'],
];

const STATUS = {
  new: ['New', 'neutral'], needs_review: ['Needs review', 'warn'], reviewable: ['Ready for PO', 'good'],
  approved: ['Approved', 'good'], po_draft: ['PO drafted', 'neutral'],
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function StatusBadge({ value }) {
  const [text, tone] = STATUS[value] || [String(value || 'new').replaceAll('_', ' '), 'neutral'];
  return <Badge tone={tone} dot>{text.charAt(0).toUpperCase() + text.slice(1)}</Badge>;
}

// Requests only move new -> po_draft; review progress lives on their vendor offers.
function requestStage(request, requestOffers) {
  if (request.status && request.status !== 'new') return request.status;
  if (requestOffers.some((o) => o.status === 'reviewable')) return 'reviewable';
  if (requestOffers.some((o) => o.status === 'needs_review')) return 'needs_review';
  return 'new';
}

const customerName = (r) => r.organization_name || r.contact_email || 'Unassigned customer';
const dueDate = (r) => (r.response_due_at ? fmt.date(r.response_due_at, { year: true }) : 'Not set');

export function AdminSourcing() {
  const requests = db.useTable('sourcing_requests', { orderBy: 'created_at', dir: 'desc' });
  const offers = db.useTable('vendor_offers', { orderBy: 'created_at', dir: 'desc' });
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [notice, setNotice] = useState(null);
  const detailRef = useRef(null);

  const staged = useMemo(() => {
    const byRequest = {};
    for (const offer of offers) (byRequest[offer.sourcing_request_id] ||= []).push(offer);
    return requests.map((r) => ({ ...r, offerCount: (byRequest[r.id] || []).length, stage: requestStage(r, byRequest[r.id] || []) }));
  }, [requests, offers]);

  const rows = useMemo(() => {
    const match = TABS.find(([v]) => v === tab)[2];
    const needle = q.trim().toLowerCase();
    return staged.filter(match).filter((r) => !needle || [customerName(r), r.product_description, r.account_owner_email]
      .some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [staged, tab, q]);

  const active = requests.find((r) => r.id === activeId) || null;
  const activeOffers = offers.filter((offer) => offer.sourcing_request_id === active?.id);

  function open(id) {
    setActiveId(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function createPo(offerId) {
    const offer = offers.find((row) => row.id === offerId);
    const result = await draftServerPurchaseOrders('sourcing_offer', {
      offer_id: offerId, expected_revision: Number(offer?.revision || 0),
    });
    setNotice(result.ok
      ? `Draft ${result.purchase_order.id} created. Review it before sending.`
      : `Could not create PO: ${result.reason}`);
  }

  return (
    <AdminShell active="sourcing">
      <main id="main" className="ui-root mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-6 font-sans text-sm text-ink md:px-8">
        <header>
          <h1 className="m-0 font-display text-2xl font-semibold text-ink">Sourcing requests</h1>
          <p className="m-0 mt-1 text-sm text-ink-2">Products customers asked Unite to find. Each request has an owner, a response date and vendor offers.</p>
        </header>

        {notice && <p className="m-0 rounded-lg border border-line bg-paper px-4 py-3 text-sm" role="status">{notice}</p>}

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
            <div role="tablist" aria-label="Sourcing views" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
              {TABS.map(([v, t, fn]) => (
                <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                  className={cn('min-h-10 rounded-lg px-3 text-sm font-medium whitespace-nowrap', tab === v ? 'bg-paper text-ink' : 'text-ink-2 hover:bg-paper/60')}>
                  {t} <span className="text-ink-3">{staged.filter(fn).length}</span>
                </button>
              ))}
            </div>
            <Input icon={Search} type="search" aria-label="Search sourcing requests" placeholder="Customer, product or owner" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          {rows.length ? (
            <>
              <ul className="m-0 list-none divide-y divide-line p-0 md:hidden">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => open(r.id)} className={cn('flex w-full flex-col gap-1 border-0 px-4 py-3 text-left text-ink', r.id === activeId ? 'bg-paper' : 'bg-card')}>
                      <span className="flex items-center justify-between gap-3"><span className="truncate font-semibold">{customerName(r)}</span><StatusBadge value={r.stage} /></span>
                      <span className="text-sm text-ink-2">{r.product_description}</span>
                      <span className="text-xs text-ink-3">Due {dueDate(r)} · {plural(r.offerCount, 'offer')}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="hidden md:block">
                <Table>
                  <THead><tr><TH>Customer</TH><TH>Product</TH><TH className="text-right">Quantity</TH><TH>Owner</TH><TH>Response due</TH><TH className="text-right">Offers</TH><TH>Status</TH></tr></THead>
                  <tbody>
                    {rows.map((r) => (
                      <TRow key={r.id} className={cn('cursor-pointer', r.id === activeId && 'bg-paper')} onClick={() => open(r.id)}>
                        <TD><button type="button" className="border-0 bg-transparent p-0 text-left font-semibold text-ink hover:text-brand" onClick={(e) => { e.stopPropagation(); open(r.id); }}>{customerName(r)}</button></TD>
                        <TD className="max-w-80 text-ink-2">{r.product_description}</TD>
                        <TD className="text-right tabular-nums">{r.quantity || '—'}</TD>
                        <TD className="text-ink-2">{r.account_owner_email || 'Unassigned'}</TD>
                        <TD className="whitespace-nowrap text-ink-2">{dueDate(r)}</TD>
                        <TD className="text-right tabular-nums">{r.offerCount}</TD>
                        <TD><StatusBadge value={r.stage} /></TD>
                      </TRow>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          ) : (
            <EmptyState icon={FileSearch}
              title={requests.length ? 'No requests match' : 'No sourcing requests yet'}
              description={requests.length ? 'Try another view or search.' : 'Requests appear here when a customer asks Unite to find a product it does not stock.'}
              action={requests.length ? <Button variant="secondary" onClick={() => { setQ(''); setTab('all'); }}>Clear filters</Button> : null} />
          )}
        </Card>

        {active && (
          <Card ref={detailRef}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>{active.product_description}</CardTitle>
                <p className="m-0 mt-1 text-sm text-ink-2">{customerName(active)} · Quantity {active.quantity || 'not specified'}</p>
              </div>
              <div className="flex items-center gap-2">
                {active.purchase_order_id && <Link to="/admin/purchase-orders" className="text-sm font-medium text-brand">Open {active.purchase_order_id}</Link>}
                <Button variant="ghost" onClick={() => setActiveId(null)}>Close</Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <dl className="m-0 grid gap-3 md:grid-cols-3">
                <Meta label="Owner" value={active.account_owner_email || 'Unassigned'} />
                <Meta label="Source" value={(active.source_channels || [active.source_channel]).filter(Boolean).join(', ') || 'Not recorded'} />
                <Meta label="Response due" value={dueDate(active)} />
              </dl>
              <section>
                <h3 className="m-0 mb-2 text-sm font-semibold text-ink">Vendor offers ({activeOffers.length})</h3>
                {activeOffers.length ? (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {activeOffers.map((offer) => {
                      const price = vendorPriceStatus(offer.line_items?.[0] || {});
                      return (
                        <li key={offer.id} className="flex flex-col gap-3 rounded-lg border border-line p-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="flex items-center gap-2 font-semibold">{offer.vendor_name}<StatusBadge value={offer.status} /></div>
                            <div className="mt-1 text-xs text-ink-2">
                              {plural(offer.line_items?.length || 0, 'line')} · confidence {Math.round(Number(offer.extraction_confidence || 0) * 100)}% · price {String(price.reason || '').replaceAll('_', ' ')}
                            </div>
                          </div>
                          {offer.status === 'reviewable' && <Button onClick={() => createPo(offer.id)}>Create PO for review</Button>}
                        </li>
                      );
                    })}
                  </ul>
                ) : <p className="m-0 text-sm text-ink-3">No vendor offers received yet.</p>}
              </section>
            </CardContent>
          </Card>
        )}
      </main>
    </AdminShell>
  );
}

function Meta({ label, value }) {
  return (
    <div className="rounded-lg bg-paper px-3 py-2.5">
      <dt className="text-xs font-medium text-ink-2">{label}</dt>
      <dd className="m-0 mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}
