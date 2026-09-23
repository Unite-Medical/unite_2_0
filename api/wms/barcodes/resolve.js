import { neon } from '@neondatabase/serverless';
import { authorizeLiveRequest } from '../../_lib/auth.js';
import { sendJson } from '../../_lib/http.js';
import { buildBarcodeRegistry,resolveBarcode } from '../../../src/lib/barcodeRegistry.js';
import catalog from '../../../src/data/shopifyLaunchCatalog.generated.json' with {type:'json'};

const registry=buildBarcodeRegistry(catalog.products);
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return sendJson(res,405,{error:'method_not_allowed'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'not_configured'});
 const sql=neon(process.env.DATABASE_URL);
 try{
  const live=await authorizeLiveRequest(req,sql,{roles:['admin','warehouse_manager','warehouse_operator']});if(!live.ok)return sendJson(res,live.reason==='authentication_required'?401:403,{error:live.reason});
  const value=String(req.query?.value||'');const result=resolveBarcode(registry,value);
  if(!result.ok)return sendJson(res,result.reason==='barcode_unknown'?404:409,{error:result.reason});
  return sendJson(res,200,result);
 }catch{return sendJson(res,500,{error:'barcode_resolution_failed'});}
}
