import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {exaConfigured,exaRequest,enrichmentSpec} from '../_lib/prospectExa.js';
import {createProspectSearch,getLead,listLeads,saveLead,saveProspectList,syncProspectList,validateLeadPatch} from '../_lib/prospectCrm.js';
import {CRM_STAGES,LEAD_FIELDS} from '../../src/lib/crmSchema.js';
import {recordsCsv} from '../_lib/commerceAgentTools.js';
import {prospectWorkbook,FILE_TYPES} from '../_lib/commerceAgentFiles.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'Method not allowed.'});
 if(!process.env.DATABASE_URL)return sendJson(res,503,{error:'The workspace database is unavailable.'});
 try{
  const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin']});
  if(!live.ok)return sendJson(res,401,{error:'Sign in to the admin workspace.'});
  if(req.method==='GET'){
   if(req.query.id)return sendJson(res,200,{ok:true,lead:await getLead(sql,String(req.query.id))});
   const [leads,lists,counts]=await Promise.all([listLeads(sql,req.query),sql`SELECT data FROM um_rows WHERE tbl='prospect_lists' AND deleted=false ORDER BY updated_at DESC LIMIT 100`,sql`SELECT data->>'stage' AS stage,COUNT(*)::int AS count FROM um_rows WHERE tbl='crm_leads' AND deleted=false AND COALESCE((data->>'archived')::boolean,false)=false GROUP BY data->>'stage'`]);
   return sendJson(res,200,{ok:true,...leads,lists:lists.map(r=>r.data),counts,connected:exaConfigured()});
  }
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if(!req.headers.origin||new URL(req.headers.origin).host!==host)return sendJson(res,403,{error:'Use the Unite workspace to make changes.'});
  const raw=await readRawBody(req);if(raw.length>100000)throw new Error('This request is too large.');
  const b=JSON.parse(raw.toString('utf8')),actor=live.session;
  if(b.action==='discover'){
   let cursor,found=0;
   for(let n=0;n<10;n++){const page=await exaRequest('/websets?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));for(const w of page.data||[])if(w.metadata?.workspace==='Unite Medical'){await saveProspectList(sql,w);found++;}if(!page.hasMore)break;cursor=page.nextCursor;}
   return sendJson(res,200,{ok:true,found});
  }
  if(b.action==='save')return sendJson(res,200,{ok:true,lead:await saveLead(sql,String(b.id),b.revision,b.patch,actor)});
  if(b.action==='create_lead'){
   const patch=validateLeadPatch(b.patch);if(!patch.company)throw new Error('Company is required.');
   const id='lead_'+crypto.randomUUID(),at=new Date().toISOString(),lead={id,revision:0,kind:'company',stage:'new',list_ids:[],source:'Manual',archived:false,do_not_contact:false,tags:[],notes:'',...patch,created_at:at,updated_at:at,user_fields:Object.keys(patch),events:[{id:crypto.randomUUID(),at,actor:actor.name||actor.email,text:'Created prospect'}]};
   await sql`INSERT INTO um_rows(tbl,id,data) VALUES('crm_leads',${id},${JSON.stringify(lead)}::jsonb)`;return sendJson(res,201,{ok:true,lead});
  }
  if(b.action==='bulk_stage'){
   if(!CRM_STAGES.some(s=>s.id===b.stage)||!Array.isArray(b.records)||!b.records.length||b.records.length>100)throw new Error('Choose up to 100 leads and a valid stage.');
   const results=[];for(let start=0;start<b.records.length;start+=10)results.push(...await Promise.all(b.records.slice(start,start+10).map(async r=>{try{await saveLead(sql,String(r.id),r.revision,{stage:b.stage},actor);return {id:r.id,ok:true};}catch(e){return {id:r.id,ok:false,error:e.message};}})));
   return sendJson(res,200,{ok:true,results});
  }
  if(b.action==='export'){
   if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>5000)throw new Error('Choose records to export.');
   const records=await sql`SELECT data FROM um_rows WHERE tbl='crm_leads' AND id=ANY(${b.ids.map(String)}::text[]) AND deleted=false ORDER BY data->>'company'`;
   const rows=records.map(({data:r})=>({...Object.fromEntries(LEAD_FIELDS.map(([k,label])=>[label,Array.isArray(r[k])?r[k].join('; '):r[k]??''])),Stage:r.stage,'Do not contact':r.do_not_contact?'Yes':'No',Source:r.source,'Source URL':r.source_url||r.website,'Research criteria':JSON.stringify(r.research?.evaluations||[]),'Research enrichments':JSON.stringify(r.research?.enrichments||[])}));
   const xlsx=b.format==='xlsx';res.setHeader('Content-Type',xlsx?FILE_TYPES.xlsx:'text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="Unite-prospects.'+(xlsx?'xlsx':'csv')+'"');return res.status(200).send(xlsx?await prospectWorkbook(records.map(r=>r.data)):recordsCsv(rows));
  }
  if(b.action==='search')return sendJson(res,201,{ok:true,list:await createProspectSearch(sql,b,actor)});
  const id=String(b.list_id||'');if(!/^webset_[a-zA-Z0-9]+$/.test(id))throw new Error('Choose a saved search.');
  const owned=(await sql`SELECT data FROM um_rows WHERE tbl='prospect_lists' AND id=${id} AND deleted=false`)[0]?.data;if(!owned)throw new Error('This search is not in the Unite workspace.');
  if(b.action==='sync')return sendJson(res,200,{ok:true,list:await syncProspectList(sql,id)});
  if(b.action==='rename_list'){const title=String(b.title||'').trim().slice(0,140);if(!title)throw new Error('Enter a list name.');const list=await exaRequest('/websets/'+id,{title});await saveProspectList(sql,list);return sendJson(res,200,{ok:true,list});}
  if(b.action==='enrich'){if((owned.enrichments||[]).length>=10)throw new Error('This plan supports up to 10 enrichment columns per list.');const enrichment=await exaRequest('/websets/'+id+'/enrichments',enrichmentSpec(b));return sendJson(res,200,{ok:true,enrichment});}
  throw new Error('Unknown prospect action.');
 }catch(e){return sendJson(res,400,{error:e.message||'Unable to update the prospect workspace.'});}
}
