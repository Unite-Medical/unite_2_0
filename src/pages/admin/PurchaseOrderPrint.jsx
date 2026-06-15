/**
 * Purchase-order print view — PRD-12 / PRD-17.
 *
 * Vendor-facing, branded PO the buyer can `Cmd-P → Save as PDF` or that
 * feeds the server-side PDF renderer. Reads a `purchase_orders` row and
 * shows ordered vs received quantities so it doubles as a receiving doc.
 */

import { useParams, useNavigate, Link } from 'react-router-dom';
import { D } from '../../tokens.js';
import { db } from '../../lib/db.js';
import { fmt } from '../../lib/format.js';
import { useSEO } from '../../lib/seo.js';
import { vendorEmail } from '../../lib/purchaseOrders.js';

const PAGE_STYLE = `
  @media print {
    @page { size: letter; margin: 0.6in; }
    body { background: white !important; }
    .um-no-print { display: none !important; }
  }
  .um-print-page { background: ${D.paper}; color: ${D.ink}; font-family: ${D.sans}; min-height: 100vh; }
  .um-print-sheet { max-width: 8.5in; margin: 0 auto; padding: 36px 48px 64px; background: ${D.paper}; }
  .um-print-h1 { font-family: ${D.display}; font-size: 42px; letter-spacing: -1.2px; margin: 0; }
  .um-print-mono { font-family: ${D.mono}; font-size: 11px; letter-spacing: 1.4px; color: ${D.plum}; }
  .um-print-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .um-print-table th { text-align: left; padding: 10px 8px; border-bottom: 2px solid ${D.ink}; font-family: ${D.mono}; font-size: 10px; letter-spacing: 1px; color: ${D.ink3}; text-transform: uppercase; }
  .um-print-table td { padding: 10px 8px; border-bottom: 1px solid ${D.line}; }
  .um-print-card { border: 1px solid ${D.line}; border-radius: 8px; padding: 18px; }
  .um-print-cta { display: inline-block; padding: 10px 18px; border-radius: 999px; font-weight: 600; cursor: pointer; border: none; }
`;

const STATUS_COLOR = { draft: D.ink3, approved: D.terra, sent: D.plum, partially_received: '#9a7b1e', received: '#2d6a4f', closed: '#2d6a4f', cancelled: '#c3382d' };

export function PurchaseOrderPrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const po = db.useRow('purchase_orders', id);

  useSEO({ title: `PO ${id}`, description: 'Unite Medical purchase order.', canonical: `/admin/purchase-orders/${id}/print`, noindex: true });

  if (!po) {
    return (
      <div className="um-print-page">
        <style>{PAGE_STYLE}</style>
        <div className="um-print-sheet">
          <div className="um-print-mono">PURCHASE ORDER</div>
          <h1 className="um-print-h1">PO not found.</h1>
          <p style={{ color: D.ink2, marginTop: 12 }}>We couldn&apos;t find purchase order <code>{id}</code>.</p>
          <button type="button" className="um-print-cta um-no-print" onClick={() => navigate('/admin/replenishment')} style={{ background: D.plum, color: D.paper, marginTop: 20 }}>
            Back to replenishment
          </button>
        </div>
      </div>
    );
  }

  const status = (po.status || 'draft').toLowerCase();
  const statusColor = STATUS_COLOR[status] || D.ink3;
  const lines = po.line_items || [];
  const anyReceived = lines.some((l) => (l.received_qty || 0) > 0);

  return (
    <div className="um-print-page">
      <style>{PAGE_STYLE}</style>
      <div className="um-print-sheet">
        <div className="um-no-print" style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="um-print-cta" onClick={() => window.print()} style={{ background: D.plum, color: D.paper }}>
            Print / Save as PDF
          </button>
          <Link to="/admin/replenishment" style={{ padding: '10px 18px', borderRadius: 999, border: `1px solid ${D.line}`, color: D.ink2, textDecoration: 'none', fontSize: 14 }}>
            ← back to replenishment
          </Link>
        </div>

        {/* HEADER */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start', gap: 24, paddingBottom: 22, borderBottom: `2px solid ${D.ink}`, marginBottom: 28 }}>
          <div>
            <div className="um-print-mono">UNITE MEDICAL · PURCHASE ORDER</div>
            <h1 className="um-print-h1" style={{ marginTop: 6 }}>{po.id}</h1>
            <div style={{ fontSize: 13, color: D.ink2, marginTop: 8, lineHeight: 1.6 }}>
              Unite Medical · FDA 3015727296 · CAGE 8MK70<br />
              Ship to: 1487 Trae Lane, Lithia Springs, GA 30122 · 833.868.6483
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, lineHeight: 1.8 }}>
            <div><span style={{ color: D.ink3 }}>Issued: </span>{fmt.date(po.created_at || new Date().toISOString(), { year: true })}</div>
            <div><span style={{ color: D.ink3 }}>Expected: </span>{fmt.date(po.expected_delivery, { year: true })}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '4px 10px', borderRadius: 999, background: `${statusColor}1f`, color: statusColor }}>
                {status.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* VENDOR */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
          <div>
            <div className="um-print-mono">VENDOR</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{po.vendor_name || '—'}</div>
            <div style={{ fontSize: 13, color: D.ink2, marginTop: 4 }}>{po.sent_to || vendorEmail(po.vendor_name)}</div>
          </div>
          <div>
            <div className="um-print-mono">REFERENCES</div>
            <div style={{ fontSize: 13, color: D.ink2, marginTop: 6 }}>WMS: {po.wms_po_id || '—'}</div>
            <div style={{ fontSize: 13, color: D.ink2 }}>QBO PO: {po.qbo_po_id || '—'}</div>
          </div>
        </div>

        {/* LINES */}
        <table className="um-print-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              {anyReceived && <th style={{ textAlign: 'right' }}>Received</th>}
              <th style={{ textAlign: 'right' }}>Unit cost</th>
              <th style={{ textAlign: 'right' }}>Extended</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={anyReceived ? 6 : 5} style={{ color: D.ink3, padding: 24, textAlign: 'center' }}>No line items.</td></tr>}
            {lines.map((l) => (
              <tr key={l.sku}>
                <td style={{ fontWeight: 500 }}>{l.name}</td>
                <td style={{ fontFamily: D.mono, fontSize: 12 }}>{l.sku}</td>
                <td style={{ textAlign: 'right', fontFamily: D.mono }}>{fmt.number(l.qty)}</td>
                {anyReceived && <td style={{ textAlign: 'right', fontFamily: D.mono, color: (l.received_qty || 0) >= l.qty ? '#2d6a4f' : '#9a7b1e' }}>{fmt.number(l.received_qty || 0)}</td>}
                <td style={{ textAlign: 'right', fontFamily: D.mono }}>{fmt.money(l.cost || 0)}</td>
                <td style={{ textAlign: 'right', fontFamily: D.mono, fontWeight: 600, color: D.plum }}>{fmt.money((l.qty || 0) * (l.cost || 0))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${D.ink}` }}>
              <td colSpan={anyReceived ? 5 : 4} style={{ paddingTop: 14, fontWeight: 600 }}>Total ({lines.length} lines)</td>
              <td style={{ textAlign: 'right', paddingTop: 14, fontFamily: D.display, fontSize: 20, color: D.plum }}>{fmt.money(po.total_cost || 0)}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: 28, padding: 18, background: D.plum, color: D.paper, borderRadius: 8 }}>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plumSoft || 'rgba(255,255,255,.7)' }}>TERMS</div>
          <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
            Please confirm receipt and expected ship date. Reference PO {po.id} on all shipping documents and invoices. Deliver to the Lithia Springs address above unless otherwise instructed.
          </div>
        </div>
      </div>
    </div>
  );
}
