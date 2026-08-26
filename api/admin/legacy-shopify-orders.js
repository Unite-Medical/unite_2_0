import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { readRawBody,sendJson } from '../_lib/http.js';
import { buildLegacyTransferPreview,fetchLiveShopifyOrder,planLegacyOrderTransfer } from '../_lib/legacyShopifyOrders.js';
import decisionsFile from '../../src/data/damonLegacyOrderDecisions.generated.json' with {type:'json'};

const decisions=new Map(decisionsFile.decisions.map((decision)=>[String(decision.shopify_order_id),decision]));
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
 if(process.env.UNITE_ENVIRONMENT!=='staging') return sendJson(res,404,{error:'not_found'});
 if(!process.env.DATABASE_URL) return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
  const body=JSON.parse((await readRawBody(req)).toString('utf8')||'{}');const orderId=String(body.shopify_order_id||'');const decision=decisions.get(orderId);
  if(!decision)return sendJson(res,404,{error:'order_decision_not_found'});
  const order=await fetchLiveShopifyOrder(orderId);const preview=buildLegacyTransferPreview(order);
  if(body.action==='preview') return sendJson(res,200,{ok:true,decision,preview});
  if(body.action!=='stage_transfer') return sendJson(res,400,{error:'invalid_action'});
  const plan=planLegacyOrderTransfer({decision,liveOrder:order,previewHash:String(body.preview_hash||''),actorId:live.session.user_id});
  if(!plan.ok)return sendJson(res,409,{error:plan.reason});
  const existing=await sql`SELECT data FROM um_rows WHERE tbl='legacy_shopify_migrations' AND id=${plan.migration.id} AND deleted=false LIMIT 1`;
  if(existing[0]?.data){
   if(existing[0].data.request_hash!==plan.request_hash)return sendJson(res,409,{error:'legacy_transfer_intent_changed'});
   return sendJson(res,200,{ok:true,replay:true,migration:existing[0].data});
  }
  const audit={id:`aud_${plan.migration.id}`,kind:'legacy_shopify.transfer_staged',ref_id:plan.order.id,actor_id:live.session.user_id,payload:{source_order_id:orderId,request_hash:plan.request_hash,side_effects:plan.side_effects},created_at:plan.order.created_at};
  const results=await sql.transaction((txn)=>[
   txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('legacy_shopify_migrations',${plan.migration.id},${JSON.stringify(plan.migration)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
   txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('orders',${plan.order.id},${JSON.stringify(plan.order)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
   ...plan.lines.map((line)=>txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('order_items',${line.id},${JSON.stringify(line)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`),
   ...plan.commitment_adoptions.map((row)=>txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('legacy_commitment_adoptions',${row.id},${JSON.stringify(row)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`),
   txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
  ]);
  if(!results[0]?.length||!results[1]?.length)return sendJson(res,409,{error:'legacy_transfer_concurrent_winner'});
  return sendJson(res,201,{ok:true,replay:false,migration:plan.migration,order:{id:plan.order.id,status:plan.order.status,fulfillment_blocked:true},lines:plan.lines.length,side_effects:plan.side_effects});
 }catch(error){return sendJson(res,500,{error:'legacy_shopify_transfer_failed',detail:String(error.message||'unknown')});}
}
