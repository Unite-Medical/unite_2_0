import crypto from 'node:crypto';

export function normalizePoDraft(input = {}) {
  const text = (v, n = 200) => String(v ?? '').trim().slice(0, n);
  const lines = input.line_items;
  if (!text(input.doc_number, 21) || text(input.doc_number, 21).length > 20) throw new Error('po_number_required_max_20_characters');
  if (!text(input.vendor_name)) throw new Error('vendor_name_required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.txn_date || '') || new Date(input.txn_date).toISOString().slice(0, 10) !== input.txn_date) throw new Error('valid_date_required');
  if (input.currency && input.currency !== 'USD') throw new Error('only_usd_po_transfers_supported');
  if (!Array.isArray(lines) || !lines.length || lines.length > 200) throw new Error('one_to_200_lines_required');
  const normalized = lines.map((line) => {
    if (line.qty == null || String(line.qty).trim() === '' || line.cost == null || String(line.cost).trim() === '') throw new Error('quantity_and_cost_required');
    const qty = Number(line.qty), cost = Number(line.cost);
    if (!text(line.sku) || !text(line.name) || !Number.isFinite(qty) || qty <= 0 || qty > 1e7 || !Number.isFinite(cost) || cost < 0 || cost > 1e7) throw new Error('valid_sku_description_quantity_and_cost_required');
    return { sku: text(line.sku), name: text(line.name, 1000), qty, cost, qbo_item_id: text(line.qbo_item_id, 80) || null, received_qty: 0, accepted_qty: 0 };
  });
  return { doc_number: text(input.doc_number, 20), vendor_name: text(input.vendor_name), vendor_qbo_id: text(input.vendor_qbo_id, 80) || null,
    txn_date: input.txn_date, currency: 'USD', line_items: normalized,
    total_cost: +normalized.reduce((sum, line) => sum + Math.round(line.qty * line.cost * 100) / 100, 0).toFixed(2),
    source_filename: text(input.source_filename), source_text: text(input.source_text, 60000) };
}

export function draftFromQboPo(po) {
  if (!po?.Id || po.SyncToken == null || po.POStatus !== 'Open') throw new Error('only_open_qbo_purchase_orders_supported');
  if (po.LinkedTxn?.length || po.Line?.some(line => line.LinkedTxn?.length)) throw new Error('linked_purchase_orders_must_be_updated_in_quickbooks');
  if ((po.CurrencyRef?.value || 'USD') !== 'USD' || po.TxnTaxDetail?.TotalTax || po.GlobalTaxCalculation === 'TaxInclusive') throw new Error('tax_or_foreign_currency_po_requires_manual_review_in_quickbooks');
  if (!po.Line?.length || po.Line.some(line => line.DetailType !== 'ItemBasedExpenseLineDetail')) throw new Error('only_item_based_purchase_orders_supported');
  const draft = normalizePoDraft({ doc_number: po.DocNumber, txn_date: po.TxnDate, vendor_name: po.VendorRef?.name || po.VendorRef?.value,
    vendor_qbo_id: po.VendorRef?.value, currency: po.CurrencyRef?.value || 'USD', line_items: po.Line.map(line => ({
      sku: line.ItemBasedExpenseLineDetail.ItemRef?.name || line.ItemBasedExpenseLineDetail.ItemRef?.value,
      name: line.Description || line.ItemBasedExpenseLineDetail.ItemRef?.name || 'QBO item',
      qbo_item_id: line.ItemBasedExpenseLineDetail.ItemRef?.value,
      qty: line.ItemBasedExpenseLineDetail.Qty, cost: line.ItemBasedExpenseLineDetail.UnitPrice,
    })) });
  if (Math.abs(draft.total_cost - Number(po.TotalAmt)) > 0.01) throw new Error('qbo_line_totals_do_not_match');
  return draft;
}

export function buildQboPo(draft, existing = null) {
  const po = normalizePoDraft(draft);
  if (!po.vendor_qbo_id || po.line_items.some(line => !line.qbo_item_id)) throw new Error('map_vendor_and_all_items_to_quickbooks_before_posting');
  if (existing) draftFromQboPo(existing);
  if (existing && (existing.Line.length !== po.line_items.length || existing.Line.some((line, i) => line.ItemBasedExpenseLineDetail.ItemRef.value !== po.line_items[i].qbo_item_id))) throw new Error('change_item_mapping_or_line_count_in_quickbooks_then_reload');
  return { ...(existing ? { Id: existing.Id, SyncToken: existing.SyncToken, sparse: true } : {}),
    DocNumber: po.doc_number, TxnDate: po.txn_date, VendorRef: { value: po.vendor_qbo_id },
    CurrencyRef: { value: 'USD' },
    Line: po.line_items.map((line, i) => ({ ...(existing?.Line[i] || {}),
      Amount: Math.round(line.qty * line.cost * 100) / 100, Description: line.name,
      DetailType: 'ItemBasedExpenseLineDetail', ItemBasedExpenseLineDetail: { ...(existing?.Line[i]?.ItemBasedExpenseLineDetail || {}), ItemRef: { value: line.qbo_item_id }, Qty: line.qty, UnitPrice: line.cost } })) };
}

export function poTransferId(...parts) { return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40); }

export async function qboPoRequest(context, entity, { query, body, requestId, fetchImpl = fetch } = {}) {
  if (!['query', 'purchaseorder'].includes(entity) && !/^purchaseorder\/\d+$/.test(entity)) throw new Error('invalid_qbo_route');
  const url = new URL(`https://${context.environment === 'production' ? '' : 'sandbox-'}quickbooks.api.intuit.com/v3/company/${encodeURIComponent(context.realmId)}/${entity}`);
  url.searchParams.set('minorversion', '75');
  if (query) url.searchParams.set('query', query);
  if (requestId) url.searchParams.set('requestid', requestId);
  const response = await fetchImpl(url, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${context.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.Fault) {
    const error = new Error('quickbooks_request_failed');
    error.status = response.status; error.tid = response.headers.get('intuit_tid');
    throw error;
  }
  return payload;
}
