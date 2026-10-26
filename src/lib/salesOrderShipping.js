export function reviewedSalesShipping(input={}){
 const kind=input.shipping_kind||'manual';
 if(!['manual','pickup','free'].includes(kind))throw new Error('Choose manual shipping, pickup or free shipping.');
 const charge=Math.round(Number(input.shipping??0)*100)/100;
 if(!Number.isFinite(charge)||charge<0||charge>100000000)throw new Error('Enter a valid shipping charge.');
 if(kind!=='manual'&&charge!==0)throw new Error('Pickup and free shipping must have a $0.00 charge.');
 const name=String(input.shipping_name||'').trim().slice(0,100)||({manual:'Manual agreed rate',pickup:'Customer pickup',free:'Free shipping'})[kind];
 return {shipping_kind:kind,shipping:charge,shipping_name:name,shipping_note:String(input.shipping_note||'').trim().slice(0,300)};
}
