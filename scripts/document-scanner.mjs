// Run behind an authenticated HTTPS reverse proxy. No document bytes are logged.
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import process from 'node:process';
import {Buffer} from 'node:buffer';
const limit=4*1024*1024;
function command(args,bytes){return new Promise((resolve,reject)=>{
 const child=spawn(process.env.CLAMSCAN_BIN||'clamscan',args,{stdio:['pipe','pipe','pipe']});let output='';
 const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('scanner_timeout'));},25000);
 child.on('error',e=>{clearTimeout(timer);reject(e);});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk.toString();if(output.length>65536){child.kill('SIGKILL');reject(new Error('scanner_output_limit'));}});
 child.stdin.on('error',()=>{});child.stdin.end(bytes);
 child.on('close',code=>{clearTimeout(timer);resolve({code,output});});
});}
export async function scanDocument(bytes){
 const version=await command(['--version']);const match=version.output.trim().match(/^ClamAV ([^/]+)\/([^/]+)\/(.+)$/);
 if(version.code!==0||!match)throw new Error('scanner_version_unavailable');
 const updated=Date.parse(match[3]);if(!Number.isFinite(updated)||Date.now()-updated>3*86400000||updated>Date.now()+3600000)throw new Error('scanner_signatures_stale');
 const result=await command(['--no-summary','--alert-encrypted=yes','--alert-exceeds-max=yes','--max-filesize=5M','--max-scansize=20M','-'],bytes);
 if(result.code!==0&&result.code!==1)throw new Error('scanner_error');
 return {result:result.code===0?'clean':'threat',engine:'ClamAV '+match[1],signature_version:match[2],sha256:crypto.createHash('sha256').update(bytes).digest('hex'),job_id:crypto.randomUUID()};
}
export function scannerHandler({token,scan=scanDocument}){
 if(!token||token.length<32)throw new Error('DOCUMENT_SCAN_TOKEN must contain at least 32 characters');
 let busy=false;
 return async(req,res)=>{
  const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  const supplied=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from('Bearer '+token);
  if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return reply(401,{error:'unauthorized'});
  if(req.method!=='POST'||req.url!=='/scan')return reply(404,{error:'not_found'});
  if(busy)return reply(503,{error:'scanner_busy'});
  if(Number(req.headers['content-length'])>limit)return reply(413,{error:'file_too_large'});
  busy=true;
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)return reply(413,{error:'file_too_large'});chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);if(!size||crypto.createHash('sha256').update(bytes).digest('hex')!==req.headers['x-content-sha256'])return reply(400,{error:'document_hash_mismatch'});
   return reply(200,await scan(bytes));
  }catch{return reply(503,{error:'scan_failed'});}finally{busy=false;}
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=http.createServer(scannerHandler({token:process.env.DOCUMENT_SCAN_TOKEN}));server.requestTimeout=30000;server.headersTimeout=10000;
 server.listen(Number(process.env.SCANNER_PORT||4398),'127.0.0.1');
}
