import {LEAD_FIELDS,STAGE_LABEL} from '../../src/lib/crmSchema.js';
import {UNITE_BRAND} from '../../src/lib/uniteBrand.js';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {Document,Packer,Paragraph,TextRun,ImageRun,Header,Footer,PageNumber,HeadingLevel,Table,TableRow,TableCell,WidthType} from 'docx';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
const requireFileLibrary=createRequire(import.meta.url);

// One production template keeps all assistant output aligned with the official artwork.
export const FILE_BRAND={name:UNITE_BRAND.name,ink:UNITE_BRAND.ink.slice(1),accent:UNITE_BRAND.accent.slice(1),pale:UNITE_BRAND.pale.slice(1),muted:UNITE_BRAND.muted.slice(1),font:UNITE_BRAND.font};
const asset=name=>path.join(process.cwd(),'public','brand',name);
const logo=()=>fs.readFileSync(asset('unite-medical-logo.png'));
export const FILE_TYPES={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',csv:'text/csv; charset=utf-8'};
const string=(x,max)=>String(x??'').trim().slice(0,max);
export function validateDocument(input){
 if(!input||JSON.stringify(input).length>450000)throw new Error('Use a smaller document.');
 const title=string(input.title,140);if(!title)throw new Error('Give the file a title.');
 if(!Array.isArray(input.sections)||!input.sections.length||input.sections.length>30)throw new Error('Use 1–30 sections.');
 const sections=input.sections.map(s=>{
  const paragraphs=(s.paragraphs||[]).map(x=>string(x,4000)),bullets=(s.bullets||[]).map(x=>string(x,600)),columns=(s.columns||[]).map(x=>string(x,100));
  if(paragraphs.length>30||bullets.length>30||columns.length>12||!Array.isArray(s.rows)||s.rows.length>1500)throw new Error('Use fewer paragraphs, columns or rows.');
  const rows=s.rows.map(row=>{if(!Array.isArray(row)||row.length!==columns.length||!columns.length)throw new Error('Every table row must match the column headings.');return row.map(x=>typeof x==='number'&&Number.isFinite(x)?x:string(x,500));});
  return {heading:string(s.heading,140),paragraphs,bullets,columns,rows};
 });
 return {title,subtitle:string(input.subtitle,300),sections,sources:(input.sources||[]).map(x=>string(x,500)).slice(0,40)};
}
export function fileName(title,format){return 'Unite-'+title.replace(/[^a-zA-Z0-9 -]/g,'').trim().replace(/\s+/g,'-').slice(0,90)+'.'+format;}
function csv(rows){const cell=v=>'"'+(/^[\s]*[=+@-]/.test(String(v??''))?"'":'')+String(v??'').replaceAll('"','""')+'"';return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');}
export async function workbookFromRows(rows,title='Workspace export'){
 const columns=[...new Set(rows.flatMap(Object.keys))];
 return makeWorkbook({title,subtitle:'Workspace data export',sources:[],sections:[{heading:'Records',paragraphs:[],bullets:[],columns,rows:rows.map(r=>columns.map(k=>typeof r[k]==='object'&&r[k]!==null?JSON.stringify(r[k]):r[k]??''))}]});
}
export async function prospectWorkbook(records){
 const longFields=new Set(['notes','product_interest','next_action']);
 const fields=LEAD_FIELDS.filter(([k])=>!longFields.has(k));
 const columns=[...fields.map(([,label])=>label),'Stage','Do not contact','Source URL','Record ID'];
 const rows=records.map(r=>[...fields.map(([k])=>Array.isArray(r[k])?r[k].join('; '):r[k]??''),STAGE_LABEL[r.stage]||r.stage,r.do_not_contact?'Yes':'No',r.source_url||r.website||'',r.id]);
 const research=[];
 function add(company,field,status,value,url=''){
  const str=String(value??'');if(!str&&!url)return;
  // Continuation rows preserve the full source text without giant spreadsheet rows.
  let start=0,part=1;
  do{let end=Math.min(start+400,str.length),breaks=0;for(let i=start;i<end;i++){if(str[i]==='\n'&&++breaks===5){end=i+1;break;}}research.push([company,field,status,part++,str.slice(start,end),start===0?url:'']);start=end;}while(start<str.length);
 }
 for(const r of records){
  for(const key of longFields)add(r.company,LEAD_FIELDS.find(f=>f[0]===key)?.[1]||key,'Recorded',r[key]);
  add(r.company,'Outreach angle','Needs review',r.outreach_angle);
  for(const n of r.research?.review_notes||[])add(r.company,'Review note','Needs review',n);
  for(const e of r.research?.evaluations||[]){add(r.company,e.criterion,e.satisfied,e.reasoning);for(const ref of e.references||[])add(r.company,e.criterion,'Source',ref.snippet||ref.title,ref.url);}
  for(const e of r.research?.enrichments||[]){add(r.company,e.title,e.status,e.result?.join('\n'));add(r.company,e.title,'Research explanation',e.reasoning);for(const ref of e.references||[])add(r.company,e.title,'Source',ref.snippet||ref.title,ref.url);}
 }
 return makeWorkbook({title:'Unite Medical prospects',subtitle:records.length+' prospect records. Published contacts are not deliverability verified.',sources:[],sections:[{heading:'Prospects',columns,rows,paragraphs:[],bullets:[]},{heading:'Research',columns:['Company','Field','Status','Part','Text','Source URL'],columnWidths:[32,34,20,8,80,55],rows:research,paragraphs:['Long text continues in numbered parts. Match criteria, research results, notes and source references are retained.'],bullets:[]}]});
}
async function makeWorkbook(data){
 const book=new ExcelJS.Workbook();book.creator=FILE_BRAND.name;book.title=data.title;
 for(const [index,s] of data.sections.entries()){
  const name=(s.heading||'Sheet '+(index+1)).replace(/[\\/*?:[\]]/g,' ').slice(0,25)+' '+(index+1),sheet=book.addWorksheet(name,{properties:{tabColor:{argb:FILE_BRAND.accent}},pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  sheet.addImage(book.addImage({buffer:logo(),extension:'png'}),{tl:{col:0,row:0},ext:{width:165,height:43}});sheet.getRow(1).height=42;
  const width=Math.max(2,s.columns.length);sheet.mergeCells(2,1,2,width);sheet.getCell('A2').value=data.title;sheet.getRow(2).height=30;sheet.getCell('A2').font={name:FILE_BRAND.font,size:20,bold:true,color:{argb:FILE_BRAND.ink}};
  let line=3;for(const text of [data.subtitle,...s.paragraphs,...s.bullets.map(b=>'• '+b)].filter(Boolean)){sheet.mergeCells(line,1,line,width);sheet.getCell(line,1).value=text;sheet.getCell(line,1).alignment={wrapText:true,vertical:'top'};sheet.getRow(line).height=Math.max(24,Math.ceil(text.length/(width*25))*15);line++;}
  line++;const header=line;
  if(s.columns.length){sheet.addTable({name:'UniteTable'+index,ref:'A'+line,headerRow:true,style:{theme:'TableStyleMedium2',showRowStripes:true},columns:s.columns.map((name,i)=>({name:name||'Column '+(i+1),filterButton:true})),rows:s.rows});sheet.getRow(header).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:FILE_BRAND.ink}};c.font={name:FILE_BRAND.font,color:{argb:'FFFFFF'},bold:true};});sheet.getRow(header).height=28;line+=s.rows.length+2;}
  sheet.views=[{state:'frozen',ySplit:header,xSplit:0}];sheet.columns.forEach((c,i)=>{c.width=s.columnWidths?.[i]||(i===0?30:24);});
  sheet.eachRow((r,n)=>{if(n>header&&n<header+s.rows.length+1){r.height=Math.max(22,...r.values.slice(1).map((v,i)=>String(v??'').split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/(s.columnWidths?.[i]||(i===0?30:24)))),0)*14));r.eachCell(c=>{c.font={name:FILE_BRAND.font,size:11,color:{argb:FILE_BRAND.ink}};c.alignment={vertical:'top',wrapText:true};if(typeof c.value==='number')c.numFmt=Number.isInteger(c.value)?'#,##0':'#,##0.00';});}});
  if(data.sources.length){sheet.getCell(line,1).value='Sources';data.sources.forEach((v,i)=>{sheet.getCell(line+i+1,1).value=v;});}
 }
 return Buffer.from(await book.xlsx.writeBuffer());
}
async function makeDocx(data){
 const p=(text,opts={})=>new Paragraph({children:[new TextRun(String(text))],spacing:{after:140},...opts});
 const children=[p(data.title,{heading:HeadingLevel.TITLE}),...(data.subtitle?[p(data.subtitle)]:[])];
 for(const s of data.sections){if(s.heading)children.push(p(s.heading,{heading:HeadingLevel.HEADING_1,keepNext:true}));children.push(...s.paragraphs.map(t=>p(t)),...s.bullets.map(t=>p(t,{bullet:{level:0}})));
  if(s.columns.length){const cell=(v,head)=>new TableCell({shading:{fill:head?FILE_BRAND.ink:'FFFFFF'},margins:{top:90,bottom:90,left:100,right:100},children:[new Paragraph({children:[new TextRun({text:String(v),bold:head,color:head?'FFFFFF':FILE_BRAND.ink,size:20})]})]});children.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({tableHeader:true,children:s.columns.map(v=>cell(v,true))}),...s.rows.map(row=>new TableRow({children:row.map(v=>cell(v,false))}))]}),p(''));}
 }
 if(data.sources.length)children.push(p('Sources',{heading:HeadingLevel.HEADING_1}),...data.sources.map(t=>p(t)));
 const doc=new Document({creator:FILE_BRAND.name,title:data.title,styles:{default:{document:{run:{font:FILE_BRAND.font,size:22,color:FILE_BRAND.ink},paragraph:{spacing:{line:280}}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',run:{size:52,bold:true,color:FILE_BRAND.ink},paragraph:{spacing:{after:240}}},{id:'Heading1',name:'Heading 1',basedOn:'Normal',run:{size:30,bold:true,color:FILE_BRAND.ink},paragraph:{spacing:{before:240,after:140}}}]},sections:[{properties:{page:{margin:{top:1100,bottom:1000,left:1000,right:1000}}},headers:{default:new Header({children:[new Paragraph({children:[new ImageRun({type:'png',data:logo(),transformation:{width:165,height:43}})]})]})},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun({text:'Unite Medical  •  ',color:FILE_BRAND.muted,size:18}),new TextRun({children:[PageNumber.CURRENT]})]})]})},children}]});
 return Packer.toBuffer(doc);
}
async function makePdf(data){
 const doc=new PDFDocument({size:'LETTER',margin:48,bufferPages:true,info:{Title:data.title,Author:FILE_BRAND.name}}),chunks=[];
 const complete=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.registerFont('Unite',path.join(process.cwd(),'public/brand/fonts/Poppins-400.ttf'));doc.registerFont('UniteBold',path.join(process.cwd(),'public/brand/fonts/Poppins-600.ttf'));
 const page=()=>{doc.image(logo(),48,28,{width:136});doc.moveTo(48,72).lineTo(564,72).strokeColor('#'+FILE_BRAND.accent).lineWidth(1).stroke();doc.y=90;};page();doc.on('pageAdded',page);
 const text=(value,size=10,bold=false)=>{doc.font(bold?'UniteBold':'Unite').fontSize(size).fillColor('#'+FILE_BRAND.ink).text(String(value),48,doc.y,{width:516,lineGap:3});doc.moveDown(.5);};
 text(data.title,24,true);if(data.subtitle)text(data.subtitle,11);
 for(const s of data.sections){if(doc.y>640)doc.addPage();if(s.heading)text(s.heading,15,true);s.paragraphs.forEach(v=>text(v));s.bullets.forEach(v=>text('• '+v));
  if(s.columns.length){const w=516/s.columns.length;const row=(values,header=false)=>{doc.font(header?'UniteBold':'Unite').fontSize(8);const h=Math.max(27,...values.map(v=>doc.heightOfString(String(v),{width:w-12,lineGap:2})+14));if(h>610)throw new Error('This table is too dense for PDF. Use Excel or fewer columns.');if(doc.y+h>733){doc.addPage();if(!header)row(s.columns,true);}const y=doc.y;values.forEach((v,i)=>{doc.rect(48+i*w,y,w,h).fillAndStroke(header?'#'+FILE_BRAND.ink:'#FFFFFF','#E0DDE1');doc.fillColor(header?'#FFFFFF':'#'+FILE_BRAND.ink).text(String(v),54+i*w,y+6,{width:w-12,lineGap:2});});doc.y=y+h;};row(s.columns,true);s.rows.forEach(v=>row(v));doc.moveDown();}
 }
 if(data.sources.length){text('Sources',14,true);data.sources.forEach(v=>text(v,8));}
 const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.font('Unite').fontSize(8).fillColor('#'+FILE_BRAND.muted).text('Unite Medical  •  '+(i+1)+' / '+range.count,48,754,{lineBreak:false});}doc.end();return complete;
}
function chunksOfText(text,limit=400){const parts=[];let current='';for(const word of String(text).split(/\s+/)){if((current+' '+word).length>limit&&current){parts.push(current);current='';}current+=(current?' ':'')+word;}if(current)parts.push(current);return parts;}
async function makePptx(data){
 // PptxGenJS 4 publishes its ESM entry as .js without a module package type.
 // Use its supported Node/CommonJS export and load it only for PowerPoint.
 const pptxgen=requireFileLibrary('pptxgenjs');
 const ppt=new pptxgen();ppt.layout='LAYOUT_WIDE';ppt.author=FILE_BRAND.name;ppt.subject=data.subtitle;ppt.title=data.title;ppt.company=FILE_BRAND.name;ppt.lang='en-US';ppt.theme={headFontFace:FILE_BRAND.font,bodyFontFace:FILE_BRAND.font,lang:'en-US'};
 const image='data:image/png;base64,'+logo().toString('base64');let index=0;
 const slide=heading=>{const s=ppt.addSlide();index++;s.background={color:'FFFFFF'};s.addImage({data:image,x:.55,y:.28,w:1.8,h:.471});s.addShape(ppt.ShapeType.line,{x:.55,y:1.02,w:12.2,h:0,line:{color:FILE_BRAND.accent,width:1}});s.addText(heading,{x:.6,y:1.3,w:12.1,h:1,fontSize:28,bold:true,color:FILE_BRAND.ink,breakLine:false,margin:0,fit:'shrink'});s.addText('Unite Medical  •  '+index,{x:.6,y:7.08,w:11,h:.18,fontSize:9,color:FILE_BRAND.muted,margin:0});s.addNotes(data.sources.join('\n'));return s;};
 let title=slide(data.title);title.addText(data.subtitle||'Prepared by Unite Medical',{x:.6,y:2.6,w:10.5,h:1.5,fontSize:24,color:FILE_BRAND.muted,margin:0});
 for(const section of data.sections){const blocks=[...section.paragraphs,...section.bullets.map(v=>'• '+v)].flatMap(v=>chunksOfText(v));for(let n=0;n<blocks.length;n+=3){const s=slide(section.heading||data.title);s.addText(blocks.slice(n,n+3).join('\n\n'),{x:.6,y:2.5,w:12,h:4.1,fontSize:20,color:FILE_BRAND.ink,margin:0,breakLine:false,fit:'shrink',valign:'top'});}
  if(section.columns.length){if(section.columns.length>8)throw new Error('Use at most 8 columns for a readable presentation.');for(let n=0;n<Math.max(1,section.rows.length);n+=8){const s=slide(section.heading||data.title);s.addTable([section.columns.map(text=>({text,options:{bold:true,color:'FFFFFF',fill:FILE_BRAND.ink}})),...section.rows.slice(n,n+8).map(row=>row.map(v=>String(v)))],{x:.6,y:2.5,w:12,rowH:.4,fontFace:FILE_BRAND.font,fontSize:12,color:FILE_BRAND.ink,border:{type:'solid',pt:.5,color:'D9D9D9'},margin:.09,autoPage:true,autoPageRepeatHeader:true,autoPageHeaderRows:1,newSlideStartY:1.3});}}
 }
 return Buffer.from(await ppt.write({outputType:'nodebuffer'}));
}
export async function generateAgentFile(input,format){
 if(!FILE_TYPES[format])throw new Error('Choose Word, PDF, Excel, PowerPoint or CSV.');const data=validateDocument(input);
 const rowCount=data.sections.reduce((n,s)=>n+s.rows.length,0),textLength=data.sections.reduce((n,s)=>n+s.paragraphs.join('').length+s.bullets.join('').length,0);
 if(format==='pptx'&&(rowCount>240||textLength>24000))throw new Error('This is too much content for a readable deck. Ask for a shorter presentation or download the full Excel workbook.');
 if(['pdf','docx'].includes(format)&&(rowCount>1500||textLength>100000))throw new Error('Use an Excel workbook for this much data, or ask for a shorter report.');
 if(format==='docx')return makeDocx(data);if(format==='pdf')return makePdf(data);if(format==='xlsx')return makeWorkbook(data);if(format==='pptx')return makePptx(data);
 return Buffer.from(csv([[data.title],[data.subtitle],...data.sections.flatMap(s=>[[s.heading],...s.paragraphs.map(v=>[v]),...s.bullets.map(v=>[v]),...(s.columns.length?[s.columns,...s.rows]:[])]),['Sources'],...data.sources.map(v=>[v])]));
}
