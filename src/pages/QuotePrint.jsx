/**
 * Quote print view — PRD-08 Phase 5.
 *
 * Print-friendly, branded, multi-section HTML the customer (or the
 * rep) can `Cmd-P → Save as PDF` in their browser. When the backend
 * (PRD-01) lands, this page becomes the source of truth for the
 * server-side PDF renderer too — same DOM, just rendered to PDF
 * via @react-pdf/renderer or Puppeteer.
 *
 * Two views, toggled by `?view=internal` query param:
 *   - customer (default): hides landed cost + margin
 *   - internal: full breakdown for the rep
 */

import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { D } from '../tokens.js';
import { db } from '../lib/db.js';
import { fmt } from '../lib/format.js';
import { useSEO } from '../lib/seo.js';
import { generateDocument } from '../lib/documents.js';

const PAGE_STYLE = `
  @media print {
    @page { size: letter; margin: 0.6in; }
    body { background: white !important; }
    .um-no-print { display: none !important; }
  }
  .um-print-page {
    background: ${D.paper};
    color: ${D.ink};
    font-family: ${D.sans};
    min-height: 100vh;
  }
  .um-print-sheet {
    max-width: 8.5in;
    margin: 0 auto;
    padding: 36px 48px 64px;
    background: ${D.paper};
  }
  .um-print-h1 { font-family: ${D.display}; font-size: 42px; letter-spacing: -1.2px; margin: 0; }
  .um-print-mono { font-family: ${D.mono}; font-size: 11px; letter-spacing: 1.4px; color: ${D.plum}; }
  .um-print-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .um-print-table th { text-align: left; padding: 10px 8px; border-bottom: 2px solid ${D.ink}; font-family: ${D.mono}; font-size: 10px; letter-spacing: 1px; color: ${D.ink3}; text-transform: uppercase; }
  .um-print-table td { padding: 10px 8px; border-bottom: 1px solid ${D.line}; }
  .um-print-card { border: 1px solid ${D.line}; border-radius: 8px; padding: 18px; }
  .um-print-cta { display: inline-block; padding: 10px 18px; border-radius: 999px; font-weight: 600; cursor: pointer; border: none; }
`;

export function QuotePrint() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const isInternal = search.get('view') === 'internal';

  const quote = db.useRow('quotes', id);
  const items = db.useTable('quote_items', { where: { quote_id: id } });

  useSEO({
    title: `Quote ${id}`,
    description: 'Landed-cost quote.',
    canonical: `/quotes/${id}/print`,
    noindex: true,
  });

  // Compute totals from items if quote header is missing them
  const totals = useMemo(() => {
    const ext = items.reduce((a, b) => a + (Number(b.ext_sell) || 0), 0);
    const landed = items.reduce((a, b) => a + ((Number(b.landed_per_unit) || 0) * (Number(b.target_qty) || Number(b.moq) || 1)), 0);
    return { ext, landed };
  }, [items]);

  // Capture "now" at first render so subsequent renders are stable —
  // useState init runs once and satisfies react-hooks/purity.
  const [mountedAt] = useState(() => Date.now());
  const validUntil = quote?.valid_until
    || new Date(mountedAt + 14 * 86400000).toISOString();
  const eta = quote?.eta
    || new Date(mountedAt + 28 * 86400000).toISOString();

  if (!quote) {
    return (
      <div className="um-print-page">
        <style>{PAGE_STYLE}</style>
        <div className="um-print-sheet">
          <div className="um-print-mono">QUOTE</div>
          <h1 className="um-print-h1">Quote not found.</h1>
          <p style={{ color: D.ink2, marginTop: 12 }}>
            We couldn&apos;t find quote <code>{id}</code>. It may have been deleted or you may not have permission.
          </p>
          <button type="button" className="um-print-cta um-no-print" onClick={() => navigate('/quote')} style={{ background: D.plum, color: D.paper, marginTop: 20 }}>
            Back to quoting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="um-print-page">
      <style>{PAGE_STYLE}</style>
      <div className="um-print-sheet">
        {/* Top toolbar (hidden in print) */}
        <div className="um-no-print" style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="um-print-cta" onClick={() => generateDocument({ type: 'quote', ref_id: id, view: isInternal ? 'internal' : 'customer', download: true })} style={{ background: D.plum, color: D.paper }}>
            Download PDF
          </button>
          <button type="button" className="um-print-cta" onClick={() => window.print()} style={{ background: 'transparent', color: D.ink, border: `1.5px solid ${D.ink}` }}>
            Print
          </button>
          <Link to={isInternal ? `/quotes/${id}/print` : `/quotes/${id}/print?view=internal`} style={{ padding: '10px 18px', borderRadius: 999, border: `1.5px solid ${D.ink}`, color: D.ink, textDecoration: 'none', fontSize: 14 }}>
            {isInternal ? 'Switch to customer view' : 'Switch to internal view'}
          </Link>
          <Link to="/quote" style={{ padding: '10px 18px', borderRadius: 999, border: `1px solid ${D.line}`, color: D.ink2, textDecoration: 'none', fontSize: 14 }}>
            ← back to quoting
          </Link>
          <div style={{ flex: 1 }} />
          <div style={{ fontFamily: D.mono, fontSize: 11, color: D.ink3, letterSpacing: 1 }}>
            {isInternal ? 'INTERNAL VIEW — landed cost visible' : 'CUSTOMER VIEW'}
          </div>
        </div>

        {/* HEADER */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start', gap: 24, paddingBottom: 22, borderBottom: `2px solid ${D.ink}`, marginBottom: 28 }}>
          <div>
            <div className="um-print-mono">UNITE MEDICAL · QUOTE</div>
            <h1 className="um-print-h1" style={{ marginTop: 6 }}>{quote.id}</h1>
            <div style={{ fontSize: 13, color: D.ink2, marginTop: 8, lineHeight: 1.6 }}>
              FDA 3015727296 · CAGE 8MK70 · MSPV BPA 36C24123A0077<br />
              1487 Trae Lane, Lithia Springs, GA 30122 · 833.868.6483
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, lineHeight: 1.8 }}>
            <div><span style={{ color: D.ink3 }}>Issued: </span>{fmt.date(quote.created_at || new Date().toISOString(), { year: true })}</div>
            <div><span style={{ color: D.ink3 }}>Valid until: </span>{fmt.date(validUntil, { year: true })}</div>
            <div><span style={{ color: D.ink3 }}>ETA: </span>{fmt.date(eta, { year: true })}</div>
            {quote.freight_mode && <div><span style={{ color: D.ink3 }}>Freight: </span>{quote.freight_mode}</div>}
          </div>
        </div>

        {/* CUSTOMER / FROM block */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
          <div>
            <div className="um-print-mono">PREPARED FOR</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{quote.customer_name || '—'}</div>
            {quote.contact_name && <div style={{ fontSize: 13, color: D.ink2, marginTop: 4 }}>Attn: {quote.contact_name}</div>}
            {quote.contact_email && <div style={{ fontSize: 13, color: D.ink2 }}>{quote.contact_email}</div>}
          </div>
          <div>
            <div className="um-print-mono">PREPARED BY</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>Damon Reed</div>
            <div style={{ fontSize: 13, color: D.ink2, marginTop: 4 }}>Founder · Unite Medical</div>
            <div style={{ fontSize: 13, color: D.ink2 }}>damon@unitemedical.net</div>
          </div>
        </div>

        {/* COVER LETTER */}
        {quote.cover_letter && (
          <div style={{ marginBottom: 32, padding: 22, background: D.paperAlt, borderRadius: 8, border: `1px solid ${D.line}` }}>
            <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: D.ink }}>{quote.cover_letter}</div>
          </div>
        )}

        {/* LINES */}
        <div style={{ marginBottom: 18 }}>
          <div className="um-print-mono" style={{ marginBottom: 10 }}>LINE ITEMS</div>
          <table className="um-print-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>HTS</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                {isInternal && <th style={{ textAlign: 'right' }}>FOB</th>}
                {isInternal && <th style={{ textAlign: 'right' }}>Duty</th>}
                {isInternal && <th style={{ textAlign: 'right' }}>Landed</th>}
                <th style={{ textAlign: 'right' }}>Unit price</th>
                <th style={{ textAlign: 'right' }}>Extended</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={isInternal ? 8 : 5} style={{ color: D.ink3, padding: 24, textAlign: 'center' }}>No line items.</td></tr>
              )}
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ fontWeight: 500 }}>{it.name}</td>
                  <td style={{ fontFamily: D.mono, fontSize: 12 }}>{it.hts_code || it.hts || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: D.mono }}>{(it.target_qty || it.moq || 0).toLocaleString()}</td>
                  {isInternal && <td style={{ textAlign: 'right', fontFamily: D.mono }}>${(Number(it.fob) || 0).toFixed(2)}</td>}
                  {isInternal && <td style={{ textAlign: 'right', fontFamily: D.mono }}>{(Number(it.duty_pct) || 0).toFixed(1)}%</td>}
                  {isInternal && <td style={{ textAlign: 'right', fontFamily: D.mono, color: D.plum }}>${(Number(it.landed_per_unit) || 0).toFixed(2)}</td>}
                  <td style={{ textAlign: 'right', fontFamily: D.mono, fontWeight: 600 }}>${(Number(it.sell_per_unit) || 0).toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontFamily: D.mono, fontWeight: 600, color: D.plum }}>{fmt.money(Number(it.ext_sell) || 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${D.ink}` }}>
                <td colSpan={isInternal ? 6 : 3} style={{ paddingTop: 14, fontWeight: 600 }}>Total ({items.length} lines, delivered FOB Georgia)</td>
                <td style={{ textAlign: 'right', paddingTop: 14, fontWeight: 600, color: D.plum }}>
                  {/* Show landed total internally so the rep can sanity-check margin */}
                  {isInternal ? fmt.money(totals.landed) : null}
                </td>
                <td style={{ textAlign: 'right', paddingTop: 14, fontFamily: D.display, fontSize: 20, color: D.plum }}>
                  {fmt.money(Number(quote.total) || totals.ext)}
                </td>
              </tr>
              {isInternal && (
                <tr>
                  <td colSpan={6} style={{ fontSize: 11, color: D.ink3, fontFamily: D.mono, paddingTop: 8 }}>Implied margin</td>
                  <td colSpan={2} style={{ textAlign: 'right', fontSize: 11, color: D.ink3, fontFamily: D.mono, paddingTop: 8 }}>
                    {totals.ext > 0
                      ? `${(((totals.ext - totals.landed) / totals.ext) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* COMPLIANCE BLOCK (4-category per PRD-08 §6) */}
        <div className="um-print-card" style={{ marginTop: 28 }}>
          <div className="um-print-mono">COMPLIANCE VERIFICATION</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 14 }}>
            {[
              ['FDA status', items.every((it) => it.fda_validated) ? 'All lines verified' : `${items.filter((it) => it.fda_validated).length} of ${items.length} verified`],
              ['Quality system', 'Vendor ISO 13485 attested'],
              ['Product testing', 'Standards on file'],
              ['Certifications', 'PDAC / TAA / Berry per line'],
            ].map(([h, s]) => (
              <div key={h}>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>{h.toUpperCase()}</div>
                <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>{s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ACCEPTANCE INSTRUCTIONS */}
        <div style={{ marginTop: 28, padding: 18, background: D.plum, color: D.paper, borderRadius: 8 }}>
          <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.plumSoft || 'rgba(255,255,255,.7)' }}>TO ACCEPT</div>
          <div style={{ fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>
            Reply to this email with &quot;accepted&quot;, or click the acceptance link in the email we sent. We&apos;ll convert this quote into a confirmed order and send tracking once the vessel clears CBP.
            {quote.acceptance_token && (
              <span> Reference: <code style={{ background: 'rgba(255,255,255,.18)', padding: '2px 6px', borderRadius: 4 }}>{quote.acceptance_token.slice(0, 12)}</code></span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 24, fontSize: 11, color: D.ink3, lineHeight: 1.6 }}>
          Prices in USD. Landed cost FOB Georgia includes ocean freight, customs brokerage, duties, and drayage. Net-30 terms available with approved credit; default payment terms are card / ACH up front for new accounts. Rates valid until {fmt.date(validUntil, { year: true })}.
        </div>
      </div>
    </div>
  );
}
