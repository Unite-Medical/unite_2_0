import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadRows } from '../lib/commerceClient.js';

const topics={overview:'Data readiness',purchasing:'Purchasing',inventory:'Inventory',sales:'Sales',receivables:'Receivables',payables:'Payables',payments:'Stripe activity',shipping:'Fulfillment'};
const display = value => value==null?'Unknown':typeof value==='object'?JSON.stringify(value):String(value);
const label = key => key.replaceAll('_',' ');
async function request(params={},method='GET'){
  const response=await fetch('/api/admin/bi-pipeline?'+new URLSearchParams(params),{method,credentials:'include'});
  const body=await response.json();if(!response.ok)throw new Error(body.error||'Unable to load reporting data.');return body;
}
export function BiDataDesk(){
  const [topic,setTopic]=useState('overview'),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;request({topic,offset,limit:50}).then(r=>{if(active){setData(r);setError('');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[topic,offset,revision]);
  async function refresh(){setBusy(true);setError('');try{await request({},'POST');setRevision(r=>r+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  const prompt=`Use read_bi_data to review ${topic==='overview'?'business data readiness, purchasing, inventory and fulfillment':topic}. Cite source dates and completeness, explain the main findings, and create a branded downloadable report. Use live accounting statements if financial performance is needed. Do not change business records.`;
  const rows=data?.topic===topic?data.rows||[]:[],columns=Object.keys(rows[0]||{});
  return <section className="bi-panel bi-data-desk" aria-label="Business data and agent reports">
    <div className="bi-report-heading"><div><span className="bi-eyebrow">Connected business data</span><h2>Reports you can ask Unite for</h2><p>Purchasing, inventory, sales, balances and fulfillment—with source dates you can check.</p></div><Link className="bi-button primary" to={'/admin/chat?prompt='+encodeURIComponent(prompt)}>Ask Unite for a report</Link></div>
    <div className="bi-actions"><button className="bi-button" disabled={busy} onClick={refresh}>{busy?'Refreshing a batch…':'Refresh data'}</button><button className="bi-button" disabled={loading} onClick={()=>{setLoading(true);setRevision(r=>r+1);}}>Check progress</button><small>Daily refreshes continue in the background every five minutes until complete.</small></div>
    <nav className="bi-tabs" aria-label="Business datasets">{Object.entries(topics).map(([id,name])=><button key={id} aria-current={topic===id?'page':undefined} onClick={()=>{setLoading(true);setTopic(id);setOffset(0);}}>{name}</button>)}</nav>
    {error&&<p className="bi-error" role="alert">{error}</p>}{(loading||busy)&&<p role="status">{busy?'Saving the next batch on the server. Completed reports stay available.':'Loading report…'}</p>}
    {data?.topic===topic&&<>
      {topic==='overview'?<div className="bi-table-scroll"><table><thead><tr><th>Source</th><th>Refresh</th><th>Records read</th><th>Last published</th><th>Coverage</th></tr></thead><tbody>{data.sources.map(s=><tr key={s.source}><td>{s.label}</td><td>{label(s.status)}{s.error&&<small className="bi-source-error">{label(s.error)}</small>}</td><td>{s.records_received.toLocaleString()}</td><td>{s.published?new Date(s.published.finished_at).toLocaleString():'Not yet available'}</td><td>{s.published?`${s.published.stale?'Stale · ':''}${label(s.published.status)}`:'Unknown'}{s.published?.warnings.map(w=><small key={w} className="bi-source-error">{w}</small>)}</td></tr>)}</tbody></table></div>:<>
        <p><strong>{label(data.status)}</strong> · {data.total_rows.toLocaleString()} report rows. {data.unavailable?.length?`Missing: ${data.unavailable.join(', ')}.`:''}</p>
        <div className="bi-source-dates">{data.sources.map(s=><small key={s.source}>{s.label}: {s.published?`${new Date(s.published.finished_at).toLocaleString()}${s.published.stale?' (stale)':''}`:'unavailable'}</small>)}</div>
        {data.summary&&<div className="bi-metrics">{Object.entries(data.summary).filter(([,v])=>typeof v==='number').map(([key,value])=><article key={key}><span>{label(key)}</span><strong>{value.toLocaleString()}</strong></article>)}</div>}
        {!!rows.length&&<><div className="bi-table-scroll"><table><thead><tr>{columns.map(k=><th key={k}>{label(k)}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{columns.map(k=><td key={k}>{display(r[k])}</td>)}</tr>)}</tbody></table></div><div className="bi-actions"><button className="bi-button" disabled={offset===0||loading} onClick={()=>{setLoading(true);setOffset(Math.max(0,offset-50));}}>Previous</button><span>{offset+1}–{offset+rows.length} of {data.total_rows}</span><button className="bi-button" disabled={!data.has_more||loading} onClick={()=>{setLoading(true);setOffset(offset+50);}}>Next</button><button className="bi-button" onClick={()=>downloadRows(rows,`Unite-${topic}-rows-${offset+1}-${offset+rows.length}.csv`)}>Download these rows</button></div></>}
      </>}
      <details><summary>Sources and limits</summary><ul>{data.definitions.map(d=><li key={d}>{d}</li>)}{topic!=='overview'&&data.sources.flatMap(s=>(s.published?.warnings||[]).map(w=><li key={s.source+w}>{s.label}: {w}</li>))}</ul></details>
    </>}
  </section>;
}
