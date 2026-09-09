// Local-only preflight. Never writes customer data or changes inventory.
export function parseCsv(text) {
  const rows=[]; let row=[], value='', quoted=false, afterQuote=false;
  const input=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++) {
    const c=input[i];
    if(quoted) { if(c==='"' && input[i+1]==='"'){value+='"';i++;} else if(c==='"'){quoted=false;afterQuote=true;} else value+=c; continue; }
    if(c==='"' && !value && !afterQuote){quoted=true;continue;}
    if(c===',' || c==='\n' || c==='\r') {
      row.push(value);value='';afterQuote=false;
      if(c!==','){if(c==='\r'&&input[i+1]==='\n')i++;if(row.some(v=>v!==''))rows.push(row);row=[];}
    } else { if(afterQuote && !/\s/.test(c)) throw new Error('Unexpected text after a quoted value. Export this file again.'); value+=c; }
  }
  if(quoted)throw new Error('This CSV ends inside a quoted field. Export the complete file again.');
  if(value || row.length){row.push(value);if(row.some(v=>v!==''))rows.push(row);}
  if(rows.length<2)throw new Error('This file has no data rows.');
  const headers=rows.shift().map(v=>v.trim());
  if(new Set(headers).size!==headers.length)throw new Error('This file has duplicate column headings.');
  if(rows.some(r=>r.length!==headers.length))throw new Error('Some rows have missing or extra columns. Export the original CSV again.');
  return {headers,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))};
}
export function reviewShopifyCsv(text, kind) {
  const {headers,rows}=parseCsv(text); const has=h=>headers.includes(h); const issues=[];
  let count=rows.length, label='rows';
  const add=(n,message)=>{if(n)issues.push({count:n,message});};
  if(kind==='products'){
    if(!has('Handle')||!has('Variant SKU'))throw new Error('Choose a Shopify product export with Handle and Variant SKU columns.');
    const variants=rows.filter(r=>r['Variant SKU'] || r['Option1 Value']);
    count=new Set(rows.map(r=>r.Handle).filter(Boolean)).size;label='products';
    add(variants.filter(r=>!r['Variant SKU'].trim()).length,'variants have no SKU');
    const skus=variants.map(r=>r['Variant SKU'].trim()).filter(Boolean);
    add(skus.length-new Set(skus).size,'duplicate SKU entries need review');
    const blankPrices=variants.filter(r=>!r['Variant Price']?.trim()||!Number.isFinite(Number(r['Variant Price']))||Number(r['Variant Price'])<=0).length;
    add(blankPrices,'variants have missing, zero or invalid prices');
  } else if(kind==='customers') {
    if(!has('Email')||(!has('First Name')&&!has('Customer ID')&&!has('ID')))throw new Error('Choose a Shopify customer export.');
    add(rows.filter(r=>!r.Email.trim()).length,'customers have no email');
    add(rows.filter(r=>r.Email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.Email.trim()) || /(?:no.?reply|placeholder|@example\.|@test\.)/i.test(r.Email))).length,'customer emails need review before activation');
    if(!has('Customer ID')&&!has('ID'))issues.push({message:'Customer IDs are absent. Reconcile with the Shopify API export before migration.'});
    if(!has('Tax Exempt'))issues.push({message:'Tax-exempt status is absent from this file.'});
    label='customers';
  } else if(kind==='orders') {
    if(!has('Name')||!has('Lineitem quantity'))throw new Error('Choose a Shopify order export with line items.');
    count=new Set(rows.map(r=>r.Name).filter(Boolean)).size;label='orders';
    if(!has('Id')&&!has('ID'))issues.push({message:'Immutable Shopify order IDs are absent. Live order matching is required.'});
    issues.push({message:'This is a historical snapshot. Refresh selected orders live before transferring remaining quantities.'});
  } else if(kind==='inventory') {
    if(!has('SKU')||!has('Location'))throw new Error('Choose the location inventory export, not the product export.');
    const onHand=headers.find(h=>/^On hand \(current\)$/i.test(h)) || headers.find(h=>/^On hand$/i.test(h)) || headers.find(h=>/^On hand/i.test(h)&&!/new/i.test(h));
    if(!onHand)throw new Error('Export inventory with on-hand quantities included.');
    add(rows.filter(r=>!r.SKU.trim()).length,'inventory rows have no SKU');
    const stocked=rows.filter(r=>!/^not stocked$/i.test(r[onHand]?.trim()));
    add(rows.length-stocked.length,'location rows are marked not stocked; confirm location coverage');
    add(stocked.filter(r=>!r[onHand]?.trim()||!Number.isInteger(Number(r[onHand]))).length,'on-hand values are missing or invalid');
    add(rows.filter(r=>Number(r[onHand])<0).length,'negative on-hand quantities need review');
    add(rows.filter(r=>!r.Location.trim()).length,'inventory rows have no location');
    const keys=rows.filter(r=>r.SKU.trim()).map(r=>JSON.stringify([r.Location,r.SKU]));
    add(keys.length-new Set(keys).size,'repeated location/SKU rows need reconciliation');
    label='inventory rows';
    issues.push({message:'Verify warehouse coverage and physical counts. This review does not set available stock.'});
  } else throw new Error('Unknown export type.');
  return {kind,count,label,rows:rows.length,columns:headers.length,issues,reviewed_at:new Date().toISOString()};
}
