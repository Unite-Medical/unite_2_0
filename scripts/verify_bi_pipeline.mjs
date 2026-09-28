// Explicit initial backfill/verification on the configured staging build host.
// Keep credentials and individual business records out of build logs.
import { neon } from '@neondatabase/serverless';
import { runBiPipeline } from '../api/_lib/biPipeline.js';
import { readBiReport } from '../api/_lib/biReports.js';
if(process.env.VERCEL_PROJECT_ID!=='prj_PL5BOZooLBtLiPQlrn34SyC0MRKS')throw new Error('BI initialization is restricted to the staging project.');
if(!process.env.DATABASE_URL||!process.env.CRON_SECRET)throw new Error('BI database and worker authentication must be configured.');
const sql=neon(process.env.DATABASE_URL);
try{
  for(let batch=0;batch<35;batch++){
    const result=await runBiPipeline(sql);
    console.log('BI refresh batch:',JSON.stringify({batch:batch+1,busy:result.busy,pages:result.pages_processed,sources:result.sources?.map(s=>({source:s.source,status:s.status,records:s.records_received,error:s.error}))}));
    if(result.busy||!result.pages_processed)break;
  }
  for(const topic of ['overview','purchasing','inventory','sales','receivables','payables','payments','shipping']){
    const report=await readBiReport(sql,{topic,limit:1});
    console.log('BI report verification:',JSON.stringify({topic,status:report.status||'ready',rows:report.total_rows,unavailable:report.unavailable||[]}));
  }
}catch{throw new Error('BI initialization failed. Inspect the authenticated data readiness view; no source business records were changed.');}
