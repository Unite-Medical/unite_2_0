import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export function localRecoveryDb(socket){
 if(!/^\/tmp\/unite-recovery-qa\.[A-Za-z0-9]+\/socket$/.test(socket||''))throw new Error('Only a task-owned synthetic Unix-socket DB may be used');
 const literal=value=>value==null?'NULL':Array.isArray(value)?'ARRAY['+value.map(literal).join(',')+']':typeof value==='number'?String(value):typeof value==='boolean'?(value?'true':'false'):"'"+String(value).replaceAll("'","''")+"'";
 function csv(raw){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='"'){if(quoted&&raw[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}if(row.length||cell)rows.push([...row,cell]);const headers=rows.shift()||[];return rows.filter(r=>r.length===headers.length).map(r=>Object.fromEntries(headers.map((h,i)=>{let v=r[i];if(['data','recovery_hashes'].includes(h)&&v)v=JSON.parse(v);else if(['attempts','revision','actor_revision','last_counter'].includes(h))v=Number(v);return [h,v];})));}
 return async(strings,...values)=>{const statement=strings.reduce((out,s,i)=>out+s+(i<values.length?literal(values[i]):''),'');const {stdout}=await exec('/opt/homebrew/bin/psql',['-X','-q','--csv','-v','ON_ERROR_STOP=1','-h',socket,'-p','55439','-U','qa','-d','postgres','-c',statement],{maxBuffer:4*1024*1024});return csv(stdout);};
}
