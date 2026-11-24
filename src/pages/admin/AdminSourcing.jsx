import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSearch } from 'lucide-react';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.jsx';
import { DataTable } from '../../components/ui/data-table.jsx';
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
  const [activeId, setActiveId] = useState(null);
  const [notice, setNotice] = useState(null);
  const detailRef = useRef(null);

  const staged = useMemo(() => {
    const byRequest = {};
    for (const offer of offers) (byRequest[offer.sourcing_request_id] ||= []).push(offer);
    return requests.map((r) => ({ ...r, offerCount: (byRequest[r.id] || []).length, stage: requestStage(r, byRequest[r.id] || []) }));
  }, [requests, offers]);


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

        <DataTable
          label="Sourcing requests"
          rows={staged}
          searchPlaceholder="Customer, product or owner"
          searchText={(r) => [customerName(r), r.product_description, r.account_owner_email].join(' ')}
          tabs={TABS.map(([v, t, fn]) => ({ id: v, label: t, filter: fn }))}
          filters={[{ id: 'owner', label: 'Owner', value: (r) => r.account_owner_email || 'Unassigned' }, { id: 'stage', label: 'Status', value: (r) => r.stage, format: (v) => String(v).replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) }]}
          defaultSort={{ id: 'due', dir: 'asc' }}
          onRowClick={(r) => open(r.id)}
          empty={<EmptyState icon={FileSearch} title="No sourcing requests yet" description="Requests appear here when a customer asks Unite to find a product it does not stock." />}
          columns={[
            { id: 'customer', header: 'Customer', sortValue: customerName, cell: (r) => <button type="button" className={cn('border-0 bg-transparent p-0 text-left font-semibold hover:text-brand', r.id === activeId ? 'text-brand' : 'text-ink')} onClick={() => open(r.id)}>{customerName(r)}</button> },
            { id: 'product', header: 'Product', accessor: 'product_description', className: 'max-w-80 text-ink-2' },
            { id: 'qty', header: 'Quantity', align: 'right', sortValue: (r) => Number(r.quantity) || null, cell: (r) => r.quantity || '—' },
            { id: 'owner', header: 'Owner', sortValue: (r) => r.account_owner_email || '', cell: (r) => <span className="text-ink-2">{r.account_owner_email || 'Unassigned'}</span> },
            { id: 'due', header: 'Response due', sortValue: (r) => r.response_due_at || r.due_at || r.needed_by || null, cell: (r) => <span className="whitespace-nowrap text-ink-2">{dueDate(r)}</span> },
            { id: 'offers', header: 'Offers', align: 'right', accessor: 'offerCount' },
            { id: 'status', header: 'Status', accessor: 'stage', cell: (r) => <StatusBadge value={r.stage} /> },
          ]}
        />

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
