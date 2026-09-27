import {neon} from '@neondatabase/serverless';
import {syncOrderAccounting} from '../_lib/orderAccounting.js';
import {sendJson} from '../_lib/http.js';
export default async function handler(req,res){
 if(req.method!=='GET')return sendJson(res,405,{error:'Method not allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return sendJson(res,403,{error:'Unauthorized'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'Not configured'});
 const sql=neon(process.env.DATABASE_URL);
 const rows=await sql`SELECT data FROM um_rows WHERE tbl='accounting_jobs' AND deleted=false AND data->>'status' IN ('queued','retry_required','connection_required') AND updated_at<now()-interval '5 minutes' ORDER BY updated_at ASC LIMIT 2`;
 const results=[];for(const {data} of rows)results.push(await syncOrderAccounting(sql,data.order_id));
 return sendJson(res,200,{processed:results.length,statuses:results.map(r=>r.status)});
}
