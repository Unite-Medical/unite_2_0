// Opt-in deployment verification. Runs where encrypted server secrets are available.
// Log only status and counts, never credentials or customer content.
if(process.env.UNITE_VERIFY_BI==='1')await import('./verify_bi_connections.mjs');
if(process.env.UNITE_VERIFY_FLEXPORT==='1'){
 if(process.env.VERCEL_PROJECT_ID!=='prj_PL5BOZooLBtLiPQlrn34SyC0MRKS')throw new Error('Flexport verification is restricted to staging.');
 const {readFlexport,flexportConfigured}=await import('../api/_lib/commerceAgentFlexport.js');
 if(!flexportConfigured())throw new Error('Flexport credentials are missing from this deployment.');
 const {neon}=await import('@neondatabase/serverless');
 const sql=neon(process.env.DATABASE_URL);
 // Exercise the same read path and encrypted token cache used by the assistant.
 // An empty shipment list is a valid authenticated response.
 try{
  const result=await readFlexport({resource:'shipments',limit:1},{sql});
  if(!result.connected)throw new Error('Flexport is not connected.');
  console.log('Unite connection check:',JSON.stringify({service:'Flexport',resource:'shipments',connected:true,records:result.records.length}));
 }catch(error){
  const status=String(error.message).match(/HTTP (\d{3})/);
  throw new Error('Flexport live shipment read failed'+(status?' (HTTP '+status[1]+')':'')+'. Check credentials and shipment access.');
 }
}
if(process.env.UNITE_VERIFY_RESTORE==='1'){
 const {fetchRestoreFeed,ensureRestoreSavingsSchema,storeRestoreSavings}=await import('../api/_lib/restoreFeed.js');
 if(!process.env.RESTORE_API_TOKEN)throw new Error('Restore token is not configured.');
 try{
  const snapshot=await fetchRestoreFeed(process.env.RESTORE_API_TOKEN);
  console.log('Unite connection check:',JSON.stringify({service:'Restore savings',connected:true,total_savings_usd:snapshot.total_savings_usd}));
  // Explicit one-time initialization from the verified feed, using staging secrets in Vercel.
  // Regular deployments do not fetch or write anything without these opt-in flags.
  if(process.env.UNITE_INITIALIZE_RESTORE==='1'){
   if(process.env.VERCEL_PROJECT_ID!=='prj_PL5BOZooLBtLiPQlrn34SyC0MRKS')throw new Error('Restore initialization is restricted to staging.');
   const {neon}=await import('@neondatabase/serverless');
   const sql=neon(process.env.DATABASE_URL);
   await ensureRestoreSavingsSchema(sql);
   await storeRestoreSavings(sql,snapshot);
   console.log('Unite Restore initialization:',JSON.stringify({saved:true,checked_at:snapshot.checked_at}));
  }
 }catch(error){
  const reason=/^(restore_feed_(http_\d{3}|timeout|network_error|oversized|invalid_json)|invalid_restore_amount)$/.test(error.message)?error.message:'restore_connection_failed';
  throw new Error(reason);
 }
}
if(process.env.UNITE_VERIFY_CONNECTIONS==='1'){
 const {readLiveShopify,shopifyAdminConfigured}=await import('../api/_lib/commerceAgentShopify.js');
 if(!shopifyAdminConfigured())throw new Error('Shopify Admin credentials are missing from this deployment.');
 for(const [kind,query] of [['customers','Posner'],['orders','created_at:<2026-01-01'],['products','knee']]){
  const r=await readLiveShopify({kind,query});
  console.log('Unite connection check:',JSON.stringify({service:'Shopify Admin',kind,connected:r.connected,records:r.nodes?.length??0}));
  if(!r.connected||!r.nodes?.length)throw new Error('Shopify verification failed for '+kind+'. Check the installed app, scopes and protected data access.');
 }
}

if(process.env.UNITE_VERIFY_STRIPE==='1'){
 const {stripeMcpTools,stripeMcpConfigured}=await import('../api/_lib/commerceAgentStripe.js');
 if(!stripeMcpConfigured())throw new Error('Stripe assistant credentials are missing from this deployment.');
 // Check scoped data access without logging customer or payment information.
 for(const resource of ['customers','payment_intents','invoices']){
  const response=await fetch('https://api.stripe.com/v1/'+resource+'?limit=1',{
   headers:{Authorization:'Bearer '+process.env.STRIPE_AGENT_API_KEY},signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw new Error('Stripe read verification failed for '+resource+' (HTTP '+response.status+').');
  const data=await response.json();
  console.log('Unite connection check:',JSON.stringify({service:'Stripe',kind:resource,connected:true,records:data.data?.length??0}));
 }
 // Also exercise the exact remote MCP transport used by the assistant.
 async function agentRequest(path='',body){
  const response=await fetch('https://api.openai.com/v1/agents/sessions'+path,{
   method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json','OpenAI-Beta':'agents=v1'},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)
  });
  if(!response.ok)throw new Error('Assistant connection verification failed (HTTP '+response.status+').');
  return response.json();
 }
 const {AGENT_MODEL}=await import('../api/_lib/commerceAgentTools.js');
 const session=await agentRequest('',{agent:{model:AGENT_MODEL,reasoning:{effort:'medium'},
  instructions:'Verify the read-only Stripe MCP connection. Use its API tools to list at most one customer. Do not change anything. Do not output customer information. Reply only VERIFIED if the live customer read succeeds; otherwise reply FAILED.',
  tools:stripeMcpTools()},environment:{type:'none'},input:'Verify the Stripe customer read through MCP.',stream:false});
 let verified=false;
 for(let attempt=0;attempt<60;attempt++){
  const status=await agentRequest('/'+session.id);
  if(['idle','failed','cancelled','closed'].includes(status.status)){
   const result=await agentRequest('/'+session.id+'/items');
   const items=result.data||result.items||[];
   const reply=items.filter(i=>i.type==='message'&&i.role==='assistant').flatMap(i=>i.content||[]).map(c=>c.text||'').join(' ').trim();
   verified=status.status==='idle'&&reply==='VERIFIED';
   break;
  }
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 if(!verified)throw new Error('Stripe remote MCP customer read did not verify. Inspect the private verification session.');
 console.log('Unite connection check:',JSON.stringify({service:'Stripe MCP',connected:true,customerRead:true}));
}

// Explicitly enabled for the user-authorized initial prospect import only.
if(process.env.UNITE_BOOTSTRAP_PROSPECTS==='1'){
 if(process.env.VERCEL_PROJECT_ID!=='prj_PL5BOZooLBtLiPQlrn34SyC0MRKS'&&!String(process.env.PUBLIC_APP_ORIGIN||'').includes('staging.unitemedical.net'))throw new Error('Prospect bootstrap is restricted to the staging project.');
 const {neon}=await import('@neondatabase/serverless');
 const {exaRequest}=await import('../api/_lib/prospectExa.js');
 const {saveProspectList,syncProspectList}=await import('../api/_lib/prospectCrm.js');
 const sql=neon(process.env.DATABASE_URL);
 for(const id of ['webset_01m38tzdb7xfde1zfdq77te829','webset_01m38vr92gawsy685pzgfgygmz']){
  const webset=await exaRequest('/websets/'+id);
  if(webset.metadata?.workspace!=='Unite Medical')throw new Error('Unexpected prospect workspace.');
  await saveProspectList(sql,webset);
  const result=await syncProspectList(sql,id);
  console.log('Unite prospect import:',JSON.stringify({id,status:result.status,...result.sync}));
 }
 const counts=await sql`SELECT COUNT(*)::int AS count,COUNT(*) FILTER(WHERE COALESCE(data->>'email','')<>'')::int AS emails,COUNT(*) FILTER(WHERE COALESCE(data->>'phone','')<>'')::int AS phones FROM um_rows WHERE tbl='crm_leads' AND deleted=false AND COALESCE((data->>'archived')::boolean,false)=false`;
 console.log('Unite CRM verification:',JSON.stringify(counts[0]));
 const {readShipstation}=await import('../api/_lib/commerceAgentShipstation.js');
 for(const kind of ['orders','shipments']){const r=await readShipstation({kind});if(!r.connected)throw new Error('ShipStation is not connected.');console.log('Unite ShipStation verification:',JSON.stringify({kind,store:r.store,records:r.records.length}));}
}

// Read-only warehouse readiness check; no inventory mutations or private record output.
if (process.env.UNITE_VERIFY_WAREHOUSE === '1') {
  if (process.env.VERCEL_PROJECT_ID !== 'prj_PL5BOZooLBtLiPQlrn34SyC0MRKS') throw new Error('Warehouse verification is restricted to staging.');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  const counts = await sql`SELECT tbl, COUNT(*)::int AS count FROM um_rows WHERE deleted=false AND tbl IN ('products','inventory','lots','bins','warehouses') GROUP BY tbl ORDER BY tbl`;
  console.log('Unite warehouse readiness:', JSON.stringify({ connected: true, tables: counts, aiConfigured: Boolean(process.env.OPENAI_API_KEY) }));
}
