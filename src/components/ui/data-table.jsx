import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Button } from './button.jsx';
import { Input } from './input.jsx';
import { EmptyState } from './empty-state.jsx';

const text = (v) => (v == null ? '' : String(v));
const valueOf = (col, row) => (col.sortValue ? col.sortValue(row) : col.accessor ? (typeof col.accessor === 'function' ? col.accessor(row) : row[col.accessor]) : row[col.id]);
const compare = (a, b) => {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1;
  if (b == null || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const da = Date.parse(a), dbb = Date.parse(b);
  if (typeof a === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a) && !Number.isNaN(da) && !Number.isNaN(dbb)) return da - dbb;
  return text(a).localeCompare(text(b), undefined, { numeric: true, sensitivity: 'base' });
};

/**
 * Shopify-style index table: view tabs, search, filter dropdowns with chips, sortable headers,
 * bulk selection, client pagination and stacked cards on phones.
 */
export function DataTable({
  columns, rows, getRowId = (r) => r.id, label = 'Records', searchPlaceholder = 'Search', searchText,
  tabs, filters = [], defaultSort, selectable = false, bulkActions, rowHref, onRowClick, mobileCard,
  empty, pageSize = 50, toolbar, className,
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(tabs?.[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [active, setActive] = useState({});
  const [sort, setSort] = useState(defaultSort || null);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState([]);

  const filterValues = useMemo(() => Object.fromEntries(filters.map((f) => {
    if (f.options) return [f.id, f.options];
    const seen = [...new Set(rows.map((r) => f.value(r)).filter((v) => v != null && v !== ''))].sort((a, b) => compare(a, b));
    return [f.id, seen.map((v) => ({ value: v, label: f.format ? f.format(v) : text(v) }))];
  })), [filters, rows]);

  const tabCounts = useMemo(() => Object.fromEntries((tabs || []).map((t) => [t.id, t.filter ? rows.filter(t.filter).length : rows.length])), [tabs, rows]);

  const visible = useMemo(() => {
    const current = tabs?.find((t) => t.id === tab);
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => (!current?.filter || current.filter(r))
      && (!needle || (searchText ? searchText(r) : columns.map((c) => text(valueOf(c, r))).join(' ')).toLowerCase().includes(needle))
      && filters.every((f) => active[f.id] == null || active[f.id] === '' || text(f.value(r)) === text(active[f.id])));
    const col = sort && columns.find((c) => c.id === sort.id);
    if (col) out = [...out].sort((a, b) => compare(valueOf(col, a), valueOf(col, b)) * (sort.dir === 'desc' ? -1 : 1));
    return out;
  }, [rows, tabs, tab, q, searchText, columns, filters, active, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const shown = visible.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const visibleIds = visible.map(getRowId);
  const allPicked = visibleIds.length > 0 && visibleIds.every((id) => picked.includes(id));
  const chips = filters.filter((f) => active[f.id] != null && active[f.id] !== '');
  const reset = (fn) => (...a) => { fn(...a); setPage(0); };
  const toggleSort = (col) => setSort((s) => (s?.id !== col.id ? { id: col.id, dir: col.align === 'right' ? 'desc' : 'asc' } : s.dir === 'asc' ? { id: col.id, dir: 'desc' } : s.dir === 'desc' && !defaultSort ? null : { id: col.id, dir: 'asc' }));
  const open = (row, e) => {
    if (e?.target?.closest('a,button,input,select,textarea,label')) return;
    if (onRowClick) onRowClick(row); else if (rowHref) navigate(rowHref(row));
  };
  const clickable = Boolean(rowHref || onRowClick);
  const pick = (id, on) => setPicked((p) => (on ? [...new Set([...p, id])] : p.filter((x) => x !== id)));

  return (
    <div className={cn('overflow-hidden rounded-xl border border-line bg-card shadow-xs', className)}>
      {tabs && (
        <div role="tablist" aria-label={`${label} views`} className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={reset(() => setTab(t.id))}
              className={cn('-mb-px flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium md:min-h-10', tab === t.id ? 'border-brand text-ink' : 'border-transparent text-ink-2 hover:text-ink')}>
              {t.label}<span className="rounded-full bg-paper px-1.5 text-xs text-ink-2">{tabCounts[t.id].toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 border-b border-line p-3 md:flex-row md:flex-wrap md:items-center">
        <div className="min-w-0 flex-1 md:min-w-64"><Input icon={Search} type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder={searchPlaceholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>
        {filters.map((f) => (
          <select key={f.id} aria-label={f.label} value={text(active[f.id])} onChange={(e) => { setActive((a) => ({ ...a, [f.id]: e.target.value })); setPage(0); }}
            className="h-11 rounded-lg border border-line bg-card px-3 text-sm text-ink shadow-xs md:h-10">
            <option value="">{f.label}: all</option>
            {filterValues[f.id].map((o) => <option key={text(o.value)} value={text(o.value)}>{o.label}</option>)}
          </select>
        ))}
        {toolbar}
      </div>
      {(chips.length > 0 || q) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
          {q && <Chip onRemove={() => setQ('')}>Search: “{q}”</Chip>}
          {chips.map((f) => <Chip key={f.id} onRemove={() => setActive((a) => ({ ...a, [f.id]: '' }))}>{f.label}: {filterValues[f.id].find((o) => text(o.value) === text(active[f.id]))?.label || active[f.id]}</Chip>)}
          <button className="min-h-9 px-1 font-semibold text-brand" onClick={() => { setQ(''); setActive({}); setPage(0); }}>Clear all</button>
          <span className="ml-auto text-ink-2">{visible.length.toLocaleString()} of {rows.length.toLocaleString()}</span>
        </div>
      )}
      {selectable && picked.length > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-2 text-sm">
          <strong>{picked.length.toLocaleString()} selected</strong>
          {bulkActions?.(picked, () => setPicked([]))}
          <Button size="sm" variant="ghost" onClick={() => setPicked([])}>Clear selection</Button>
        </div>
      )}
      {!visible.length ? (
        empty && !rows.length ? empty : <EmptyState icon={Search} title={rows.length ? `No ${label.toLowerCase()} match` : `No ${label.toLowerCase()} yet`} description={rows.length ? 'Try a different search or clear the filters.' : undefined}
          action={rows.length ? <Button size="sm" onClick={() => { setQ(''); setActive({}); setTab(tabs?.[0]?.id ?? null); }}>Clear filters</Button> : undefined} />
      ) : (
        <>
          <div className="hidden w-full overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-paper text-left text-xs font-medium text-ink-2">
                <tr>
                  {selectable && <th className="w-10 px-4 py-3"><input type="checkbox" aria-label={`Select all ${visible.length} ${label.toLowerCase()}`} checked={allPicked} onChange={(e) => setPicked(e.target.checked ? [...new Set([...picked, ...visibleIds])] : picked.filter((id) => !visibleIds.includes(id)))} /></th>}
                  {columns.map((c) => {
                    const sortable = c.sortable !== false;
                    const dir = sort?.id === c.id ? sort.dir : null;
                    return (
                      <th key={c.id} scope="col" aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined} className={cn('whitespace-nowrap px-4 py-3 font-medium', c.align === 'right' && 'text-right', c.headClassName)}>
                        {sortable && c.header ? (
                          <button type="button" onClick={() => toggleSort(c)} className={cn('inline-flex items-center gap-1 rounded hover:text-ink', c.align === 'right' && 'flex-row-reverse', dir && 'text-ink')}>
                            {c.header}{dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : dir === 'desc' ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />}
                          </button>
                        ) : c.header ? c.header : <span className="sr-only">{c.srLabel || 'Actions'}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const id = getRowId(r);
                  return (
                    <tr key={id} onClick={clickable ? (e) => open(r, e) : undefined} className={cn('border-b border-line transition-colors last:border-0 hover:bg-paper/60', clickable && 'cursor-pointer', picked.includes(id) && 'bg-paper/80')}>
                      {selectable && <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${text(r.name || r.number || id)}`} checked={picked.includes(id)} onChange={(e) => pick(id, e.target.checked)} /></td>}
                      {columns.map((c) => <td key={c.id} className={cn('px-4 py-3 align-middle text-ink', c.align === 'right' && 'text-right tabular-nums', c.className)}>{c.cell ? c.cell(r) : text(valueOf(c, r)) || <span className="text-ink-3">—</span>}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {shown.map((r) => {
              const id = getRowId(r);
              const [first, ...rest] = columns.filter((c) => c.header && c.mobile !== false);
              return (
                <li key={id} onClick={clickable ? (e) => open(r, e) : undefined} className={cn('flex gap-3 p-4', clickable && 'cursor-pointer')}>
                  {selectable && <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" aria-label={`Select ${text(r.name || r.number || id)}`} checked={picked.includes(id)} onChange={(e) => pick(id, e.target.checked)} />}
                  <div className="min-w-0 flex-1">
                    {mobileCard ? mobileCard(r) : (
                      <>
                        <div className="font-semibold">{first?.cell ? first.cell(r) : text(valueOf(first, r))}</div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          {rest.map((c) => <div key={c.id} className="min-w-0"><dt className="text-ink-3">{c.header}</dt><dd className="m-0 truncate text-ink">{c.cell ? c.cell(r) : text(valueOf(c, r)) || '—'}</dd></div>)}
                        </dl>
                      </>
                    )}
                    {columns.filter((c) => !c.header && c.cell).map((c) => <div key={c.id} className="mt-3">{c.cell(r)}</div>)}
                  </div>
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-sm text-ink-2">
              <span>{(safePage * pageSize + 1).toLocaleString()}–{Math.min(visible.length, (safePage + 1) * pageSize).toLocaleString()} of {visible.length.toLocaleString()}</span>
              <span className="flex gap-1">
                <Button size="icon" aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
                <Button size="icon" aria-label="Next page" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Chip({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-paper py-0.5 pl-2.5 pr-1 font-medium text-ink">
      {children}
      <button type="button" aria-label="Remove filter" onClick={onRemove} className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-paper-alt"><X className="h-3 w-3" aria-hidden /></button>
    </span>
  );
}

/** Sortable column header for server-paginated tables. `sort` is `{id, dir}` or null. */
export function SortHeader({ id, children, sort, onSort, align, className }) {
  const dir = sort?.id === id ? sort.dir : null;
  const next = () => onSort(!dir ? { id, dir: align === 'right' ? 'desc' : 'asc' } : dir === 'asc' ? { id, dir: 'desc' } : null);
  return (
    <th scope="col" aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined} className={cn('whitespace-nowrap px-4 py-3 font-medium', align === 'right' && 'text-right', className)}>
      <button type="button" onClick={next} className={cn('inline-flex items-center gap-1 rounded hover:text-ink', align === 'right' && 'flex-row-reverse', dir && 'text-ink')}>
        {children}{dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : dir === 'desc' ? <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />}
      </button>
    </th>
  );
}
