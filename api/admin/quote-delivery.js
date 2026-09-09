import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {reviewedPackingOption} from './packing.js';
import {quoteDeliveryFingerprint} from '../_lib/quoteDelivery.js';
import {normalizeAcceptedQuoteItems} from '../quotes/acceptance.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 try{const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin']});if(!live.ok)return sendJson(res,403,{error:live.reason});
 const body=req.method==='POST'?JSON.parse((await readRawBody(req)).toString('utf8')):req.query;
 const rows=await sql`SELECT data FROM um_rows WHERE tbl='quotes' AND id=${String(body.quote_id||'')} AND deleted=false`;const before=rows[0]?.data;if(!before)return sendJson(res,404,{error:'quote_not_found'});
 const addressRows=await sql`SELECT data FROM um_rows WHERE tbl='addresses' AND deleted=false AND data->>'org_id'=${before.customer_id}`;
 if(req.method==='GET')return sendJson(res,200,{ok:true,addresses:addressRows.map(r=>r.data)});
 if(['accepted','declined'].includes(before.status))return sendJson(res,409,{error:'quote_locked'});
 const address=addressRows.find(r=>r.data.id===body.address_id)?.data;if(!address)return sendJson(res,400,{error:'owned_address_required'});
 const orgs=await sql`SELECT data FROM um_rows WHERE tbl='organizations' AND id=${before.customer_id} AND deleted=false`;const org=orgs[0]?.data;if(!org)return sendJson(res,400,{error:'organization_not_found'});
 const itemRows=await sql`SELECT data FROM um_rows WHERE tbl='quote_items' AND deleted=false AND data->>'quote_id'=${before.id}`;const items=itemRows.map(r=>r.data),lines=normalizeAcceptedQuoteItems(items);
 if(!lines.length||lines.some(l=>![l.qty,l.unit_price,l.ext_price].every(v=>Number.isFinite(v)&&v>0)||Math.abs(l.ext_price-l.qty*l.unit_price)>0.01))return sendJson(res,400,{error:'invalid_quote_lines'});
 const subtotal=Math.round(lines.reduce((sum,l)=>sum+l.ext_price,0)*100)/100;
 const draft={order:{subtotal,tax_exempt_basis:org.tax_exempt===true||org.shopify_tax_exempt===true},address,lines};const plan=reviewedPackingOption(body,draft);if(!plan.ok)return sendJson(res,400,{error:plan.reason});
 const option=plan.option,now=new Date().toISOString();const next={...before,subtotal,shipping_cost:option.freight,tax:option.tax,total:option.total,ship_to_address_id:address.id,shipping_package:option.shipping_package,ship_from:option.ship_from,carrier:option.carrier,ship_method:option.service,totals_verified:true,tax_basis:option.tax_basis,status:'draft',revision:Number(before.revision||0)+1,acceptance_token_hash:null,updated_at:now,delivery_review:{actor_id:live.session.user_id,reviewed_at:now,expires_at:new Date(Date.now()+86400000).toISOString(),address,tax_exempt_basis:draft.order.tax_exempt_basis,shipping_evidence:option.shipping_evidence,tax_evidence:option.tax_evidence}};
 next.delivery_review.fingerprint=quoteDeliveryFingerprint(next,items);
 const audit={id:crypto.randomUUID(),kind:'quote.delivery_reviewed',ref_id:before.id,actor_id:live.session.user_id,payload:next.delivery_review,created_at:now};
 const updated=await sql`WITH changed AS (UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl='quotes' AND id=${before.id} AND deleted=false AND data=${JSON.stringify(before)}::jsonb RETURNING id) INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() FROM changed RETURNING id`;
 if(!updated.length)return sendJson(res,409,{error:'quote_changed_review_again'});return sendJson(res,200,{ok:true,quote:next});
 }catch{return sendJson(res,500,{error:'quote_delivery_review_failed'});}
}
