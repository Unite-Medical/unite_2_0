const fields=['recipient','company','address1','address2','city','province','zip','country','phone'];
export function usableShippingAddress(address){
 return Boolean(address&&[address.recipient||address.company,address.address1,address.city,address.zip,address.country].every(value=>typeof value==='string'&&value.trim()));
}
export function latestOrderShippingAddress(orders,customerId){
 const candidates=orders.filter(order=>order.customer_id===customerId&&order.draft!==true&&(order.historical===true||order.draft===false||order.operational_order_id)&&!order.cancelled_at&&!order.canceled_at&&!['cancelled','canceled','voided'].includes(order.status)&&!['cancelled','canceled','voided'].includes(order.workflow_state)&&usableShippingAddress(order.shipping_address)).map(order=>({order,time:Date.parse(order.placed_at||order.created_at)})).filter(row=>Number.isFinite(row.time)).sort((a,b)=>b.time-a.time||String(a.order.id).localeCompare(String(b.order.id)));
 const order=candidates[0]?.order;
 if(!order)return null;
 return {order_id:order.id,order_number:order.number||'',ordered_at:order.placed_at||order.created_at,address:Object.fromEntries(fields.map(key=>[key,String(order.shipping_address[key]||'').trim()]))};
}
export async function readLatestOrderShipping(sql,customerId){
 const rows=await sql`SELECT jsonb_build_object('id',id,'customer_id',data->>'customer_id','number',data->>'number','draft',data->'draft','historical',data->'historical','operational_order_id',data->>'operational_order_id','created_at',data->>'created_at','placed_at',data->>'placed_at','cancelled_at',data->>'cancelled_at','canceled_at',data->>'canceled_at','status',data->>'status','workflow_state',data->>'workflow_state','shipping_address',data->'shipping_address') AS data FROM um_rows WHERE tbl='commerce_orders' AND deleted=false AND data->>'customer_id'=${customerId}`;
 return latestOrderShippingAddress(rows.map(row=>row.data),customerId);
}
