import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {readRawBody,sendJson} from '../_lib/http.js';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {sanitizeFunnelEvent,summarizeFunnel} from '../_lib/funnel.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});const sql=neon(process.env.DATABASE_URL);
 try{if(req.method==='GET'){const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});const rows=await sql`SELECT data FROM um_rows WHERE tbl='quote_funnel_events' AND deleted=false AND updated_at>now()-interval '30 days' ORDER BY updated_at LIMIT 20001`;if(rows.length>20000)return sendJson(res,422,{error:'report_requires_aggregate_job'});return sendJson(res,200,{ok:true,report:summarizeFunnel(rows.map(r=>r.data))});}
 const body=await readRawBody(req);if(body.length>4096)return sendJson(res,413,{error:'event_too_large'});const event=sanitizeFunnelEvent(JSON.parse(body.toString('utf8')));if(!event)return sendJson(res,400,{error:'invalid_event'});
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];const bucket=crypto.createHash('sha256').update(`${process.env.SESSION_SECRET}:${ip}:${Math.floor(Date.now()/3600000)}`).digest('hex');
 const row={id:crypto.randomUUID(),...event,created_at:new Date().toISOString()};
 const applied=await sql`WITH budget AS (INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('telemetry_limits',${bucket},'{"count":1}'::jsonb,false,now()) ON CONFLICT(tbl,id) DO UPDATE SET data=jsonb_set(um_rows.data,'{count}',to_jsonb((um_rows.data->>'count')::int+1)) WHERE (um_rows.data->>'count')::int<500 RETURNING id) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'quote_funnel_events',${row.id},${JSON.stringify(row)}::jsonb,false,now() FROM budget RETURNING id`;
 return sendJson(res,applied.length?202:429,{ok:!!applied.length});
 }catch{return sendJson(res,500,{error:'event_not_recorded'});}
}
