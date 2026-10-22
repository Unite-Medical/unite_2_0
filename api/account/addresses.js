import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {sessionFromRequest} from '../_lib/auth.js';
import {loadCommerceContext} from '../_lib/commerce.js';
import {buildCustomerAddress,sameCustomerAddress} from '../_lib/customerAddress.js';
import {readRawBody,sendJson} from '../_lib/http.js';

export function createAddressHandler({sqlFactory=neon,readSession=sessionFromRequest,loadContext=loadCommerceContext,env=process.env}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store, private');
    if(req.method!=='POST')return sendJson(res,405,{error:'method_not_allowed'});
    if(!env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
    try {
      if(!req.headers.origin||new URL(req.headers.origin).host!==(req.headers['x-forwarded-host']||req.headers.host))return sendJson(res,403,{error:'same_origin_required'});
      const sql=sqlFactory(env.DATABASE_URL),session=readSession(req),context=await loadContext(sql,session);
      if(!context.ok)return sendJson(res,context.reason==='authentication_required'?401:403,{error:context.reason});
      const raw=await readRawBody(req);if(raw.length>5000)return sendJson(res,400,{error:'address_too_large'});
      const body=JSON.parse(raw.toString('utf8')||'{}'),at=new Date().toISOString();
      if(body.action==='create') {
        if(Object.keys(body).some(key=>!['action','address','idempotency_key'].includes(key)))return sendJson(res,400,{error:'invalid_address'});
        const address=buildCustomerAddress({input:body.address,session,key:body.idempotency_key,now:new Date(at)});
        if(!address)return sendJson(res,400,{error:'complete_delivery_address_required'});
        const audit={id:'address-created-'+address.id,kind:'address.created',ref_id:address.id,org_id:session.org_id,actor_id:session.user_id,created_at:at,payload:{source:'customer_settings'}};
        await sql.transaction(tx=>[
          tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('addresses',${address.id},${JSON.stringify(address)}::jsonb,false,now()) ON CONFLICT(tbl,id) DO NOTHING`,
          tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now() WHERE EXISTS(SELECT 1 FROM um_rows WHERE tbl='addresses' AND id=${address.id} AND data->>'created_at'=${at} AND deleted=false) ON CONFLICT(tbl,id) DO NOTHING`,
        ]);
        const stored=(await sql`SELECT data FROM um_rows WHERE tbl='addresses' AND id=${address.id} AND data->>'org_id'=${session.org_id} AND deleted=false`)[0]?.data;
        if(!sameCustomerAddress(stored,address))return sendJson(res,409,{error:'address_request_changed'});
        return sendJson(res,200,{ok:true,address:stored});
      }
      if(body.action==='set_default') {
        if(Object.keys(body).some(key=>!['action','address_id'].includes(key))||typeof body.address_id!=='string')return sendJson(res,400,{error:'invalid_address'});
        const found=await sql`SELECT id FROM um_rows WHERE tbl='addresses' AND id=${body.address_id} AND data->>'org_id'=${session.org_id} AND deleted=false`;
        if(!found.length)return sendJson(res,404,{error:'owned_address_required'});
        const audit={id:crypto.randomUUID(),kind:'address.default_changed',ref_id:body.address_id,org_id:session.org_id,actor_id:session.user_id,created_at:at};
        const results=await sql.transaction(tx=>[
          tx`UPDATE um_rows SET data=data||jsonb_build_object('is_default',id=${body.address_id},'updated_at',${at}::text),updated_at=now() WHERE tbl='addresses' AND data->>'org_id'=${session.org_id} AND deleted=false RETURNING data`,
          tx`INSERT INTO um_rows(tbl,id,data,deleted,updated_at) VALUES('audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now())`,
        ]);
        return sendJson(res,200,{ok:true,addresses:results[0].map(row=>row.data)});
      }
      return sendJson(res,400,{error:'invalid_address_action'});
    } catch { return sendJson(res,400,{error:'address_not_saved'}); }
  };
}
export default createAddressHandler();
