// Opt-in checks execute on the staging build host, where protected credentials
// are available. Never print credentials or individual customer records.
import process from 'node:process';
import { neon } from '@neondatabase/serverless';
import { buildBusinessReport, saveBusinessReport } from '../api/_lib/businessIntelligence.js';
if (process.env.VERCEL_PROJECT_ID !== 'prj_PL5BOZooLBtLiPQlrn34SyC0MRKS') throw new Error('BI verification is restricted to the staging project.');
const sql = neon(process.env.DATABASE_URL);
const report = await buildBusinessReport(sql, { start: process.env.UNITE_BI_START, end: process.env.UNITE_BI_END, basis: 'Accrual' });
console.log('Unite BI verification:', JSON.stringify({ qbo: report.qbo.status, shopify: report.shopify.status, order_count: report.shopify.fetched_orders, history_access: report.shopify.all_orders_access }));
if (report.shopify.status !== 'ready') throw new Error('Shopify BI verification failed: ' + (report.shopify.message || report.shopify.warnings?.join(' ')));
const queued = await sql`SELECT data->>'status' AS status,COUNT(*)::int AS count FROM um_rows WHERE tbl='accounting_jobs' AND deleted=false GROUP BY data->>'status'`;
console.log('Unite accounting queue:', JSON.stringify(queued));
if (process.env.UNITE_INITIALIZE_BI === '1') {
  const saved = await saveBusinessReport(sql, report, 'system:initial-bi-report');
  console.log('Unite initial BI report:', JSON.stringify({ id: saved.id, start: saved.period.start, end: saved.period.end }));
}
