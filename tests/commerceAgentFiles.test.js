import process from 'node:process';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {validateDocument,generateAgentFile,workbookFromRows} from '../api/_lib/commerceAgentFiles.js';
import {validateAgentEmail,sendAgentEmail} from '../api/_lib/commerceAgentEmail.js';
import {stripeMcpTools} from '../api/_lib/commerceAgentStripe.js';
const document={title:'Customer account review',subtitle:'Unite Medical • Sample for layout testing',sources:['Local test fixtures; not live customer data'],sections:[{heading:'Account summary',paragraphs:['Review the account history and confirm the next steps before making changes. This document uses the Unite Medical template.'],bullets:['Verify shipping addresses','Review pricing and open orders'],columns:['Product','Quantity','Unit price'],rows:[['Sample medical supply',12,49.5],['Sample equipment',2,490],['=unsafe formula',1,22]]}]};
test('assistant cold start and PowerPoint work without implicit module detection',()=>{
 const source=`await import('./api/admin/commerce-assistant.js');const {generateAgentFile}=await import('./api/_lib/commerceAgentFiles.js');const file=await generateAgentFile(${JSON.stringify(document)},'pptx');if(file.length<200)throw new Error('Empty presentation');`;
 const child=spawnSync(process.execPath,['--no-experimental-detect-module','--input-type=module','-e',source],{cwd:process.cwd(),encoding:'utf8',timeout:20000});
 assert.equal(child.status,0,child.stderr||child.error?.message);
});
test('document validates table shape and bounded sections',()=>{assert.throws(()=>validateDocument({...document,sections:[{...document.sections[0],rows:[['bad']]}]}),/match/);assert.throws(()=>validateDocument({...document,sections:[]}),/sections/);});
test('generated Office files retain editable content and logo; CSV neutralizes formulas',async()=>{
 for(const format of ['docx','xlsx','pptx','pdf','csv']){
  const file=await generateAgentFile(document,format);assert.ok(file.length>200,format);
  if(process.env.WRITE_AGENT_QA_FILES){fs.mkdirSync('/tmp/unite-file-qa',{recursive:true});fs.writeFileSync('/tmp/unite-file-qa/Unite-sample.'+format,file);}
  if(format==='pdf'){assert.equal(file.subarray(0,5).toString(),'%PDF-');continue;}
  if(format==='csv'){assert.match(file.toString(),/'=unsafe formula/);continue;}
  const zip=await JSZip.loadAsync(file);const names=Object.keys(zip.files);assert.ok(names.some(n=>/media\//.test(n)&&n.endsWith('.png')),format+' logo');
  if(format==='docx'){const xml=await zip.file('word/document.xml').async('string');assert.match(xml,/Account summary/);assert.match(xml,/<w:tbl>/);}
  if(format==='pptx'){const slides=names.filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n));assert.ok(slides.length>=3);assert.ok((await Promise.all(slides.map(n=>zip.file(n).async('string')))).some(xml=>xml.includes('<a:tbl>')));}
  if(format==='xlsx'){const book=new ExcelJS.Workbook();await book.xlsx.load(file);const sheet=book.worksheets[0];let found=false;sheet.eachRow(row=>row.eachCell(cell=>{if(cell.value===49.5){found=true;assert.equal(cell.type,ExcelJS.ValueType.Number);}assert.notEqual(cell.type,ExcelJS.ValueType.Formula);}));assert.ok(found);assert.equal(sheet.views[0].state,'frozen');}
 }
});
test('bulk Excel export includes every record without agent transcription',async()=>{const rows=Array.from({length:205},(_,i)=>({id:String(i),amount:i+0.5,notes:'=SUM(A1)'}));const data=await workbookFromRows(rows,'Full export');const book=new ExcelJS.Workbook();await book.xlsx.load(data);const all=[];book.worksheets[0].eachRow(row=>row.eachCell(cell=>{if(cell.value==='=SUM(A1)'){all.push(cell);assert.equal(cell.type,ExcelJS.ValueType.String);}}));assert.equal(all.length,205);});
test('email validates recipients and subject header injection',()=>{assert.throws(()=>validateAgentEmail({to:['a@example.com\r\nBcc: evil@example.com'],subject:'Test',text:'Hi'}),/recipient/);assert.throws(()=>validateAgentEmail({to:['a@example.com'],subject:'Test\nBcc',text:'Hi'}),/subject/);});
test('email only sends once after a claimed draft; ambiguous failure is not silently retried',async()=>{
 let card={id:'test-mail',user_id:'one',type:'email',status:'draft',email:{to:['test@example.com'],subject:'Fixture',text:'Do not send; mock provider.'}},calls=0;
 const sql=async(strings,...args)=>{if(strings.join('').includes("tbl='crm_leads'"))return [];if(strings.join('').includes("status'='draft'")){if(card.status!=='draft')return [];card=JSON.parse(args[0]);return [{id:card.id}];}card=JSON.parse(args[0]);return [];};
 const original={...card};const actor={user_id:'one'},client={emails:{send:async()=>{calls++;throw new Error('network lost');}}};
 const result=await sendAgentEmail(sql,card,actor,{client});assert.equal(result.status,'delivery_unknown');await sendAgentEmail(sql,result,actor,{client});assert.equal(calls,1);await assert.rejects(sendAgentEmail(sql,original,actor,{client}),/already/);assert.equal(calls,1);await assert.rejects(sendAgentEmail(sql,original,{user_id:'two'},{client}),/another account/);
});
test('Stripe MCP allowlist cannot expose writes or feedback sending',()=>{const previous=process.env.STRIPE_AGENT_API_KEY;try{process.env.STRIPE_AGENT_API_KEY='test-only';const [mcp]=stripeMcpTools();assert.ok(mcp.allowed_tools.includes('stripe_api_read'));assert.ok(!mcp.allowed_tools.includes('stripe_api_write'));assert.ok(!mcp.allowed_tools.includes('send_stripe_feedback'));}finally{if(previous===undefined)delete process.env.STRIPE_AGENT_API_KEY;else process.env.STRIPE_AGENT_API_KEY=previous;}});
test('prospect Excel separates research into bounded continuation rows',async()=>{const {prospectWorkbook}=await import('../api/_lib/commerceAgentFiles.js');const long='Publicly sourced product-fit evidence. '.repeat(800)+'A\n\nB\n'.repeat(200);const file=await prospectWorkbook([{id:'lead_test',company:'Example organization',stage:'new',notes:long,research:{enrichments:[],evaluations:[]}}]);const book=new ExcelJS.Workbook();await book.xlsx.load(file);assert.equal(book.worksheets.length,2);const main=book.worksheets[0],research=book.worksheets[1];assert.equal(main.getCell('A6').value,'Example organization');const parts=[];research.eachRow((r,n)=>{if(n>6&&r.getCell(2).value==='Notes')parts.push(r.getCell(5).value);assert.ok((r.height||0)<200,'Research rows must remain readable');});assert.equal(parts.join(''),long);});
