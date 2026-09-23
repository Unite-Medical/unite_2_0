import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { draftServerPurchaseOrders } from '../../lib/serverPurchaseOrders.js';
import { vendorPriceStatus } from '../../lib/commercialPolicy.js';
import { useViewport } from '../../lib/viewport.js';

const STATUS_COLOR = {
  new: '#9a7b1e', needs_review: '#c3382d', reviewable: '#2d6a4f',
  approved: '#2d6a4f', po_draft: D.plum,
};

export function AdminSourcing() {
  const { isMobile } = useViewport();
  const requests = db.useTable('sourcing_requests', { orderBy: 'created_at', dir: 'desc' });
  const offers = db.useTable('vendor_offers', { orderBy: 'created_at', dir: 'desc' });
  const [activeId, setActiveId] = useState(requests[0]?.id || null);
  const [notice, setNotice] = useState(null);
  const active = requests.find((request) => request.id === activeId) || requests[0] || null;
  const activeOffers = useMemo(
    () => offers.filter((offer) => offer.sourcing_request_id === active?.id),
    [offers, active?.id],
  );

  async function createPo(offerId) {
    const offer = offers.find((row) => row.id === offerId);
    const result = await draftServerPurchaseOrders('sourcing_offer', {
      offer_id: offerId, expected_revision: Number(offer?.revision || 0),
    });
    setNotice(result.ok
      ? `Draft ${result.purchase_order.id} created. Review it before sending.`
      : `Could not create PO: ${result.reason}`);
  }

  const pad = isMobile ? 20 : 32;
  return (
    <AdminShell active="sourcing">
      <div style={{ padding: `${isMobile ? 28 : 40}px ${pad}px 24px`, borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, letterSpacing: 1.4, color: D.plum }}>SALES · SOURCING DESK</div>
        <h1 style={{ fontFamily: D.display, fontSize: 'clamp(34px, 5vw, 54px)', fontWeight: 400, letterSpacing: -1.2, margin: '8px 0 0' }}>Sourcing requests</h1>
        <div style={{ marginTop: 9, color: D.ink2, fontSize: 13 }}>Every active request has an accountable owner, source record, response clock, and vendor-offer trail.</div>
      </div>

      {notice && <div style={{ margin: `16px ${pad}px 0`, padding: 12, border: `1px solid ${D.line}`, borderRadius: 8, background: D.paperAlt, fontSize: 13 }}>{notice}</div>}

      <div style={{ padding: pad, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '360px 1fr', gap: 18 }}>
        <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, overflow: 'hidden', alignSelf: 'start' }}>
          {requests.map((request) => (
            <button key={request.id} type="button" onClick={() => setActiveId(request.id)} style={{
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, width: '100%', textAlign: 'left',
              padding: 15, border: 'none', borderTop: `1px solid ${D.line}`,
              background: request.id === active?.id ? 'rgba(29,92,77,.06)' : D.card, color: D.ink, cursor: 'pointer',
            }}>
              <span>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{request.organization_name || request.contact_email || 'Unassigned customer'}</span>
                <span style={{ display: 'block', marginTop: 4, color: D.ink2, fontSize: 12 }}>{request.product_description}</span>
                <span style={{ display: 'block', marginTop: 5, color: D.ink3, fontFamily: D.mono, fontSize: 9 }}>{request.account_owner_email}</span>
              </span>
              <span style={{ fontFamily: D.mono, fontSize: 9, color: STATUS_COLOR[request.status] || D.ink3 }}>{String(request.status || 'new').toUpperCase()}</span>
            </button>
          ))}
          {!requests.length && <div style={{ padding: 24, color: D.ink3, fontSize: 13 }}>No sourcing requests yet.</div>}
        </div>

        <div style={{ background: D.card, border: `1px solid ${D.line}`, borderRadius: 12, padding: isMobile ? 20 : 26 }}>
          {!active && <div style={{ color: D.ink3 }}>Select a request.</div>}
          {active && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontFamily: D.mono, color: D.plum, fontSize: 10, letterSpacing: 1 }}>{active.id}</div>
                  <div style={{ fontFamily: D.display, fontSize: 30, marginTop: 5 }}>{active.product_description}</div>
                  <div style={{ color: D.ink2, fontSize: 13, marginTop: 7 }}>{active.organization_name || active.contact_email} · qty {active.quantity || 'not specified'}</div>
                </div>
                {active.purchase_order_id && <Link to="/admin/purchase-orders" style={{ color: D.plum, fontSize: 13 }}>Open {active.purchase_order_id} →</Link>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 10, marginTop: 20 }}>
                <Meta label="OWNER" value={active.account_owner_email} />
                <Meta label="SOURCE" value={(active.source_channels || [active.source_channel]).join(', ')} />
                <Meta label="RESPONSE DUE" value={active.response_due_at ? fmt.date(active.response_due_at, { year: true }) : 'Not set'} />
              </div>

              <div style={{ marginTop: 26, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>VENDOR OFFERS · {activeOffers.length}</div>
              <div style={{ marginTop: 8, display: 'grid', gap: 10 }}>
                {activeOffers.map((offer) => {
                  const firstLine = offer.line_items?.[0] || {};
                  const price = vendorPriceStatus(firstLine);
                  return (
                    <div key={offer.id} style={{ border: `1px solid ${D.line}`, borderRadius: 10, padding: 15, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: 14 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{offer.vendor_name}</div>
                        <div style={{ marginTop: 5, color: D.ink2, fontSize: 12 }}>
                          {offer.line_items?.length || 0} line(s) · confidence {Math.round(Number(offer.extraction_confidence || 0) * 10000) / 100}% · price {price.reason.replaceAll('_', ' ')}
                        </div>
                        <div style={{ marginTop: 4, fontFamily: D.mono, fontSize: 10, color: STATUS_COLOR[offer.status] || D.ink3 }}>{offer.status.toUpperCase()}</div>
                      </div>
                      {offer.status === 'reviewable' && (
                        <button type="button" onClick={() => createPo(offer.id)} style={{ alignSelf: 'center', background: D.plum, color: D.paper, border: 'none', padding: '10px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                          Create PO for review
                        </button>
                      )}
                    </div>
                  );
                })}
                {!activeOffers.length && <div style={{ color: D.ink3, fontSize: 13, padding: '8px 0' }}>No vendor offers received yet.</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function Meta({ label, value }) {
  return (
    <div style={{ padding: 12, background: D.paperAlt, borderRadius: 8 }}>
      <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: 1, color: D.ink3 }}>{label}</div>
      <div style={{ marginTop: 5, fontSize: 12.5, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}
