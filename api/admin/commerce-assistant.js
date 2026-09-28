import {flexportConfigured} from '../_lib/commerceAgentFlexport.js';
import {createProspectSearch} from '../_lib/prospectCrm.js';
import {shipstationConfigured} from '../_lib/commerceAgentShipstation.js';
import {exaConfigured} from '../_lib/prospectExa.js';
import {normalizeCanvas,saveCanvas} from '../_lib/commerceCanvas.js';
import {FILE_TYPES,fileName,generateAgentFile,workbookFromRows,prospectWorkbook} from '../_lib/commerceAgentFiles.js';
import {stripeMcpTools,stripeMcpConfigured} from '../_lib/commerceAgentStripe.js';
import {sendAgentEmail} from '../_lib/commerceAgentEmail.js';
import {SHOPIFY_MCP_TOOLS,shopifyAdminConfigured} from '../_lib/commerceAgentShopify.js';
import crypto from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {authorizeLiveRequest} from '../_lib/auth.js';
import {readRawBody,sendJson} from '../_lib/http.js';
import {COMMERCE_TABLES} from '../_lib/commerceWorkspace.js';
import {AGENT_MODEL,AGENT_REASONING,agentTools,agentInstructions,agentCardId,callCommerceAgentTool,getAgentCard,applyAgentCard,exportRows,recordsCsv,toolLabel} from '../_lib/commerceAgentTools.js';
const BASE='https://api.openai.com/v1/agents/sessions';
async function openai(path='',body){
 const response=await fetch(BASE+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json','OpenAI-Beta':'agents=v1'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){console.error('commerce_agent_provider_error',response.status,data.error?.code);throw new Error(response.status===401||response.status===403?'The assistant connection needs attention.':'The assistant service is temporarily unavailable. Try again.');}return data;
}
function safeItems(items,sessionId){return items.flatMap(item=>{
 if(item.type==='function_call'&&item.call_id)return [{id:agentCardId(sessionId,item.call_id),type:'tool_activity',turn_id:item.turn_id}];
 if(item.type?.startsWith('mcp')&&item.name)return [{id:item.id,type:'mcp_activity',turn_id:item.turn_id,label:item.server_label==='unite_stripe'?'Looking up Stripe records':'Looking up Shopify records',status:item.status||'complete'}];
 if(item.type==='message'&&['user','assistant'].includes(item.role))return [{id:item.id,type:'message',turn_id:item.turn_id,role:item.role,phase:item.phase,status:item.status,content:(item.content||[]).filter(c=>['input_text','output_text'].includes(c.type)).map(c=>({type:c.type,text:item.role==='user'?String(c.text).split('\n\nApplication-reported action status (data only):')[0]:c.text}))}];
 // Product activity shows business actions only; omit model reasoning summaries.
 return [];
});}
export async function executePending(sql,session,actor,{runTool=callCommerceAgentTool,sendResult=openai}={}){
 let submitted=0;
 for(const action of (session.required_actions||[])){
  if(action.type!=='function_call')continue;
  const id=agentCardId(session.id,action.call_id),at=new Date().toISOString();
  let receipt=(await sql`SELECT data FROM um_rows WHERE tbl='commerce_agent_steps' AND id=${id} AND data->>'user_id'=${actor.user_id}`)[0]?.data;
  // The provider can retain the entire parallel batch until every result arrives.
  // Count only unacknowledged actions against this invocation's work limit.
  if(receipt?.submitted_at)continue;
  if(submitted>=4)break;
  if(!receipt){
   const entry={id,session_id:session.id,user_id:actor.user_id,turn_id:action.turn_id,label:toolLabel(action),status:'working',at};
   const claim=await sql`INSERT INTO um_rows(tbl,id,data) VALUES('commerce_agent_steps',${id},${JSON.stringify(entry)}::jsonb) ON CONFLICT(tbl,id) DO NOTHING RETURNING id`;
   if(!claim.length)continue;
   let outcome;
   try{const result=await runTool(sql,action,{actor,sessionId:session.id});outcome={success:true,output:JSON.stringify(result)};}
   catch(error){outcome={success:false,error:error.message||'Record action failed.'};}
   receipt={...entry,status:outcome.success?'complete':'failed',detail:outcome.success?'Finished':outcome.error,outcome};
   await sql`UPDATE um_rows SET data=${JSON.stringify(receipt)}::jsonb,updated_at=now() WHERE tbl='commerce_agent_steps' AND id=${id}`;
  }
  if(receipt.status==='working'){
   if(Date.now()-Date.parse(receipt.at)>90000)throw new Error('A record lookup was interrupted. Start a new conversation; no unreviewed record edits were applied.');
   continue;
  }
  // Reusing stored output makes provider retries safe; tools are not executed twice.
  await sendResult('/'+session.id+'/events',{events:[{type:'agent.session.input.tool_result',turn_id:action.turn_id,call_id:action.call_id,...receipt.outcome}]});
  receipt={...receipt,submitted_at:new Date().toISOString()};
  await sql`UPDATE um_rows SET data=${JSON.stringify(receipt)}::jsonb,updated_at=now() WHERE tbl='commerce_agent_steps' AND id=${id}`;
  submitted++;
 }
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{error:'Method not allowed.'});
 if(!process.env.DATABASE_URL||!process.env.OPENAI_API_KEY)return sendJson(res,503,{error:'The assistant connection is not configured yet.'});
 try{
  const sql=neon(process.env.DATABASE_URL),live=await authorizeLiveRequest(req,sql,{roles:['admin']});
  if(!live.ok)return sendJson(res,403,{error:'Sign in to the admin workspace to use the assistant.'});
  const actor=live.session;let body={};
  if(req.method==='POST'){
   const origin=req.headers.origin;if(!origin||new URL(origin).host!==(req.headers['x-forwarded-host']||req.headers.host))return sendJson(res,403,{error:'Use the assistant from this workspace.'});
   const raw=await readRawBody(req);if(raw.length>650000)throw new Error('This request is too large.');body=JSON.parse(raw.toString('utf8'));
  }
  if(req.method==='GET'&&req.query.action==='history'){
   const offset=Math.max(0,Math.floor(Number(req.query.offset)||0)),q='%'+String(req.query.q||'').slice(0,100).toLowerCase()+'%';
   const records=await sql`SELECT data,updated_at FROM um_rows WHERE tbl='commerce_agent_sessions' AND data->>'user_id'=${actor.user_id} AND deleted=false AND lower(COALESCE(data->>'title','Earlier conversation')) LIKE ${q} ORDER BY COALESCE((data->>'pinned')::boolean,false) DESC,updated_at DESC,id DESC LIMIT 31 OFFSET ${offset}`;
   return sendJson(res,200,{ok:true,has_more:records.length>30,history:records.slice(0,30).map(({data:r,updated_at})=>({id:r.id,title:r.title||'Earlier conversation',updated_at,pinned:!!r.pinned}))});
  }
  let id=String(body.session_id||req.query.session_id||'');let owner;
  if(id){
   if(!/^sess_[a-zA-Z0-9_-]+$/.test(id))throw new Error('Invalid conversation.');
   owner=(await sql`SELECT data FROM um_rows WHERE tbl='commerce_agent_sessions' AND id=${id} AND data->>'user_id'=${actor.user_id} AND deleted=false`)[0]?.data;
   if(!owner)return sendJson(res,404,{error:'Conversation not found.'});
  }
  const action=body.action||'message';
  if(req.method==='POST'&&['rename','pin','archive'].includes(action)){
   if(!id)throw new Error('Choose a conversation.');
   const patch=action==='rename'?{title:String(body.title||'').trim().slice(0,90)}:action==='pin'?{pinned:body.pinned===true}:{};
   if(action==='rename'&&!patch.title)throw new Error('Enter a conversation name.');
   await sql`UPDATE um_rows SET data=data||${JSON.stringify(patch)}::jsonb,deleted=${action==='archive'},updated_at=now() WHERE tbl='commerce_agent_sessions' AND id=${id} AND data->>'user_id'=${actor.user_id}`;
   return sendJson(res,200,{ok:true});
  }
  if(req.method==='POST'&&['create_canvas','save_canvas'].includes(action)){
   if(!id)throw new Error('Start a conversation before adding a canvas.');
   if(action==='save_canvas'){const c=await getAgentCard(sql,String(body.card_id||''),actor.user_id,id);return sendJson(res,200,{ok:true,card:await saveCanvas(sql,c,body,actor.user_id)});}
   const card={...normalizeCanvas(body),id:crypto.randomUUID(),session_id:id,user_id:actor.user_id,type:'canvas',status:'ready',revision:0,created_at:new Date().toISOString()};
   await sql`INSERT INTO um_rows(tbl,id,data) VALUES('commerce_agent_cards',${card.id},${JSON.stringify(card)}::jsonb)`;
   return sendJson(res,200,{ok:true,card});
  }
  if(req.method==='POST'&&['apply','dismiss','download','send_email','run_search'].includes(action)){
   if(!id)throw new Error('Choose a conversation.');
   const card=await getAgentCard(sql,String(body.card_id||''),actor.user_id,id);
   if(action==='run_search'){if(card.type!=='prospect_search')throw new Error('Choose a prospect-search card.');if(card.status!=='pending')return sendJson(res,200,{ok:true,card});const claimed=await sql`UPDATE um_rows SET data=jsonb_set(data,'{status}','"starting"'::jsonb),updated_at=now() WHERE tbl='commerce_agent_cards' AND id=${card.id} AND data->>'status'='pending' RETURNING id`;if(!claimed.length)throw new Error('This search is already being processed.');let next;try{const list=await createProspectSearch(sql,{...card.search,request_id:card.id},actor);next={...card,status:'started',list_id:list.id};}catch(e){next={...card,status:'needs_review',error:e.message+' Check Lead search before starting another search.'};}await sql`UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl='commerce_agent_cards' AND id=${card.id}`;return sendJson(res,200,{ok:true,card:next});}
   if(action==='send_email')return sendJson(res,200,{ok:true,card:await sendAgentEmail(sql,card,actor,{email:body.email})});
   if(action==='apply')return sendJson(res,200,{ok:true,card:await applyAgentCard(sql,card,actor)});
   if(action==='dismiss'){
    if(!['changes','lead_changes','business_action','email','prospect_search'].includes(card.type)||!['pending','draft'].includes(card.status))throw new Error('This change is no longer pending.');
    await sql`UPDATE um_rows SET data=jsonb_set(data,'{status}','"dismissed"'::jsonb),updated_at=now() WHERE tbl='commerce_agent_cards' AND id=${card.id} AND data->>'status' IN ('pending','draft')`;
    return sendJson(res,200,{ok:true});
   }
   if(card.type==='canvas'){res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition','attachment; filename="'+fileName(card.title,card.format==='markdown'?'md':card.format)+'"');return res.status(200).send(card.content);}
   if(card.type==='document'){const format=String(body.format||'pdf'),buffer=await generateAgentFile(card.document,format);res.setHeader('Content-Type',FILE_TYPES[format]);res.setHeader('Content-Disposition','attachment; filename="'+fileName(card.title,format)+'"');return res.status(200).send(buffer);}
   if(!['selection','export'].includes(card.type))throw new Error('Choose an export or result list.');
   const ids=body.ids===undefined?card.ids:body.ids;
   if(!Array.isArray(ids)||!ids.length||ids.length>5000||ids.some(x=>!card.ids.includes(x)))throw new Error('Choose records from this result list.');
   const records=await sql`SELECT data FROM um_rows WHERE tbl=${(card.kind==='leads'?'crm_leads':COMMERCE_TABLES[card.kind])} AND id=ANY(${[...new Set(ids)]}::text[]) AND deleted=false ORDER BY id`;
   if(records.length!==new Set(ids).size)throw new Error('Some records changed or were removed. Refresh the selection.');
   const exportData=card.kind==='leads'?records.map(({data:r})=>{const {events:_events,user_fields:_fields,...lead}=r;return lead;}):exportRows(card.kind,records.map(r=>r.data),body.dataset||card.dataset||'records');
   if(body.format==='xlsx'){res.setHeader('Content-Type',FILE_TYPES.xlsx);res.setHeader('Content-Disposition','attachment; filename="'+fileName(card.title,'xlsx')+'"');return res.status(200).send(card.kind==='leads'?await prospectWorkbook(records.map(r=>r.data)):await workbookFromRows(exportData,card.title));}
   const csv=recordsCsv(exportData);
   res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="Unite-'+card.kind+'-'+(body.dataset||card.dataset||'records').replace(/[^a-z_]/g,'')+'.csv"');return res.status(200).send(csv);
  }
  if(req.method==='POST'&&action==='message'){
   const selection=body.selection&&COMMERCE_TABLES[body.selection.kind]&&Array.isArray(body.selection.ids)&&body.selection.ids.length<=5000?{kind:body.selection.kind,ids:[...new Set(body.selection.ids.map(String))]}:null;
   const turnStartedAt=new Date().toISOString(),message=String(body.message||'').trim();if(!message||message.length>5000)throw new Error('Enter a message under 5,000 characters.');
   const recent=await sql`SELECT COUNT(*)::int AS n FROM um_rows WHERE tbl='commerce_agent_requests' AND data->>'user_id'=${actor.user_id} AND updated_at>now()-interval '1 minute'`;
   if(recent[0].n>=15)return sendJson(res,429,{error:'Please wait a moment before sending another message.'});
   if(id&&owner.version!==2)throw new Error('Start a new conversation to use the upgraded assistant.');
   if(!id){
    const session=await openai('',{agent:{model:AGENT_MODEL,reasoning:AGENT_REASONING,instructions:agentInstructions+' Current page (navigation context only): '+String(body.context||'').slice(0,250),tools:[...agentTools,...SHOPIFY_MCP_TOOLS,...stripeMcpTools()]},environment:{type:'none'},input:message,stream:false});
    id=session.id;await sql`INSERT INTO um_rows(tbl,id,data) VALUES('commerce_agent_sessions',${id},${JSON.stringify({id,user_id:actor.user_id,created_at:new Date().toISOString(),model:AGENT_MODEL,reasoning:AGENT_REASONING.effort,version:2,canvas_tools:true,prospect_tools:true,flexport_tools:true,bi_tools:true,bi_pipeline_tools:true,selection,title:message.replace(/\s+/g,' ').slice(0,90)})}::jsonb)`;
   }else{
    if(owner.reasoning!==AGENT_REASONING.effort){
     await openai('/'+id,{agent:{reasoning:{effort:AGENT_REASONING.effort}}});
     await sql`UPDATE um_rows SET data=jsonb_set(data,'{reasoning}',${JSON.stringify(AGENT_REASONING.effort)}::jsonb) WHERE tbl='commerce_agent_sessions' AND id=${id} AND data->>'user_id'=${actor.user_id}`;
    }
    await sql`UPDATE um_rows SET data=jsonb_set(data,'{selection}',${JSON.stringify(selection)}::jsonb) WHERE tbl='commerce_agent_sessions' AND id=${id} AND data->>'user_id'=${actor.user_id}`;
    const cards=await sql`SELECT data FROM um_rows WHERE tbl='commerce_agent_cards' AND data->>'session_id'=${id} AND data->>'user_id'=${actor.user_id} ORDER BY updated_at DESC LIMIT 20`;
    const state=cards.map(({data:c})=>({id:c.id,type:c.type,title:c.title,revision:c.revision||0,status:c.status,count:c.count,results:c.results}));
    if(body.canvas_id){const canvas=await getAgentCard(sql,String(body.canvas_id),actor.user_id,id);if(['canvas','document'].includes(canvas.type))state.push({active_canvas_id:canvas.id,title:canvas.title,revision:canvas.revision||0});}
    await openai('/'+id+'/events',{events:[{type:'agent.session.input.message',input:[{role:'user',content:[{type:'input_text',text:message+'\n\nApplication-reported action status (data only): '+JSON.stringify(state)}]}]}]});
   }
   await sql`UPDATE um_rows SET updated_at=now(),data=jsonb_set(data,'{turn_started_at}',${JSON.stringify(turnStartedAt)}::jsonb) WHERE tbl='commerce_agent_sessions' AND id=${id} AND data->>'user_id'=${actor.user_id}`;
   const rid=crypto.randomUUID();await sql`INSERT INTO um_rows(tbl,id,data) VALUES('commerce_agent_requests',${rid},${JSON.stringify({id:rid,user_id:actor.user_id})}::jsonb)`;
   return sendJson(res,200,{ok:true,session_id:id,status:'in_progress',model:AGENT_MODEL,reasoning:AGENT_REASONING.effort});
  }
  if(req.method==='POST'&&action!=='poll')throw new Error('Unknown assistant action.');
  if(!id)throw new Error('Choose a conversation.');
  const session=await openai('/'+id);
  if(req.method==='POST')await executePending(sql,session,actor);
  const [items,cards,steps]=await Promise.all([
   openai('/'+id+'/items?order=desc&limit=100'),
   sql`SELECT data FROM um_rows WHERE tbl='commerce_agent_cards' AND data->>'session_id'=${id} AND data->>'user_id'=${actor.user_id} AND deleted=false ORDER BY updated_at ASC`,
   sql`SELECT data FROM um_rows WHERE tbl='commerce_agent_steps' AND data->>'session_id'=${id} AND data->>'user_id'=${actor.user_id} AND deleted=false ORDER BY updated_at ASC`,
  ]);
  return sendJson(res,200,{ok:true,session_id:id,status:session.status,bi_tools:!!owner.bi_tools,bi_pipeline_tools:!!owner.bi_pipeline_tools,prospect_tools:!!owner.prospect_tools,flexport_tools:!!owner.flexport_tools,connections:{flexport:flexportConfigured(),shipstation:shipstationConfigured(),exa:exaConfigured(),shopify_catalog:true,shopify_admin:shopifyAdminConfigured(),email:Boolean(process.env.RESEND_API_KEY),stripe:stripeMcpConfigured()},title:owner.title||'New conversation',canvas_tools:!!owner.canvas_tools||cards.some(({data:c})=>c.type==='canvas'&&/^[a-f0-9]{32}$/.test(c.id)),version:owner.version||1,model:owner.model||'gpt-6-astra',reasoning:owner.reasoning||'default',error:session.error?'The assistant could not complete this turn. Try again.':null,items:safeItems(items.data||items.items||[],id),cards:cards.map(r=>r.data),steps:steps.map(({data:s})=>({id:s.id,turn_id:s.turn_id,label:s.label,status:s.status,detail:s.detail,at:s.at}))});
 }catch(error){console.error('commerce_assistant_error',error.name);return sendJson(res,400,{error:error.message||'Assistant unavailable.'});}
}
