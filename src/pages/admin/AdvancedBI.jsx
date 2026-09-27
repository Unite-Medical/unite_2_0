import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { downloadRows, money } from '../../lib/commerceClient.js';
import '../../styles/advanced-bi.css';

async function request(query = {}, body) {
  const response = await fetch('/api/admin/business-intelligence?' + new URLSearchParams(query), { credentials: 'include', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load business reports.');
  return data;
}
const statusLabel = status => ({ ready: 'Ready', partial: 'Partial coverage', unavailable: 'Needs connection', active: 'Authorized', not_connected: 'Not connected' }[status] || 'Needs attention');
function ReportTable({ report }) {
  if (report.status !== 'ready') return <p className="bi-notice">{report.message}</p>;
  if (!report.rows.length) return <p>No rows were returned for this report.</p>;
  return <div className="bi-table-scroll"><table><thead><tr>{report.columns.map((c, i) => <th key={i}>{c || (i === 0 ? 'Account' : 'Amount')}</th>)}</tr></thead><tbody>{report.rows.map((r, i) => <tr key={i} className={'bi-row-' + r.type}>{r.cells.map((cell, j) => <td key={j} style={j === 0 ? { paddingLeft: 16 + r.depth * 12 } : undefined}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
export function AdvancedBI() {
  const [params, setParams] = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today.slice(0, 7) + '-01'), [end, setEnd] = useState(today), [basis, setBasis] = useState('Accrual');
  const [data, setData] = useState(null), [report, setReport] = useState(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [tab, setTab] = useState('overview');
  const selectedId = params.get('report');
  useEffect(() => {
    let active = true;
    request().then(async result => {
      const selected = selectedId ? (await request({ id: selectedId })).report : result.report;
      if (active) { setData(result); setReport(selected); setError(''); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId]);
  async function generate(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await request({}, { start, end, basis });
      setReport(result.report); setParams({ report: result.report.id });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function exportReport() {
    const common = { report_id: report.id, retrieved_at: report.created_at, start: report.period.start, end: report.period.end, basis: report.period.basis };
    const rows = [
      ...report.notes.map(note => ({ ...common, section: 'Definitions', note })),
      ...report.findings.map(note => ({ ...common, section: 'Findings', note })),
      ...report.qbo.reports.flatMap(r => r.status === 'ready' ? r.rows.map(row => ({ ...common, source: 'QuickBooks', section: r.label, status: r.status, currency: r.currency, ...Object.fromEntries(row.cells.map((c, i) => ['column_' + (i + 1), c])) })) : [{ ...common, source: 'QuickBooks', section: r.label, status: r.status, note: r.message }]),
      { ...common, source: 'QuickBooks', section: 'Coverage', status: report.qbo.status, note: report.qbo.message || '' },
      { ...common, source: 'Shopify', section: 'Coverage', status: report.shopify.status, note: [...(report.shopify.warnings || []), report.shopify.message].filter(Boolean).join(' ') },
      ...(report.shopify.currencies || []).map(r => ({ ...common, source: 'Shopify', section: 'Order cohort', status: report.shopify.status, ...r })),
      ...(report.shopify.monthly || []).map(r => ({ ...common, source: 'Shopify', section: 'Monthly order cohort', status: report.shopify.status, ...r })),
      ...(report.shopify.customers || []).map(r => ({ ...common, source: 'Shopify', section: 'Customer order cohort', status: report.shopify.status, ...r })),
    ];
    downloadRows(rows, `Unite-business-report-${report.period.start}-${report.period.end}.csv`);
  }
  const prompt = report ? `Read saved BI report ${report.id}. Give me an executive report for ${report.period.start} to ${report.period.end}: accounting performance, order trends, customers and actions. Distinguish incomplete coverage and source definitions. Do not add Shopify order values to QuickBooks revenue. Then create a branded downloadable report with the verified figures and sources. Do not change business records.` : '';
  const sourceCards = report ? [['QuickBooks', report.qbo], ['Shopify', report.shopify]] : [];
  return <AdminShell active="advanced-bi"><main id="main" className="bi-page">
    <header className="bi-heading"><div><span className="bi-eyebrow">Unite intelligence</span><h1>Advanced BI</h1><p>Your books, your sales, and the decisions behind them.</p></div><Link className="bi-button" to="/admin/integrations">Connections</Link></header>
    <form className="bi-controls" onSubmit={generate}><label>From<input type="date" required value={start} onChange={e => setStart(e.target.value)} /></label><label>Through<input type="date" required min={start} value={end} onChange={e => setEnd(e.target.value)} /></label><label>Accounting basis<select value={basis} onChange={e => setBasis(e.target.value)}><option>Accrual</option><option>Cash</option></select></label><button className="bi-button primary" disabled={busy || loading}>{busy ? 'Building report…' : 'Generate report'}</button></form>
    {error && <p className="bi-error" role="alert">{error}</p>}
    {data && !data.connections.qbo_app_configured && <aside className="bi-notice"><strong>Connect your migrated QuickBooks company</strong><p>The Intuit app credentials still need to be configured. After setup, an administrator can authorize the company. Shopify reports can be generated while accounting is being connected.</p><Link to="/admin/integrations">Review connection setup →</Link></aside>}
    {data?.connections.qbo_app_configured && data.connections.qbo_status !== 'active' && <aside className="bi-notice"><strong>QuickBooks needs authorization</strong><p>Connect the company containing your migrated books to include accounting statements.</p><a href="/api/auth/qbo/connect">Connect QuickBooks Online →</a></aside>}
    {loading && <p role="status">Loading saved reports…</p>}
    {!loading && !report && <section className="bi-empty"><span className="bi-eyebrow">A shared view of the business</span><h2>Start with a report.</h2><p>Choose your dates to bring accounting statements and live sales data into one review. Ask Unite to explain the results, create a report, and prepare follow-up work.</p><div className="bi-empty-grid"><div><strong>Financial performance</strong><p>Profit & loss, balance sheet, receivables and payables.</p></div><div><strong>Sales performance</strong><p>Order value, monthly trends, customer concentration and fulfillment work.</p></div><div><strong>Ask Unite</strong><p>Answers and downloadable reports grounded in the same saved figures.</p></div></div></section>}
    {report && <>
      <section className="bi-report-heading"><div><h2>{report.period.start} — {report.period.end}</h2><p>{report.period.basis} accounting · Saved {new Date(report.created_at).toLocaleString()}</p></div><div className="bi-actions"><button className="bi-button" onClick={exportReport}>Download CSV</button><button className="bi-button" onClick={() => window.print()}>Print report</button><Link className="bi-button primary" to={'/admin/chat?prompt=' + encodeURIComponent(prompt)}>Analyze with Unite</Link></div></section>
      <div className="bi-sources">{sourceCards.map(([name, source]) => <div key={name}><strong>{name}</strong><span className={'bi-status ' + source.status}>{statusLabel(source.status)}</span><small>{source.retrieved_at ? 'Retrieved ' + new Date(source.retrieved_at).toLocaleString() : source.message}</small>{source.environment === 'sandbox' && <b>Sandbox company — test data</b>}{source.warnings?.map(w => <p key={w}>{w}</p>)}</div>)}</div>
      <nav className="bi-tabs" aria-label="Report sections">{[['overview', 'Overview'], ['accounting', 'Accounting'], ['customers', 'Customers'], ['definitions', 'Sources & definitions']].map(([id, label]) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>{label}</button>)}</nav>
      {tab === 'overview' && <>
        <section className="bi-panel"><h2>Business report</h2><ul>{report.findings.map(f => <li key={f}>{f}</li>)}</ul></section>
        {report.shopify.currencies?.map(c => <section key={c.currency}><h2 className="bi-section-title">Shopify order cohort · {c.currency}{report.shopify.status === 'partial' ? ' · Partial results' : ''}</h2><div className="bi-metrics">{[['Current order value', money(c.current_order_value, c.currency), 'Includes tax and shipping'], ['Eligible orders', c.orders.toLocaleString(), 'Excludes tests and cancellations'], ['Average order value', money(c.average_order_value, c.currency), 'Current value ÷ eligible orders'], ['Open fulfillment', c.unfulfilled.toLocaleString(), 'Selected orders still in progress']].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div></section>)}
        {!!report.shopify.monthly?.length && <section className="bi-panel"><h2>Monthly order value</h2><p>Grouped by creation month in UTC, using current order values.</p><div className="bi-trends">{report.shopify.monthly.map(r => { const max = Math.max(...report.shopify.monthly.filter(m => m.currency === r.currency).map(m => m.current_order_value), 1); return <div key={r.month + r.currency}><span>{r.month} · {r.currency}</span><div className="bi-bar"><span style={{ width: Math.max(0, r.current_order_value / max * 100) + '%' }} /></div><strong>{money(r.current_order_value, r.currency)}</strong><small>{r.orders} orders</small></div>; })}</div></section>}
      </>}
      {tab === 'accounting' && <>{!report.qbo.reports.length && <section className="bi-panel"><h2>Accounting reports will appear after connection</h2><p>{report.qbo.message}</p></section>}{report.qbo.reports.map(r => <section className="bi-panel" key={r.id}><h2>{r.label}</h2><p>{r.currency || ''} {r.basis || ''} · {r.id === 'ProfitAndLoss' ? 'Selected period' : 'As of ' + report.period.end}</p><ReportTable report={r} /></section>)}</>}
      {tab === 'customers' && <section className="bi-panel"><h2>Customer order value</h2><p>Current values for orders created in the selected period. This is not accounts receivable. Customers are grouped by Shopify ID; currencies stay separate.</p>{!report.shopify.customers?.length ? <p>No customer results are available.</p> : <div className="bi-table-scroll"><table><thead><tr><th>Customer</th><th>Currency</th><th>Orders</th><th>Current order value</th></tr></thead><tbody>{report.shopify.customers.map(c => <tr key={c.id + c.currency}><td>{c.name}</td><td>{c.currency}</td><td>{c.orders}</td><td>{money(c.current_order_value, c.currency)}</td></tr>)}</tbody></table></div>}</section>}
      {tab === 'definitions' && <section className="bi-panel"><h2>How to read this report</h2><ul>{report.notes.map(note => <li key={note}>{note}</li>)}</ul><p>Report ID: {report.id}</p><p>Saved reports preserve the data returned at generation time. Generate another report to refresh the figures.</p></section>}
    </>}
    {!!data?.history.length && <section className="bi-panel bi-history"><h2>Recent reports</h2>{data.history.map(r => <button key={r.id} onClick={() => setParams({ report: r.id })}>{r.period.start} — {r.period.end}<span>{r.period.basis} · {new Date(r.created_at).toLocaleString()}</span></button>)}</section>}
  </main></AdminShell>;
}
