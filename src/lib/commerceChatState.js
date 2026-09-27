export const chatText=item=>(item.content||[]).map(part=>part.text||'').join('\n').trim();
export function chatHref(value){
 if(/^\/admin\/[A-Za-z0-9/?#%=&_.~-]*$/.test(value)&&new URL(value,'https://unite.invalid').pathname.startsWith('/admin/'))return value;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
export function pendingChatTurn(items,text,id){return {id,text:text.trim(),previousIds:items.map(item=>item.id)};}
export function reconcileChatItems(previous,incoming,pending){
 const remote=new Map(incoming.map(item=>[item.id,item]));
 const acknowledged=pending?incoming.find(item=>item.role==='user'&&!pending.previousIds.includes(item.id)&&chatText(item)===pending.text):null;
 const rows=previous.filter(item=>!(acknowledged&&item.id===pending.id)).map(item=>remote.get(item.id)||item);
 const known=new Set(rows.map(item=>item.id));
 for(const item of incoming)if(!known.has(item.id)){rows.push(item);known.add(item.id);}
 const index=acknowledged?incoming.findIndex(item=>item.id===acknowledged.id):-1;
 const answered=index>=0&&incoming.slice(index+1).some(item=>item.type==='message'&&item.role==='assistant'&&item.phase!=='commentary'&&item.status!=='in_progress'&&chatText(item));
 return {items:rows,awaitingReply:Boolean(pending&&!answered)};
}

// Keep each answer, its business activity and its files in the same turn.
// Tool markers contain IDs only, never tool arguments or private reasoning.
export function chatTurns(items,cards=[],steps=[]){
 const turns=[],byTurn=new Map(),byTool=new Map();let current;
 for(const item of items){
  if(item.type==='message'&&item.role==='user'){
   current={id:item.id,user:item,messages:[],progress:[],cards:[],steps:[]};turns.push(current);
  }
  if(!current){current={id:'earlier',messages:[],progress:[],cards:[],steps:[]};turns.push(current);}
  if(item.turn_id)byTurn.set(item.turn_id,current);
  if(item.type==='tool_activity')byTool.set(item.id,current);
  if(item.type==='mcp_activity')current.steps.push(item);
  if(item.type==='message'&&item.role==='assistant')current[item.phase==='commentary'?'progress':'messages'].push(item);
 }
 const earlier={id:'saved',messages:[],progress:[],cards:[],steps:[]};
 for(const [collection,key] of [[cards,'cards'],[steps,'steps']])for(const entry of collection){
  const target=byTurn.get(entry.turn_id)||byTool.get(entry.id)||earlier;
  if(!target[key].some(r=>r.id===entry.id))target[key].push(entry);
 }
 return {turns:turns.filter(t=>t.user||t.messages.length||t.progress.length||t.steps.length),earlier};
}
