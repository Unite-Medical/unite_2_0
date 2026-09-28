import { neon } from '@neondatabase/serverless';
import { safeEqual, sendJson } from '../_lib/http.js';
import { runBiPipeline } from '../_lib/biPipeline.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.CRON_SECRET||!safeEqual(String(req.headers.authorization||''),'Bearer '+process.env.CRON_SECRET))return sendJson(res,401,{error:'unauthorized'});
  if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'database_not_configured'});
  try{return sendJson(res,200,await runBiPipeline(neon(process.env.DATABASE_URL)));}
  catch{return sendJson(res,500,{error:'bi_refresh_failed'});}
}
