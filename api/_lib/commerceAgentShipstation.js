const BASE='https://ssapi.shipstation.com';
export const shipstationConfigured=()=>Boolean(process.env.SHIPSTATION_API_KEY&&process.env.SHIPSTATION_API_SECRET&&process.env.SHIPSTATION_STORE_ID);
export async function readShipstation({kind='orders',order_number='',tracking_number='',page=1,limit=20},{fetcher=fetch}={}){
 if(!shipstationConfigured())return {connected:false,message:'ShipStation is not connected.'};
 if(!['orders','shipments'].includes(kind))throw new Error('Choose orders or shipments.');
 const q=new URLSearchParams({storeId:process.env.SHIPSTATION_STORE_ID,page:String(Math.max(1,Math.min(100,Number(page)||1))),pageSize:String(Math.max(1,Math.min(50,Number(limit)||20))),sortBy:kind==='orders'?'OrderDate':'ShipDate',sortDir:'DESC'});
 if(kind==='shipments')q.set('includeShipmentItems','true');
 if(order_number)q.set('orderNumber',String(order_number).slice(0,80));
 if(tracking_number&&kind==='shipments')q.set('trackingNumber',String(tracking_number).slice(0,100));
 const r=await fetcher(BASE+'/'+kind+'?'+q,{headers:{Authorization:'Basic '+Buffer.from(process.env.SHIPSTATION_API_KEY+':'+process.env.SHIPSTATION_API_SECRET).toString('base64')},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error('ShipStation lookup failed (HTTP '+r.status+').');const data=await r.json();
 // No arbitrary URL or write endpoint is exposed to the assistant.
 return {connected:true,store:'Unite Medical',page:data.page,pages:data.pages,total:data.total,note:kind==='shipments'?'Label-generated shipments only; also inspect orders marked shipped.':'',records:(data[kind]||[]).filter(r=>!r.advancedOptions?.storeId||String(r.advancedOptions.storeId)===String(process.env.SHIPSTATION_STORE_ID)).map(r=>({id:kind==='orders'?r.orderId:r.shipmentId,order_number:r.orderNumber,status:r.orderStatus,order_date:r.orderDate,ship_date:r.shipDate,tracking_number:r.trackingNumber,carrier:r.carrierCode,service:r.serviceCode,voided:r.voided,customer_name:r.shipTo?.name,company:r.shipTo?.company,city:r.shipTo?.city,state:r.shipTo?.state,items:(r.items||r.shipmentItems)?.map(i=>({sku:i.sku,name:i.name,quantity:i.quantity,unit_price:i.unitPrice})),shipping_cost:r.shipmentCost}))};
}
