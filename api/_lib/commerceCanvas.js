import {validateDocument} from './commerceAgentFiles.js';
export function canvasPatch(current,input){
 if(!['canvas','document'].includes(current?.type))throw new Error('Choose a canvas or document.');
 if(Number(input.revision)!==Number(current.revision||0))throw new Error('This canvas changed. Reload its latest version before saving.');
 const title=String(input.title||current.title||'Untitled').trim().slice(0,140);
 const patch=current.type==='document'?{document:validateDocument({...input.document,title})}:normalizeCanvas({...input,title});
 const version={revision:Number(current.revision||0),title:current.title,at:current.updated_at||current.created_at,...(current.type==='document'?{document:current.document}:{format:current.format,content:current.content})};
 return {...current,...patch,title,revision:Number(current.revision||0)+1,versions:[...(current.versions||[]),version].slice(-5),updated_at:new Date().toISOString()};
}
export function normalizeCanvas(input){
 const format=['markdown','html','svg'].includes(input.format)?input.format:'markdown',content=String(input.content??'');
 if(content.length>100000)throw new Error('Keep this canvas under 100,000 characters.');
 return {title:String(input.title||'Untitled canvas').trim().slice(0,140),format,content};
}
export async function saveCanvas(sql,current,input,userId){
 const next=canvasPatch(current,input);
 const saved=await sql`UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl='commerce_agent_cards' AND id=${current.id} AND data->>'user_id'=${userId} AND data->>'session_id'=${current.session_id} AND COALESCE((data->>'revision')::integer,0)=${Number(current.revision||0)} AND deleted=false RETURNING id`;
 if(!saved.length)throw new Error('This canvas changed. Reload its latest version before saving.');return next;
}
