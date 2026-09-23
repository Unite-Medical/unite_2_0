import { handleWmsRoute } from '../../_lib/wms.js';
import { planPickScan } from '../../_lib/pickScanning.js';
import { buildBarcodeRegistry,resolveBarcode } from '../../../src/lib/barcodeRegistry.js';
import catalog from '../../../src/data/shopifyLaunchCatalog.generated.json' with {type:'json'};

const registry=buildBarcodeRegistry(catalog.products);
export default function handler(req,res){return handleWmsRoute(req,res,async(sql,body,session)=>{
 if(!session||!['admin','warehouse_manager','warehouse_operator'].includes(session.role))return {ok:false,reason:'picker_session_required'};
 const orderId=String(body.order_id||''),itemId=String(body.order_item_id||'');
 const [orderRows,itemRows,reservationRows,lotRows,scanRows]=await Promise.all([
  sql`SELECT data FROM um_rows WHERE tbl='orders' AND id=${orderId} AND deleted=false LIMIT 1`,
  sql`SELECT data FROM um_rows WHERE tbl='order_items' AND id=${itemId} AND deleted=false LIMIT 1`,
  sql`SELECT data FROM um_rows WHERE tbl='reservations' AND deleted=false AND data->>'order_id'=${orderId}`,
  sql`SELECT data FROM um_rows WHERE tbl='lots' AND deleted=false`,
  sql`SELECT data FROM um_rows WHERE tbl='scan_events' AND deleted=false AND data->>'order_id'=${orderId} AND data->>'kind'='pick_verify'`,
 ]);
 const resolution=resolveBarcode(registry,body.barcode);const plan=planPickScan({order:orderRows[0]?.data,item:itemRows[0]?.data,reservations:reservationRows.map(r=>r.data),lots:lotRows.map(r=>r.data),existingScans:scanRows.map(r=>r.data),barcodeResolution:resolution,body,actorId:session.user_id});
 if(!plan.ok)return plan;if(plan.idempotent)return plan;
 const inserted=await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at) VALUES ('scan_events',${plan.event.id},${JSON.stringify(plan.event)}::jsonb,false,now()) ON CONFLICT (tbl,id) DO NOTHING RETURNING id`;
 if(!inserted.length)return {ok:false,reason:'pick_scan_concurrent_winner'};
 return {ok:true,idempotent:false,event:plan.event,line_complete:plan.complete,on_hand_changed:false};
});}
