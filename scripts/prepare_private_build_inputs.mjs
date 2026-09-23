import {get} from '@vercel/blob';
import {access,mkdir,writeFile} from 'node:fs/promises';
import process from 'node:process';

// Keep historical operational snapshots out of public Git history.
// Controlled deployments restore them from private storage before building.
const inputs={
  'shopifyInventoryOpening.generated.json':{rows:[],locations:[]},
  'damonLegacyOrderDecisions.generated.json':{decisions:[]},
  'barcodeReadiness.generated.json':{summary:{variants:0,mapped:0,missing:0},conflicts:[],queue:[]},
};
await mkdir(new URL('../src/data/',import.meta.url),{recursive:true});
for(const [name,empty] of Object.entries(inputs)){
  const file=new URL(`../src/data/${name}`,import.meta.url);
  if(process.env.UNITE_PRIVATE_BUILD_INPUTS==='1'){
    const blob=await get(`build-inputs/${name}`,{access:'private'});
    if(!blob||blob.statusCode!==200)throw new Error(`Private build input unavailable: ${name}`);
    const body=await new Response(blob.stream).text();
    JSON.parse(body);
    await writeFile(file,body);
  }else{
    try{await access(file);}catch{await writeFile(file,JSON.stringify(empty)+'\n');}
  }
}
