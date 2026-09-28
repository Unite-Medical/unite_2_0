import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { sendJson } from '../_lib/http.js';
import { runBiPipeline } from '../_lib/biPipeline.js';
import { readBiReport } from '../_lib/biReports.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'database_not_configured'});
  try{
    const sql=neon(process.env.DATABASE_URL),auth=await authorizeLiveRequest(req,sql,{roles:['admin']});
    if(!auth.ok)return sendJson(res,auth.reason==='authentication_required'?401:403,{error:auth.reason});
    if(req.method==='POST'){
      if(!req.headers.origin||new URL(req.headers.origin).origin!==new URL(process.env.PUBLIC_APP_ORIGIN).origin)return sendJson(res,403,{error:'Use this workspace to refresh reports.'});
      return sendJson(res,200,await runBiPipeline(sql,{refreshRequested:true}));
    }
    return sendJson(res,200,await readBiReport(sql,Object.fromEntries(new URL(req.url,'https://local').searchParams)));
  }catch(error){return sendJson(res,400,{error:/^[a-z0-9_]+$/.test(error.message)?error.message:'Unable to load BI data. Try again.'});}
}
