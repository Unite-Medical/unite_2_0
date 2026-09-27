import {brandedEmail} from '../../src/lib/uniteBrand.js';
import {Resend} from 'resend';
export function validateAgentEmail(value){
 const to=Array.isArray(value?.to)?[...new Set(value.to.map(v=>String(v).trim().toLowerCase()))]:[];
 if(!to.length||to.length>10||to.some(v=>!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(v)||v.length>254))throw new Error('Enter between 1 and 10 valid recipient email addresses.');
 const subject=String(value.subject||'').trim(),text=String(value.text||'').trim();
 if(!subject||subject.length>200||/[\r\n]/.test(subject))throw new Error('Enter a subject under 200 characters.');
 if(!text||text.length>50000)throw new Error('Enter a message under 50,000 characters.');
 return {to,subject,text};
}
export async function sendAgentEmail(sql,card,actor,{email,apiKey=process.env.RESEND_API_KEY,client}={}){
 if(card.type!=='email')throw new Error('Choose an email draft.');
 if(card.user_id!==actor.user_id)throw new Error('This email belongs to another account.');
 if(card.status!=='draft')return card;
 if(!apiKey&&!client)throw new Error('Email delivery is not configured. The draft has been saved.');
 const draft=validateAgentEmail(email||card.email),from=process.env.UNITE_INQUIRY_FROM||'Unite Medical <support@unitemedical.net>';
 const suppressed=await sql`SELECT id FROM um_rows WHERE tbl='crm_leads' AND deleted=false AND lower(data->>'email')=ANY(${draft.to}::text[]) AND (data->>'do_not_contact')='true' LIMIT 1`;
 if(suppressed.length)throw new Error('One of these recipients is marked Do not contact in the CRM. The email was not sent.');
 const branded=brandedEmail(draft.text,actor);
 const next={...card,email:draft,signature:branded.signature,brand_version:'unite-official-v1',from,status:'sending',sending_at:new Date().toISOString(),sent_by:actor.user_id};
 const claimed=await sql`UPDATE um_rows SET data=${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl='commerce_agent_cards' AND id=${card.id} AND data->>'user_id'=${actor.user_id} AND data->>'status'='draft' RETURNING id`;
 if(!claimed.length)throw new Error('This email is already being processed. Reopen the conversation to check its status.');
 let outcome;
 try{const provider=client||new Resend(apiKey);const result=await provider.emails.send({from,...draft,text:branded.text,html:branded.html,replyTo:branded.signature.email},{idempotencyKey:'unite-assistant-'+card.id});outcome=result.error?{status:'send_failed',error:'The email provider rejected this message: '+(result.error.message||result.error.name||'unknown error')}:{status:'sent',provider_message_id:result.data?.id,sent_at:new Date().toISOString()};}
 catch{outcome={status:'delivery_unknown',error:'Delivery could not be confirmed. Check the email provider log before sending again.'};}
 const saved={...next,...outcome};await sql`UPDATE um_rows SET data=${JSON.stringify(saved)}::jsonb,updated_at=now() WHERE tbl='commerce_agent_cards' AND id=${card.id}`;return saved;
}
