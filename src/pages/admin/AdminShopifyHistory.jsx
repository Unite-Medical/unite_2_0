import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminShell } from '../../components/layout/AdminShell.jsx';
import { db } from '../../lib/db.js';
import { useSEO } from '../../lib/seo.js';
import '../../styles/workspace.css';

export function AdminShopifyHistory() {
  useSEO({title:'Shopify history',noindex:true});
  const rows = db.useTable('shopify_history_rows');
  const [entity, setEntity] = useState('all');
  const [run, setRun] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const runs=useMemo(()=>[...new Set(rows.map(r=>r.run_id).filter(Boolean))].sort().reverse(),[rows]);
  const types=[...new Set(rows.map(r=>r.entity).filter(Boolean))].sort();
  const visible=rows.filter(r=>(entity==='all'||r.entity===entity)&&(run==='all'||r.run_id===run)&&`${r.source_id} ${r.payload?.Name||r.payload?.Title||r.payload?.title||r.payload?.name||''}`.toLowerCase().includes(search.toLowerCase()));
  const pages=Math.max(1,Math.ceil(visible.length/50));const current=Math.min(page,pages-1);
  return <AdminShell active="shopify-history"><main id="main" className="um-workspace">
    <header className="ws-header"><div><h1>Shopify history</h1><p>Browse imported source records. Inventory here does not change warehouse stock.</p></div><Link className="ws-button primary" to="/admin/launch">Review tonight’s files</Link></header>
    <section className="ws-card"><div className="ws-grid">
      <label>Import<select value={run} onChange={e=>{setRun(e.target.value);setPage(0);}}><option value="all">All loaded imports</option>{runs.map(r=><option key={r}>{r}</option>)}</select></label>
      <label>Record type<select value={entity} onChange={e=>{setEntity(e.target.value);setPage(0);}}><option value="all">All types</option>{types.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Find a record<input type="search" placeholder="Order number, title or source ID" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label>
    </div><p>{visible.length.toLocaleString()} matching loaded records. Multiple imports can contain the same Shopify records.</p>
    {!visible.length?<p className="ws-empty">No matching records are loaded. Check the import and connection before treating this as a complete history.</p>:<ul className="ws-list">{visible.slice(current*50,(current+1)*50).map(row=><li key={row.id} className="ws-row"><div style={{minWidth:0,overflowWrap:'anywhere'}}><strong>{row.payload?.Name||row.payload?.Title||row.payload?.title||row.payload?.name||row.source_id}</strong><span className="ws-muted">{row.entity?.replaceAll('_',' ')} · Imported {row.imported_at?new Date(row.imported_at).toLocaleString():'date unavailable'}</span><details><summary>Source details</summary><p>Source ID: {row.source_id}<br/>Import: {row.run_id}<br/>Evidence hash: {row.payload_sha256||'Unavailable'}</p><dl>{Object.entries(row.payload||{}).filter(([,value])=>value!==''&&value!=null).map(([key,value])=><div key={key} style={{padding:'6px 0',borderBottom:'1px solid #eee'}}><dt><strong>{key}</strong></dt><dd style={{margin:0,whiteSpace:'pre-wrap'}}>{typeof value==='object'?JSON.stringify(value):String(value)}</dd></div>)}</dl></details></div></li>)}</ul>}
    {pages>1&&<nav className="ws-actions" aria-label="History pages"><button className="ws-button" disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current+1} of {pages}</span><button className="ws-button" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Next</button></nav>}
    </section>
  </main></AdminShell>;
}
