import crypto from 'node:crypto';
import { handleWmsRoute } from '../_lib/wms.js';

export default function handler(req,res){return handleWmsRoute(req,res,async(sql,body,session)=>{
 if(!session||!['admin','warehouse_manager','warehouse_operator'].includes(session.role))return {ok:false,reason:'receiver_session_required'};
 if(!body.ref_id||!body.warehouse_id||!String(body.raw_barcode||'').trim())return {ok:false,reason:'dock_exception_fields_required'};
 const poRows=await sql`SELECT data FROM um_rows WHERE tbl='purchase_orders' AND id=${String(body.ref_id)} AND deleted=false LIMIT 1`;if(!poRows.length)return {ok:false,reason:'po_not_found'};
 const key=String(body.idempotency_key||'');if(!/^[A-Za-z0-9_-]{12,128}$/.test(key))return {ok:false,reason:'idempotency_key_required'};
 const id=`dock_${crypto.createHash('sha256').update(`${body.ref_id}:${key}`).digest('hex').slice(0,24)}`;const row={id,kind:'unknown_barcode',status:'hold',po_id:String(body.ref_id),warehouse_id:String(body.warehouse_id),raw_barcode:String(body.raw_barcode).trim(),reason:String(body.reason||'barcode_unknown'),on_hand_delta:0,created_by:session.user_id,created_at:new Date().toISOString(),idempotency_key:key};
 const inserted=await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('dock_exceptions',${id},${JSON.stringify(row)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`;
 return {ok:true,idempotent:!inserted.length,exception:row,stock_received:false};
});}
