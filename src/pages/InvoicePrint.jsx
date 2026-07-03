/**
 * Invoice print view — PRD-09 / PRD-17 (browser-rendered PDF).
 *
 * Print-friendly, branded invoice the customer (or CFO) can
 * `Cmd-P → Save as PDF`. Same DOM becomes the server-side PDF source
 * when the renderer lands. Reads the canonical `invoices` row plus the
 * originating order's line items.
 */

import { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useSEO } from '../lib/seo.js';

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

const STATUS_COLOR = { paid: '#2d6a4f', open: D.terra, pending: D.terra, past_due: '#c3382d', overdue: '#c3382d', void: D.ink3 };

export function InvoicePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invoice = db.useRow('invoices', id);
  const order = db.useRow('orders', invoice?.order_id);
  const items = db.useTable('order_items', { where: { order_id: invoice?.order_id } });
  const org = invoice ? db.get('organizations', invoice.customer_id) : null;

  useSEO({ title: `Invoice ${id}`, description: 'Unite Medical invoice.', canonical: `/invoices/${id}/print`, noindex: true });

  const subtotal = useMemo(() => items.reduce((a, b) => a + (Number(b.ext_price) || b.qty * b.unit_price || 0), 0), [items]);
  const freight = order?.freight || 0;
  const tax = order?.tax || 0;
  const total = invoice?.amount ?? +(subtotal + freight + tax).toFixed(2);

  if (!invoice) {
    return (
      <div className="um-print-page">
        <style>{PAGE_STYLE}</style>
        <div className="um-print-sheet">
          <div className="um-print-mono">INVOICE</div>
          <h1 className="um-print-h1">Invoice not found.</h1>
          <p style={{ color: D.ink2, marginTop: 12 }}>We couldn&apos;t find invoice <code>{id}</code>.</p>
          <button type="button" className="um-print-cta um-no-print" onClick={() => navigate('/account/invoices')} style={{ background: D.plum, color: D.paper, marginTop: 20 }}>
            Back to invoices
          </button>
        </div>
      </div>
    );
  }

  const status = (invoice.status || 'open').toLowerCase();
  const statusColor = STATUS_COLOR[status] || D.terra;

  return (
    <div className="um-print-page">
      <style>{PAGE_STYLE}</style>
      <div className="um-print-sheet">
        <div className="um-no-print" style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="um-print-cta" onClick={() => window.print()} style={{ background: D.plum, color: D.paper }}>
            Print / Save as PDF
          </button>
          {invoice.hosted_invoice_url && (
            <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" style={{ padding: '10px 18px', borderRadius: 4, border: `1.5px solid ${D.plum}`, color: D.plum, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
              Pay online →
            </a>
          )}
          <Link to="/account/invoices" style={{ padding: '10px 18px', borderRadius: 4, border: `1px solid ${D.line}`, color: D.ink2, textDecoration: 'none', fontSize: 14 }}>
            ← back to invoices
          </Link>
        </div>

        {/* HEADER */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start', gap: 24, paddingBottom: 22, borderBottom: `2px solid ${D.ink}`, marginBottom: 28 }}>
          <div>
            <div className="um-print-mono">UNITE MEDICAL · INVOICE</div>
            <h1 className="um-print-h1" style={{ marginTop: 6 }}>{invoice.id}</h1>
            <div style={{ fontSize: 13, color: D.ink2, marginTop: 8, lineHeight: 1.6 }}>
              FDA 3015727296 · CAGE 8MK70 · BPA 36F79725D0203<br />
              1487 Trae Lane, Lithia Springs, GA 30122 · 833.868.6483
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, lineHeight: 1.8 }}>
            <div><span style={{ color: D.ink3 }}>Issued: </span>{fmt.date(invoice.created_at || new Date().toISOString(), { year: true })}</div>
            <div><span style={{ color: D.ink3 }}>Due: </span>{fmt.date(invoice.due_date, { year: true })}</div>
            <div><span style={{ color: D.ink3 }}>Terms: </span>{(invoice.terms || 'net30').toUpperCase()}</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '4px 10px', borderRadius: 4, background: `${statusColor}1f`, color: statusColor }}>
                {status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* BILL TO / ORDER */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
          <div>
            <div className="um-print-mono">BILL TO</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{org?.name || invoice.customer_id}</div>
            {org?.billing_email && <div style={{ fontSize: 13, color: D.ink2, marginTop: 4 }}>{org.billing_email}</div>}
          </div>
          <div>
            <div className="um-print-mono">ORDER</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{invoice.order_id || '—'}</div>
            {order?.po_number && <div style={{ fontSize: 13, color: D.ink2, marginTop: 4 }}>PO: {order.po_number}</div>}
          </div>
        </div>

        {/* LINES */}
        <table className="um-print-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Unit</th>
              <th style={{ textAlign: 'right' }}>Extended</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} style={{ color: D.ink3, padding: 24, textAlign: 'center' }}>No line items on the originating order.</td></tr>}
            {items.map((it) => {
              // PDAC L-code travels with the SKU onto the invoice (PRD-28 §3.2).
              const hcpcs = db.get('products', it.sku)?.hcpcs;
              return (
              <tr key={it.id}>
                <td style={{ fontWeight: 500 }}>{it.name}</td>
                <td style={{ fontFamily: D.mono, fontSize: 12 }}>{it.sku}{hcpcs ? <div style={{ color: D.ink2, fontSize: 11 }}>HCPCS {hcpcs}</div> : null}</td>
                <td style={{ textAlign: 'right', fontFamily: D.mono }}>{fmt.number(it.qty)}</td>
                <td style={{ textAlign: 'right', fontFamily: D.mono }}>{fmt.money(it.unit_price)}</td>
                <td style={{ textAlign: 'right', fontFamily: D.mono, fontWeight: 600, color: D.plum }}>{fmt.money(it.ext_price || it.qty * it.unit_price)}</td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            {(freight > 0 || tax > 0) && (
              <>
                <tr><td colSpan={4} style={{ textAlign: 'right', paddingTop: 12, color: D.ink2 }}>Subtotal</td><td style={{ textAlign: 'right', paddingTop: 12, fontFamily: D.mono }}>{fmt.money(subtotal)}</td></tr>
                {freight > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', color: D.ink2 }}>Freight</td><td style={{ textAlign: 'right', fontFamily: D.mono }}>{fmt.money(freight)}</td></tr>}
                {tax > 0 && <tr><td colSpan={4} style={{ textAlign: 'right', color: D.ink2 }}>Tax</td><td style={{ textAlign: 'right', fontFamily: D.mono }}>{fmt.money(tax)}</td></tr>}
              </>
            )}
            <tr style={{ borderTop: `2px solid ${D.ink}` }}>
              <td colSpan={4} style={{ paddingTop: 14, fontWeight: 600 }}>Total due</td>
              <td style={{ textAlign: 'right', paddingTop: 14, fontFamily: D.display, fontSize: 20, color: D.plum }}>{fmt.money(total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* REMITTANCE */}
        <div className="um-print-card" style={{ marginTop: 28 }}>
          <div className="um-print-mono">REMITTANCE</div>
          <div style={{ fontSize: 13, color: D.ink2, marginTop: 10, lineHeight: 1.6 }}>
            {status === 'paid'
              ? <>Paid in full{invoice.paid_at ? ` on ${fmt.date(invoice.paid_at, { year: true })}` : ''}. Thank you.</>
              : <>Remit via ACH on file{invoice.hosted_invoice_url ? ', or pay online using the link above' : ''}. Reference invoice <strong>{invoice.id}</strong>. Net terms per your account agreement.</>}
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: D.ink3, lineHeight: 1.6 }}>
          Prices in USD. Questions on this invoice? Email billing@unitemedical.net or call 833.868.6483.
        </div>
      </div>
    </div>
  );
}
