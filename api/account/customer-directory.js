import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../_lib/auth.js';
import { sendJson } from '../_lib/http.js';
import { readCommerce } from '../_lib/commerceWorkspace.js';
import { canReadUniteCustomerBook, approvedCustomerDatabase } from '../_lib/customerReadAccess.js';

// Deliberate allowlist: no raw source, events, payment identities, balances,
// credit controls or collection selection can be requested through this route.
export function customerDirectoryRecord(row) {
  const fields = ['id','name','first_name','last_name','company','email','phone','status','approval_status','account_rep','tags','notes','source_order_count','last_order_date'];
  const result = Object.fromEntries(fields.filter(key => Object.hasOwn(row,key)).map(key => [key,row[key]]));
  result.addresses = (row.addresses || []).filter(a => !a.archived).map(a => Object.fromEntries(
    ['id','recipient','company','address1','address2','city','province','zip','country','phone','is_default'].filter(key => Object.hasOwn(a,key)).map(key => [key,a[key]])));
  return result;
}
export function createCustomerDirectoryHandler({ sqlFactory = neon, authorize = authorizeLiveRequest, read = readCommerce, verifyDatabase = approvedCustomerDatabase, env = process.env } = {}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store, private');
    if (req.method !== 'GET') return sendJson(res,405,{error:'method_not_allowed'});
    if (!env.DATABASE_URL) return sendJson(res,503,{error:'not_configured'});
    try {
      const sql = sqlFactory(env.DATABASE_URL);
      const live = await authorize(req,sql,{roles:['sales','sales_manager']});
      if (!live.ok) return sendJson(res,live.reason === 'authentication_required' ? 401 : 403,{error:live.reason});
      if (!canReadUniteCustomerBook(live.session,env,req.headers?.host)) return sendJson(res,403,{error:'forbidden'});
      if (!await verifyDatabase(sql,env.DATABASE_URL)) return sendJson(res,403,{error:'customer_database_scope_mismatch'});
      const query = req.query || {};
      if (Object.keys(query).some(key => !['id','q','page'].includes(key)) || Object.values(query).some(value => typeof value !== 'string')) return sendJson(res,400,{error:'invalid_customer_query'});
      const page = query.page == null ? 0 : Number(query.page);
      if (!Number.isSafeInteger(page) || page < 0 || page > 100000 || String(query.q || '').length > 250 || String(query.id || '').length > 200) return sendJson(res,400,{error:'invalid_customer_query'});
      const data = await read(sql,{kind:'customers',id:query.id || undefined,q:query.q || '',page,limit:50});
      if (!data) return sendJson(res,404,{error:'customer_not_found'});
      return sendJson(res,200,{ok:true,read_only:true,data:query.id ? customerDirectoryRecord(data) : {...data,rows:data.rows.map(customerDirectoryRecord)}});
    } catch { return sendJson(res,500,{error:'customers_unavailable'}); }
  };
}
export default createCustomerDirectoryHandler();
