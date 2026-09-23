import {neon} from '@neondatabase/serverless';
import {sessionFromRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {buildAuthoritativeOrderDraft,loadCommerceContext} from '../_lib/commerce.js';
import {calculateEstimate,estimateBinding} from '../_lib/checkoutEstimate.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
 const session=sessionFromRequest(req);if(!session)return sendJson(res,401,{error:'authentication_required'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const context=await loadCommerceContext(sql,session);if(!context.ok)return sendJson(res,403,{error:context.reason});
  const request=JSON.parse((await readRawBody(req)).toString('utf8'));
  const tables=['products','pricing','customer_contract_prices','volume_breaks','account_payment_methods','addresses'];
  const rows=await Promise.all(tables.map(async t=>(await sql`SELECT data FROM um_rows WHERE tbl=${t} AND deleted=false`).map(r=>r.data)));
  const [products,pricingRows,contractRows,volumeBreakRows,paymentMethods,addresses]=rows;
  const draft=buildAuthoritativeOrderDraft({context,request,products,pricingRows,contractRows,volumeBreakRows,paymentMethods,addresses});if(!draft.ok)return sendJson(res,400,{error:draft.reason});
  const binding=estimateBinding(draft);
  const ready=await sql`SELECT data FROM um_rows WHERE tbl='checkout_estimates' AND deleted=false AND data->>'binding'=${binding} AND data->>'customer_id'=${session.org_id} AND (data->>'expires_at')::timestamptz>now() ORDER BY updated_at DESC LIMIT 1`;
  const result=ready.length?{ok:true,estimate:ready[0].data}:await calculateEstimate({draft,products,organization:context.organization}).catch(()=>({ok:false,reason:'shipping_or_tax_unavailable'}));
  if(!result.ok){
   const review={id:'packing_'+binding,customer_id:session.org_id,customer_name:context.organization.name,status:'pending',reason:result.reason,draft,binding,created_at:new Date().toISOString()};
   await sql`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('checkout_reviews',${review.id},${JSON.stringify(review)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now() WHERE um_rows.data->>'status'<>'pending' AND NOT EXISTS (SELECT 1 FROM um_rows e WHERE e.tbl='checkout_estimates' AND e.deleted=false AND e.data->>'binding'=${binding} AND (e.data->>'expires_at')::timestamptz>now())`;
   return sendJson(res,422,{error:'shipping_review_requested',review_id:review.id,detail:result.reason});
  }
  const e=result.estimate;await sql`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('checkout_estimates',${e.id},${JSON.stringify(e)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO NOTHING`;
  return sendJson(res,200,{ok:true,estimate:{id:e.id,expires_at:e.expires_at,options:e.options.map(({id,label,service,freight,tax,total})=>({id,label,service,freight,tax,total}))}});
 }catch{return sendJson(res,503,{error:'shipping_or_tax_unavailable'});}
}
