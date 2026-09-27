import {atomicTransition} from '../_lib/atomicTransition.js';
import {isAshley} from '../_lib/launchPolicy.js';
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { readRawBody, sendJson } from '../_lib/http.js';
import { financeWorkspace } from '../_lib/financeWorkspace.js';
import { planInvoicePayment } from '../_lib/arPayment.js';

async function row(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}
function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','POST'].includes(req.method)) return sendJson(res, 405, { error: 'method_not_allowed' });
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);
  try {
    const profile = await row(sql, 'profiles', session.user_id);
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'finance'] });
    if (!live.ok) {
      return sendJson(res, 403, { error: live.reason });
    }
    if(req.method==='GET'){
      const [invoices,organizations]=await Promise.all([
        sql`SELECT data FROM um_rows WHERE tbl='invoices' AND deleted=false ORDER BY data->>'due_date'`,
        sql`SELECT data->>'id' id,data->>'name' name,data->>'billing_email' billing_email FROM um_rows WHERE tbl='organizations' AND deleted=false`,
      ]);
      const invoiceId=req.query?.invoice||new URL(req.url,'http://localhost').searchParams.get('invoice');
      if(invoiceId){
        const raw=invoices.find(r=>r.data.id===invoiceId)?.data;
        if(!raw)return sendJson(res,404,{error:'invoice_not_found'});
        const order=raw.order_id?await row(sql,'orders',raw.order_id):null;
        const lines=raw.order_id?await sql`SELECT data FROM um_rows WHERE tbl='order_items' AND deleted=false AND data->>'order_id'=${raw.order_id}`:[];
        const pick=(r,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(r||{},k)).map(k=>[k,r[k]]));
        return sendJson(res,200,{ok:true,invoice:financeWorkspace([raw],organizations)[0],organization:organizations.find(o=>o.id===raw.customer_id)||null,order:raw.kind==='shipment_freight'?{id:raw.order_id,freight:raw.freight,tax:raw.tax}:pick(order,['id','po_number','freight','tax']),items:raw.kind==='shipment_freight'?[]:lines.map(r=>pick(r.data,['id','sku','name','qty','unit_price','ext_price']))});
      }
      return sendJson(res,200,{ok:true,invoices:financeWorkspace(invoices.map(r=>r.data),organizations),generated_at:new Date().toISOString()});
    }
    const body = JSON.parse((await readRawBody(req)).toString('utf8') || '{}');
    const invoice = await row(sql, 'invoices', body.invoice_id);
    if (!invoice) return sendJson(res, 404, { error: 'invoice_not_found' });
    if(invoice.kind==='shipment_freight'&&!isAshley(session))return sendJson(res,403,{error:'ashley_review_required'});
    const order = invoice.order_id ? await row(sql, 'orders', invoice.order_id) : null;
    const plan = planInvoicePayment({
      invoice,
      order,
      input: { ...body, provider: body.provider === 'accounting' ? 'qbo' : body.provider },
      actorId: session.user_id,
    });
    if (!plan.ok) return sendJson(res, 400, { error: plan.reason });
    if (plan.idempotent) return sendJson(res, 200, { ok: true, duplicate: true, invoice: plan.invoice, order: plan.order, payment: plan.payment });

    const audit={id:crypto.randomUUID(),kind:'finance.payment_evidence_recorded',ref_id:invoice.id,actor_id:session.user_id,payload:{payment_id:plan.payment.id,provider:plan.payment.provider,amount:plan.payment.amount},created_at:new Date().toISOString()};
    const identity={id:stableId('payment_ref',`${plan.payment.provider}:${plan.payment.payment_reference}`),invoice_id:invoice.id,payment_id:plan.payment.id,created_at:audit.created_at};
    const checks=[{table:'invoices',id:invoice.id,before:invoice}];
    const writes=[{table:'invoices',before:invoice,data:plan.invoice},{table:'payments',data:plan.payment},{table:'audit_log',data:audit},{table:'manual_payment_identities',data:identity}];
    if(plan.order){checks.push({table:'orders',id:order.id,before:order});writes.push({table:'orders',before:order,data:plan.order});}
    const saved=await atomicTransition(sql,{checks,writes});
    if(!saved.ok)return sendJson(res,409,{error:'payment_state_changed_retry'});
    return sendJson(res,200,{ok:true,invoice:plan.invoice,order:plan.order,payment:plan.payment});
  } catch {
    return sendJson(res, 500, { error: 'payment_evidence_failed' });
  }
}
