import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';
import { syncRoboticsInquiry } from '../_lib/roboticsHubspot.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
  try {
    const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin']});
    if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    const body=JSON.parse((await readRawBody(req)).toString('utf8'));
    if(!/^inq_[a-f0-9]{24}$/.test(body.id||''))return sendJson(res,400,{error:'invalid_inquiry'});
    const result=await syncRoboticsInquiry(sql,body.id);
    return sendJson(res,200,{ok:true,...result});
  }catch{return sendJson(res,500,{error:'robotics_sync_failed'});}
}
