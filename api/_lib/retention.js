export const RETAINED_TABLES=new Set(['legal_holds','quote_acceptance_events','payment_requests','order_batches','distributor_pickup_events','distributor_pickups','settlement_candidates','consignment_movements','vendor_bills','vendor_bill_variances','accounting_reconciliation','checkout_estimates','checkout_reviews','organization_merge_audits','quotes','quote_revisions','quote_acceptances','quote_acceptance_evidence','orders','order_items','purchase_orders','po_communications','po_receipts','lots','inventory_lots','stock_movements','lot_tracking','shipments','invoices','payments','ar_payments','settlement_payments','returns','rmas','audit_log','documents','tax_certificates','tax_certificate_versions','vendor_evidence','compliance_events','recall_cases','shopify_history_rows']);
export function deletionAllowed(table,row,holds=[],now=new Date()){
 if(holds.some(h=>h.status==='active'&&(h.table===table||h.table==='*')&&(!h.record_id||h.record_id===row?.id)))return {ok:false,reason:'legal_hold_active'};
 if(row?.legal_hold===true)return {ok:false,reason:'legal_hold_active'};
 if(!RETAINED_TABLES.has(table))return {ok:true};
 const created=row?.created_at||row?.uploaded_at||row?.imported_at||row?.placed_at;
 if(!created||!Number.isFinite(Date.parse(created)))return {ok:false,reason:'retention_date_required'};
 const until=new Date(created);until.setUTCFullYear(until.getUTCFullYear()+3);
 if(row.retention_until&&Date.parse(row.retention_until)>until.getTime())until.setTime(Date.parse(row.retention_until));
 return now.getTime()>=until.getTime()?{ok:true}:{ok:false,reason:'retention_period_active',retain_until:until.toISOString()};
}
