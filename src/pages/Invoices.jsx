import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { D } from '../tokens.js';
import { Nav } from '../components/layout/Nav.jsx';
import { Footer } from '../components/layout/Footer.jsx';
import { PageHead } from '../components/layout/PageHead.jsx';
import { auth } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { qbo } from '../lib/services.js';
import { fmt } from '../lib/format.js';
import { useViewport } from '../lib/viewport.js';
import { useSEO } from '../lib/seo.js';

export function Invoices() {
  const navigate = useNavigate();
  const session = auth.use();
  const { isMobile } = useViewport();
  const padX = isMobile ? 20 : 40;
  useSEO({ title: 'Invoices', noindex: true });
  const orgId = session?.org_id || 'org_atlsurgical';
  const invoices = db.useTable('invoices', { where: { customer_id: orgId }, orderBy: 'due_date', dir: 'desc' });

  const stats = useMemo(() => {
    const open = invoices.filter((i) => i.status === 'open');
    const past_due = open.filter((i) => new Date(i.due_date) < new Date());
    const ytd = invoices.filter((i) => new Date(i.created_at).getFullYear() === new Date().getFullYear()).reduce((a, b) => a + b.amount, 0);
    return {
      ar: open.reduce((a, b) => a + b.amount, 0),
      past_due: past_due.reduce((a, b) => a + b.amount, 0),
      ytd,
      avg_dpo: invoices.length ? Math.round(invoices.filter((i) => i.status === 'paid').reduce((a) => a + 14, 0) / Math.max(1, invoices.filter((i) => i.status === 'paid').length)) : 0,
    };
  }, [invoices]);

  async function handlePayAll() {
    for (const inv of invoices.filter((i) => i.status === 'open')) {
      await qbo.recordPayment({ invoice_id: inv.qbo_id || inv.id, amount: inv.amount, method: 'ach' });
      db.update('invoices', inv.id, { status: 'paid' });
    }
  }

  function exportCsv() {
    const header = 'invoice,order,date,amount,terms,due,status\n';
    const body = invoices.map((i) => [i.id, i.order_id, i.created_at, i.amount, i.terms, i.due_date, i.status].join(',')).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ background: D.paper, fontFamily: D.sans, color: D.ink, minHeight: '100vh' }}>
      <Nav />
      <main id="main">
        <PageHead eyebrow="ACCOUNT · INVOICES" title="Invoices & billing" sub="Pay outstanding balances, export to your AP system, and reconcile against our billing system automatically." />
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: `24px ${padX}px ${isMobile ? 56 : 64}px` }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              [fmt.money(stats.ar), 'Current AR'],
              [fmt.money(stats.past_due), 'Past due'],
              [fmt.money(stats.ytd), 'YTD spend'],
              [`${stats.avg_dpo} days`, 'Avg DPO'],
            ].map(([b, s], i) => (
              <div key={s} style={{ padding: isMobile ? 18 : 24, background: D.card, borderRadius: 14, border: `1px solid ${D.line}` }}>
                <div style={{ fontFamily: D.display, fontSize: isMobile ? 24 : 36, color: i === 1 && stats.past_due === 0 ? D.ink3 : D.plum, letterSpacing: -0.8, lineHeight: 1 }}>{b}</div>
                <div style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3, marginTop: 10 }}>{s.toUpperCase()}</div>
              </div>
            ))}
          </div>
          <div style={{ background: D.card, borderRadius: 14, border: `1px solid ${D.line}`, overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${D.line}`, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ fontFamily: D.display, fontSize: 22, letterSpacing: -0.3 }}>Invoice history · {invoices.length} records</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={exportCsv} style={{ background: 'transparent', color: D.ink2, border: `1px solid ${D.line}`, padding: '8px 14px', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}>Export CSV</button>
                <button onClick={handlePayAll} disabled={stats.ar === 0} style={{ background: D.plum, color: D.paper, border: 'none', padding: '8px 16px', borderRadius: 999, fontSize: 12, cursor: stats.ar === 0 ? 'not-allowed' : 'pointer', opacity: stats.ar === 0 ? 0.5 : 1 }}>
                  Pay all outstanding
                </button>
              </div>
            </div>
            {invoices.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: D.ink3 }}>No invoices yet.</div>}
            {invoices.length > 0 && (
              <div className={isMobile ? 'um-scroll-x' : ''}>
              <table style={{ width: '100%', minWidth: isMobile ? 720 : 'auto', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: D.paperAlt, fontFamily: D.mono, fontSize: 10, letterSpacing: 1, color: D.ink3 }}>
                    {['INVOICE #', 'ORDER', 'AMOUNT', 'TERMS', 'DUE', 'STATUS', ''].map((h) => <th key={h} style={{ padding: '12px 18px', textAlign: 'left' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => {
                    const isPaid = inv.status === 'paid';
                    return (
                      <tr key={inv.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${D.line}` }}>
                        <td style={{ padding: '14px 18px', fontFamily: D.mono, color: D.plum, fontWeight: 600 }}>{inv.id}</td>
                        <td style={{ padding: '14px 18px', fontFamily: D.mono, fontSize: 12 }}>
                          <button onClick={() => navigate(`/orders/${inv.order_id}/track`)} style={{ background: 'none', border: 'none', color: D.ink, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>{inv.order_id}</button>
                        </td>
                        <td style={{ padding: '14px 18px', fontFamily: D.mono }}>{fmt.money(inv.amount)}</td>
                        <td style={{ padding: '14px 18px', color: D.ink2 }}>{(inv.terms || '').toUpperCase()}</td>
                        <td style={{ padding: '14px 18px', color: D.ink2 }}>{fmt.date(inv.due_date)}</td>
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{ fontFamily: D.mono, fontSize: 10, letterSpacing: 1, padding: '4px 10px', borderRadius: 999, background: isPaid ? 'rgba(94,41,99,.1)' : D.terraSoft, color: isPaid ? D.ink2 : D.terra }}>{(inv.status || 'OPEN').toUpperCase()}</span>
                        </td>
                        <td style={{ padding: '14px 18px', fontFamily: D.mono, fontSize: 11, color: D.plum, textAlign: 'right', cursor: 'pointer' }}>PDF →</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
