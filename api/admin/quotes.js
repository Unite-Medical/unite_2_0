import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {isDamon,isJacobe} from '../_lib/launchPolicy.js';
import {atomicTransition} from '../_lib/atomicTransition.js';
import {catalogProduct,planQuotePrices} from '../_lib/quotePricing.js';
import {resolveAuthoritativePrice} from '../_lib/commerce.js';
const TABLES=['quotes','quote_items','products','organizations','pricing','customer_contract_prices','volume_breaks'];
const pick=(r,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]));
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'method_not_allowed'});
  if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
  try{
    const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin','sales','sales_manager']});
    if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
    if(!isDamon(live.session)&&!isJacobe(live.session))return sendJson(res,403,{error:'pricing_authority_required'});
    const rows=await sql`SELECT tbl,data FROM um_rows WHERE tbl=ANY(${TABLES}) AND deleted=false`,table=t=>rows.filter(r=>r.tbl===t).map(r=>r.data);
    if(req.method==='GET')return sendJson(res,200,{ok:true,quotes:table('quotes').map(q=>pick(q,['id','customer_id','customer_name','contact_email','status','revision','subtotal','total','shipping_cost','tax','valid_until','totals_verified'])),items:table('quote_items').map(i=>pick(i,['id','quote_id','sku','name','target_qty','qty','sell_per_unit','unit_price','ext_sell','ext_price','counter_price'])),organizations:table('organizations').filter(o=>o.status==='active').map(o=>pick(o,['id','name','billing_email','contact_email'])),can_override_below_margin:isDamon(live.session)});
    const input=JSON.parse((await readRawBody(req)).toString('utf8')),checks=[],writes=[];
    let next,items;
    if(input.action==='create'){
      const organization=table('organizations').find(o=>o.id===input.customer_id&&o.status==='active');
      if(!organization||!Array.isArray(input.lines)||!input.lines.length||input.lines.length>100)return sendJson(res,400,{error:'customer_and_lines_required'});
      const email=String(input.contact_email||organization.contact_email||organization.billing_email||'').trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return sendJson(res,400,{error:'recipient_email_required'});
      const id=`Q-${crypto.randomUUID().slice(0,12)}`,at=new Date().toISOString();items=[];
      if(new Set(input.lines.map(l=>l.sku)).size!==input.lines.length)return sendJson(res,400,{error:'duplicate_quote_line'});
      for(const line of input.lines){const product=catalogProduct(table('products'),String(line.sku||'').trim()),quantity=Number(line.qty);const priced=resolveAuthoritativePrice({product,quantity,organization,pricingRows:table('pricing'),contractRows:table('customer_contract_prices'),volumeBreakRows:table('volume_breaks')});if(!priced.ok)return sendJson(res,409,{error:priced.reason});items.push({id:crypto.randomUUID(),quote_id:id,sku:product.sku,name:product.name,target_qty:quantity,sell_per_unit:priced.unit_price,ext_sell:Math.round(priced.unit_price*quantity*100)/100,pricing_basis:priced.basis});}
      const subtotal=Math.round(items.reduce((n,i)=>n+i.ext_sell,0)*100)/100;
      next={id,customer_id:organization.id,customer_name:organization.name,contact_email:email,status:'draft',revision:1,subtotal,total:subtotal,shipping_cost:0,tax:0,totals_verified:false,created_at:at,valid_until:new Date(Date.now()+14*86400000).toISOString(),owner_email:live.session.email};
      checks.push({table:'organizations',id:organization.id,before:organization});writes.push({table:'quotes',data:next},...items.map(data=>({table:'quote_items',data})));
    }else if(input.action==='prices'){
      const quote=table('quotes').find(q=>q.id===input.quote_id),beforeItems=table('quote_items').filter(i=>i.quote_id===input.quote_id);
      const plan=planQuotePrices({quote,items:beforeItems,products:table('products'),actor:live.session,input});if(!plan.ok)return sendJson(res,409,{error:plan.reason});next=plan.quote;items=plan.items;
      checks.push({table:'quotes',id:quote.id,before:quote});writes.push({table:'quotes',before:quote,data:next},...items.map(data=>({table:'quote_items',before:beforeItems.find(i=>i.id===data.id),data})));
    }else return sendJson(res,400,{error:'invalid_action'});
    // Price source rows cannot change between calculation and commit.
    for(const row of rows.filter(r=>['products','pricing','customer_contract_prices','volume_breaks'].includes(r.tbl)&&items.some(i=>r.data.sku===i.sku||r.data.product_sku===i.sku||(r.data.variants||[]).some(v=>v.sku===i.sku))))checks.push({table:row.tbl,id:row.data.id,before:row.data});
    writes.push({table:'audit_log',data:{id:crypto.randomUUID(),kind:`quote.${input.action}`,ref_id:next.id,actor_id:live.session.user_id,payload:{reason:input.reason||'Draft at existing account prices'},created_at:new Date().toISOString()}});
    const saved=await atomicTransition(sql,{checks,writes});if(!saved.ok)return sendJson(res,409,{error:saved.reason});
    return sendJson(res,200,{ok:true,quote_id:next.id});
  }catch{return sendJson(res,500,{error:'quote_save_failed'});}
}
