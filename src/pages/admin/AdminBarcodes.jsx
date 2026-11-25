import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { DataTable } from '../../components/ui/data-table.jsx';
import { Badge } from '../../components/ui/badge.jsx';
import readiness from '../../data/barcodeReadiness.generated.json';
import '../../styles/ui.css';

const PRIORITY = { launch_operational: 'Launch · in stock', launch_no_stock: 'Launch · no stock', not_launching: 'Not launching' };
const priorityLabel = (v) => PRIORITY[v] || String(v || '').replaceAll('_', ' ');
const rowId = (r) => `${r.product_handle}|${r.sku}|${r.variant_title}`;

export function AdminBarcodes() {
  const queue = readiness.queue, summary = readiness.summary, conflicts = readiness.conflicts || [];
  const stats = [['Variants', summary.variants], ['Mapped', summary.mapped], ['Missing', summary.missing], ['Conflicts', conflicts.length], ['Launch · in stock', queue.filter((r) => r.priority === 'launch_operational').length]];
  return <AdminShell active="barcodes"><main id="main" className="ui-root mx-auto w-full max-w-[1500px] px-4 py-6 font-sans text-sm text-ink md:px-8"><div className="flex flex-col gap-5">
    <header><h1 className="m-0 font-display text-2xl font-semibold text-ink">Barcode work queue</h1><p className="mt-1 max-w-3xl text-sm text-ink-2">Conflicting codes fail closed. Missing codes don’t receive stock until a manufacturer code or an approved internal label is recorded. For each row: scan the manufacturer code or print an internal label.</p></header>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{stats.map(([label, value]) => <div key={label} className="rounded-xl border border-line bg-card px-4 py-3"><div className="text-xs text-ink-2">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div></div>)}</div>
    <DataTable label="Variants" rows={queue} getRowId={rowId} pageSize={50} defaultTab="launch_operational" searchPlaceholder="Search SKU, product or variant"
      tabs={[{ id: 'launch_operational', label: 'Launch · in stock', filter: (r) => r.priority === 'launch_operational' }, { id: 'launch_no_stock', label: 'Launch · no stock', filter: (r) => r.priority === 'launch_no_stock' }, { id: 'not_launching', label: 'Not launching', filter: (r) => r.priority === 'not_launching' }, { id: 'all', label: 'All' }]}
      empty={<p className="p-6 text-ink-3">Nothing in this view.</p>}
      mobileCard={(r) => <div className="flex flex-col gap-1"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-semibold">{r.sku || 'No SKU'}</span><Badge tone={r.priority === 'launch_operational' ? 'warn' : 'neutral'}>{priorityLabel(r.priority)}</Badge></div><div className="font-semibold">{r.product_name}</div><div className="text-xs text-ink-2">{r.variant_title}</div></div>}
      columns={[
        { id: 'sku', header: 'SKU', accessor: (r) => r.sku || '', cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{r.sku || 'No SKU'}</span> },
        { id: 'product', header: 'Product', accessor: 'product_name', cell: (r) => <span className="font-medium">{r.product_name}</span> },
        { id: 'variant', header: 'Variant', accessor: 'variant_title', cell: (r) => <span className="text-ink-2">{r.variant_title}</span> },
        { id: 'priority', header: 'Priority', accessor: 'priority', cell: (r) => <Badge tone={r.priority === 'launch_operational' ? 'warn' : 'neutral'}>{priorityLabel(r.priority)}</Badge> },
      ]} />
    {conflicts.length > 0 && <section className="rounded-xl border border-line bg-card p-4"><h2 className="m-0 text-base font-semibold">Cross-SKU conflicts</h2>{conflicts.map((row) => <p key={row.value} className="mb-0 mt-2"><code className="font-mono text-xs">{row.value}</code> → {row.skus.join(', ')}</p>)}</section>}
  </div></main></AdminShell>;
}
