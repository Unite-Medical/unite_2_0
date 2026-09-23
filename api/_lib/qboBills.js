import crypto from 'node:crypto';
import { SERVICES } from './services.js';

function money(value) { return +Number(value || 0).toFixed(2); }
function qboDocumentNumber(vendorBill) {
  return `UM-${crypto.createHash('sha256').update(String(vendorBill?.id || '')).digest('hex').slice(0, 16).toUpperCase()}`;
}

export function buildQboApprovedBill({ po, vendor_bill, match, inventory_account_id = process.env.QBO_INVENTORY_ASSET_ACCOUNT_ID }) {
  if (!po?.vendor_qbo_id) throw new Error('vendor_qbo_id_required');
  const lines = (match?.lines || []).filter((line) => Number(line.approved_qty || 0) > 0).map((approved, index) => {
    const poLine = (po.line_items || []).find((line) => line.sku === approved.sku) || {};
    const amount = money(Number(approved.approved_qty) * Number(approved.approved_unit_cost));
    const base = {
      Id: String(index + 1),
      Amount: amount,
      Description: `${approved.sku} · ${approved.approved_qty} accepted unit(s) from ${po.id}`,
      DetailType: poLine.qbo_item_id ? 'ItemBasedExpenseLineDetail' : 'AccountBasedExpenseLineDetail',
    };
    if (poLine.qbo_item_id) {
      base.ItemBasedExpenseLineDetail = {
        ItemRef: { value: String(poLine.qbo_item_id) },
        Qty: Number(approved.approved_qty),
        UnitPrice: Number(approved.approved_unit_cost),
        BillableStatus: 'NotBillable',
      };
    } else {
      if (!inventory_account_id) throw new Error('qbo_inventory_account_id_required');
      base.AccountBasedExpenseLineDetail = {
        AccountRef: { value: String(inventory_account_id) },
        BillableStatus: 'NotBillable',
      };
    }
    return base;
  });
  if (!lines.length) throw new Error('no_approved_bill_lines');
  return {
    VendorRef: { value: String(po.vendor_qbo_id) },
    DocNumber: qboDocumentNumber(vendor_bill),
    TxnDate: vendor_bill.invoice_date || new Date().toISOString().slice(0, 10),
    PrivateNote: `Unite AP approval ${vendor_bill.id} · vendor invoice ${vendor_bill.vendor_invoice_number} · source PO ${po.id}`,
    Line: lines,
  };
}

function billResult(bill, body, args, reconciled) {
  return {
    ok: true,
    reconciled,
    qbo_bill_id: bill.Id,
    qbo_sync_token: bill.SyncToken || null,
    amount: Number(bill.TotalAmt || args.match.approved_amount || 0),
    payload: body,
  };
}

export async function postQboApprovedBill(args, {
  service = SERVICES.qbo,
  fetchImpl = fetch,
} = {}) {
  const body = buildQboApprovedBill(args);
  if (!service.configured()) return { ok: false, reason: 'qbo_not_configured' };
  let headers;
  try {
    headers = await service.headers();
  } catch (error) {
    return { ok: false, reason: 'qbo_auth_failed', detail: error.message };
  }
  const escapedDocumentNumber = body.DocNumber.replaceAll("'", "''");
  const query = `select * from Bill where DocNumber = '${escapedDocumentNumber}' maxresults 1`;
  try {
    const lookupResponse = await fetchImpl(service.buildUrl('/query', { q: query }), {
      method: 'GET', headers,
    });
    const lookupPayload = await lookupResponse.json().catch(() => ({}));
    if (!lookupResponse.ok) {
      return { ok: false, reason: 'qbo_lookup_failed', status: lookupResponse.status, detail: lookupPayload.Fault || lookupPayload };
    }
    const found = lookupPayload.QueryResponse?.Bill;
    const existing = Array.isArray(found) ? found[0] : found;
    if (existing?.Id) return billResult(existing, body, args, true);
  } catch (error) {
    return { ok: false, reason: 'qbo_lookup_unreachable', detail: error.message };
  }

  try {
    const response = await fetchImpl(service.buildUrl('/bill', {}), {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, reason: 'qbo_bill_failed', status: response.status, detail: payload.Fault || payload };
    }
    if (!payload.Bill?.Id) {
      return { ok: false, reason: 'qbo_outcome_unknown', status: response.status, detail: payload };
    }
    return billResult(payload.Bill, body, args, false);
  } catch (error) {
    return { ok: false, reason: 'qbo_outcome_unknown', detail: error.message };
  }
}
