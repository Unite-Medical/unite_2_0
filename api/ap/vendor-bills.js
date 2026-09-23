import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { authorizeLiveProfile, sessionFromRequest } from '../_lib/auth.js';
import { logEvent, readRawBody, sendJson } from '../_lib/http.js';
import {
  aggregateVendorBillLines,
  matchVendorBill,
  applyApprovedBillQuantities,
} from '../../src/lib/vendorBills.js';
import { buildQboApprovedBill, postQboApprovedBill } from '../_lib/qboBills.js';

function stableId(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20)}`;
}
function billId(poId, invoiceNumber) {
  return stableId('vbill', `${poId}:${String(invoiceNumber).trim().toLowerCase()}`);
}
function submissionHash(poId, body) {
  const normalized = {
    po_id: poId,
    vendor_invoice_number: String(body.vendor_invoice_number || '').trim().toLowerCase(),
    invoice_date: body.invoice_date || null,
    lines: aggregateVendorBillLines(body.lines || []).sort((a, b) => a.sku.localeCompare(b.sku)),
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
async function getRow(sql, table, rowId) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(rowId)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}
async function settlementEvidence(sql, po) {
  if (po?.po_type !== 'consignment_settlement') return [];
  const rows = await sql`SELECT data FROM um_rows WHERE tbl='consignment_movements' AND deleted=false
    AND data->>'settlement_po_id'=${po.id}`;
  return rows.map((row) => row.data);
}
async function resolveVendorIdentity(sql, po) {
  if (po.vendor_qbo_id) return po;
  let qboId = null;
  if (po.vendor_id) {
    const vendor = await getRow(sql, 'vendors', po.vendor_id);
    qboId = vendor?.qbo_vendor_id || vendor?.qbo_id || null;
  }
  if (!qboId && po.owner_org_id) {
    const owner = await getRow(sql, 'organizations', po.owner_org_id);
    qboId = owner?.qbo_vendor_id || owner?.qbo_id || null;
  }
  if (!qboId && po.vendor_name) {
    const rows = await sql`SELECT data FROM um_rows WHERE tbl='vendors' AND deleted=false AND lower(data->>'name')=${String(po.vendor_name).toLowerCase()} LIMIT 1`;
    qboId = rows[0]?.data?.qbo_vendor_id || rows[0]?.data?.qbo_id || null;
  }
  return qboId ? { ...po, vendor_qbo_id: qboId } : po;
}
function safeBill(row) {
  return {
    id: row.id,
    po_id: row.po_id,
    vendor_id: row.vendor_id || null,
    vendor_name: row.vendor_name || null,
    vendor_invoice_number: row.vendor_invoice_number,
    invoice_date: row.invoice_date,
    status: row.status,
    lines: row.lines || [],
    match: row.match || null,
    approved_amount: row.match?.approved_amount || row.approved_amount || 0,
    held_amount: row.match?.held_amount || row.held_amount || 0,
    accounting_bill_id: row.qbo_bill_id || null,
    accounting_error: row.qbo_error || null,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at || null,
  };
}
function safePurchaseOrder(row) {
  return {
    id: row.id,
    po_type: row.po_type || 'inventory',
    vendor_id: row.vendor_id || row.owner_org_id || null,
    vendor_name: row.vendor_name || null,
    status: row.status,
    currency: row.currency || row.settlement_currency || 'USD',
    total_cost: Number(row.total_cost || 0),
    paid_amount: Number(row.paid_amount || 0),
    ap_locked: Boolean(row.ap_posting_lock),
    line_items: (row.line_items || []).map((line) => ({
      sku: line.sku,
      name: line.name || line.sku,
      qty: Number(line.qty || 0),
      cost: Number(line.cost || 0),
      accepted_qty: Number(line.accepted_qty ?? line.received_qty ?? (row.po_type === 'consignment_settlement' ? line.qty : 0)),
      billed_qty: Number(line.billed_qty || 0),
      billable_qty: Number(line.billable_qty ?? Math.max(0, Number(line.accepted_qty ?? line.received_qty ?? 0) - Number(line.billed_qty || 0))),
    })),
  };
}
function knownNoWriteFailure(reason) {
  return ['qbo_not_configured', 'qbo_auth_failed', 'qbo_lookup_failed', 'qbo_lookup_unreachable', 'qbo_bill_failed'].includes(reason);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const session = sessionFromRequest(req);
  if (!session) return sendJson(res, 401, { error: 'authentication_required' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'not_configured' });
  const sql = neon(process.env.DATABASE_URL);

  try {
    const profile = await getRow(sql, 'profiles', session.user_id);
    const live = authorizeLiveProfile(session, profile, { roles: ['admin', 'finance'] });
    if (!live.ok) {
      return sendJson(res, 403, { error: live.reason });
    }
    if (req.method === 'GET') {
      const [billRows, poRows, intakeRows] = await Promise.all([
        sql`SELECT data FROM um_rows WHERE tbl='vendor_bills' AND deleted=false ORDER BY updated_at DESC LIMIT 200`,
        sql`SELECT data FROM um_rows WHERE tbl='purchase_orders' AND deleted=false
          AND (data->>'status' IN ('partial','received') OR data->>'po_type'='consignment_settlement')
          ORDER BY updated_at DESC LIMIT 200`,
        sql`SELECT data FROM um_rows WHERE tbl='ap_intake_queue' AND deleted=false ORDER BY updated_at DESC LIMIT 200`,
      ]);
      return sendJson(res, 200, {
        vendor_bills: billRows.map((row) => safeBill(row.data)),
        purchase_orders: poRows.map((row) => safePurchaseOrder(row.data)),
        ap_intake: intakeRows.map((row) => ({
          id: row.data.id,
          kind: row.data.kind || 'purchase_order',
          status: row.data.status,
          po_id: row.data.po_id || null,
          shipment_id: row.data.shipment_id || null,
          expected_total: Number(row.data.expected_total || 0),
          created_at: row.data.created_at,
        })),
      });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
    const raw = await readRawBody(req);
    const body = JSON.parse(raw.toString('utf8') || '{}');

    if (body.action === 'submit') {
      if (!body.po_id || !String(body.vendor_invoice_number || '').trim()) return sendJson(res, 400, { error: 'po_and_invoice_required' });
      if (!Array.isArray(body.lines) || !body.lines.length) return sendJson(res, 400, { error: 'vendor_bill_lines_required' });
      const po = await getRow(sql, 'purchase_orders', body.po_id);
      if (!po) return sendJson(res, 404, { error: 'po_not_found' });
      const match = matchVendorBill(po, {
        vendor_bill_lines: body.lines,
        settlement_movements: await settlementEvidence(sql, po),
      });
      if (!match.ok) return sendJson(res, 400, { error: match.reason, line_index: match.line_index });
      const rowId = billId(po.id, body.vendor_invoice_number);
      const hash = submissionHash(po.id, body);
      const now = new Date().toISOString();
      const vendorBill = {
        id: rowId,
        po_id: po.id,
        vendor_id: po.vendor_id || po.owner_org_id || null,
        vendor_name: po.vendor_name || null,
        vendor_invoice_number: String(body.vendor_invoice_number).trim(),
        invoice_date: body.invoice_date || now.slice(0, 10),
        lines: body.lines,
        submission_hash: hash,
        match,
        status: match.held_amount > 0 ? 'variance_review' : 'matched',
        submitted_by: session.user_id,
        submitted_at: now,
        updated_at: now,
        qbo_bill_id: null,
        qbo_sync_token: null,
      };
      const variances = [
        ...match.lines.filter((line) => line.held_amount > 0).map((line) => ({
          sku: line.sku,
          amount: line.held_amount,
          reason: line.price_variance_amount > 0 ? 'price_or_quantity_variance' : 'quantity_variance',
        })),
        ...match.unexpected_lines.map((line) => ({ sku: line.sku, amount: line.held_amount, reason: line.reason })),
      ].map((variance) => ({
        id: stableId('vbvar', `${rowId}:${variance.sku}:${variance.reason}`),
        vendor_bill_id: rowId,
        po_id: po.id,
        ...variance,
        status: 'open',
        created_at: now,
      }));
      const results = await sql.transaction((txn) => [
        txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          VALUES ('vendor_bills',${vendorBill.id},${JSON.stringify(vendorBill)}::jsonb,false,now())
          ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
        ...variances.map((variance) => txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
          SELECT 'vendor_bill_variances',${variance.id},${JSON.stringify(variance)}::jsonb,false,now()
          WHERE EXISTS (SELECT 1 FROM um_rows b WHERE b.tbl='vendor_bills' AND b.id=${rowId} AND b.data->>'submission_hash'=${hash})
          ON CONFLICT (tbl,id) DO NOTHING`),
      ]);
      if (!results[0]?.length) {
        const existing = await getRow(sql, 'vendor_bills', rowId);
        if (existing?.submission_hash !== hash) return sendJson(res, 409, { error: 'invoice_key_reused_with_different_payload' });
        return sendJson(res, 200, { ok: true, duplicate: true, vendor_bill: safeBill(existing), match: existing.match });
      }
      return sendJson(res, 201, { ok: true, vendor_bill: safeBill(vendorBill), match });
    }

    if (body.action === 'approve') {
      let vendorBill = await getRow(sql, 'vendor_bills', body.vendor_bill_id);
      if (!vendorBill) return sendJson(res, 404, { error: 'vendor_bill_not_found' });
      if (vendorBill.qbo_bill_id) return sendJson(res, 200, { ok: true, duplicate: true, vendor_bill: safeBill(vendorBill), match: vendorBill.match });
      let po = await getRow(sql, 'purchase_orders', vendorBill.po_id);
      if (!po) return sendJson(res, 404, { error: 'po_not_found' });
      po = await resolveVendorIdentity(sql, po);
      const match = matchVendorBill(po, {
        vendor_bill_lines: vendorBill.lines,
        settlement_movements: await settlementEvidence(sql, po),
      });
      if (!match.ok) return sendJson(res, 400, { error: match.reason });
      if (!(match.approved_amount > 0)) return sendJson(res, 400, { error: 'nothing_approved' });

      // Preflight every required QBO field before acquiring the shared PO lock.
      try {
        buildQboApprovedBill({
          po,
          vendor_bill: vendorBill,
          match,
          inventory_account_id: process.env.QBO_INVENTORY_ASSET_ACCOUNT_ID,
        });
      } catch (error) {
        return sendJson(res, 400, { error: error.message });
      }

      const currentLock = po.ap_posting_lock || null;
      const lockAge = currentLock?.started_at ? Date.now() - new Date(currentLock.started_at).getTime() : 0;
      let postingNonce = currentLock?.vendor_bill_id === vendorBill.id ? currentLock.nonce : null;
      let ownsLock = false;
      if (!postingNonce) {
        postingNonce = crypto.randomBytes(12).toString('hex');
        const postingStartedAt = new Date().toISOString();
        const lock = { vendor_bill_id: vendorBill.id, nonce: postingNonce, started_at: postingStartedAt };
        const posting = {
          ...vendorBill,
          status: 'posting_to_qbo',
          posting_nonce: postingNonce,
          posting_started_at: postingStartedAt,
          match,
          updated_at: postingStartedAt,
        };
        const lockResults = await sql.transaction((txn) => [
          txn`UPDATE um_rows SET data=jsonb_set(data,'{ap_posting_lock}',${JSON.stringify(lock)}::jsonb),updated_at=now()
            WHERE tbl='purchase_orders' AND id=${po.id} AND deleted=false
              AND (data->'ap_posting_lock' IS NULL OR data->'ap_posting_lock'='null'::jsonb)
            RETURNING id`,
          txn`UPDATE um_rows SET data=${JSON.stringify(posting)}::jsonb,updated_at=now()
            WHERE tbl='vendor_bills' AND id=${vendorBill.id} AND deleted=false
              AND COALESCE(data->>'status','') NOT IN ('posting_to_qbo','approved','approved_short_pay','reconciliation_required')
              AND EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='purchase_orders' AND p.id=${po.id}
                AND p.data->'ap_posting_lock'->>'nonce'=${postingNonce})
            RETURNING id`,
        ]);
        ownsLock = Boolean(lockResults[0]?.length && lockResults[1]?.length);
        if (!ownsLock && lockResults[0]?.length) {
          await sql`UPDATE um_rows SET data=jsonb_set(data,'{ap_posting_lock}','null'::jsonb),updated_at=now()
            WHERE tbl='purchase_orders' AND id=${po.id} AND data->'ap_posting_lock'->>'nonce'=${postingNonce}`;
        }
        if (ownsLock) vendorBill = posting;
      } else if (vendorBill.status === 'reconciliation_required' || (vendorBill.status === 'posting_to_qbo' && lockAge > 300000)) {
        ownsLock = true;
        vendorBill = { ...vendorBill, status: 'reconciliation_required', posting_nonce: postingNonce, match };
      }
      if (!ownsLock) {
        const latestPo = await getRow(sql, 'purchase_orders', po.id);
        const latestBill = await getRow(sql, 'vendor_bills', vendorBill.id);
        if (latestPo?.ap_posting_lock?.vendor_bill_id !== vendorBill.id) {
          return sendJson(res, 409, { error: 'purchase_order_ap_locked', vendor_bill_id: latestPo?.ap_posting_lock?.vendor_bill_id || null });
        }
        return sendJson(res, 409, { error: latestBill?.status === 'posting_to_qbo' ? 'vendor_bill_already_processing' : 'vendor_bill_reconciliation_required' });
      }

      const qboResult = await postQboApprovedBill({
        po,
        vendor_bill: vendorBill,
        match,
        inventory_account_id: process.env.QBO_INVENTORY_ASSET_ACCOUNT_ID,
      });
      if (!qboResult.ok) {
        if (knownNoWriteFailure(qboResult.reason)) {
          const releasedBill = {
            ...vendorBill,
            status: match.held_amount > 0 ? 'variance_review' : 'matched',
            posting_nonce: null,
            qbo_error: qboResult,
            updated_at: new Date().toISOString(),
          };
          await sql.transaction((txn) => [
            txn`UPDATE um_rows SET data=jsonb_set(data,'{ap_posting_lock}','null'::jsonb),updated_at=now()
              WHERE tbl='purchase_orders' AND id=${po.id} AND data->'ap_posting_lock'->>'nonce'=${postingNonce}`,
            txn`UPDATE um_rows SET data=${JSON.stringify(releasedBill)}::jsonb,updated_at=now()
              WHERE tbl='vendor_bills' AND id=${vendorBill.id} AND data->>'posting_nonce'=${postingNonce}`,
          ]);
          return sendJson(res, 502, { error: qboResult.reason, detail: qboResult.detail || null });
        }
        const reconciliation = {
          ...vendorBill,
          status: 'reconciliation_required',
          posting_nonce: postingNonce,
          qbo_error: qboResult,
          updated_at: new Date().toISOString(),
        };
        await sql`UPDATE um_rows SET data=${JSON.stringify(reconciliation)}::jsonb,updated_at=now()
          WHERE tbl='vendor_bills' AND id=${vendorBill.id} AND data->>'posting_nonce'=${postingNonce}`;
        return sendJson(res, 202, { ok: false, error: 'qbo_reconciliation_required', vendor_bill: safeBill(reconciliation) });
      }

      const now = new Date().toISOString();
      const updatedPo = {
        ...applyApprovedBillQuantities(po, match),
        vendor_qbo_id: po.vendor_qbo_id,
        last_vendor_bill_id: vendorBill.id,
        ap_posting_lock: null,
        ap_commit_nonce: postingNonce,
        updated_at: now,
      };
      const approved = {
        ...vendorBill,
        status: match.held_amount > 0 ? 'approved_short_pay' : 'approved',
        posting_nonce: null,
        qbo_bill_id: qboResult.qbo_bill_id,
        qbo_sync_token: qboResult.qbo_sync_token,
        qbo_reconciled: Boolean(qboResult.reconciled),
        qbo_error: null,
        approved_by: session.user_id,
        approved_at: now,
        approved_amount: match.approved_amount,
        held_amount: match.held_amount,
        match,
        updated_at: now,
      };
      const approval = {
        id: stableId('vbapp', vendorBill.id),
        vendor_bill_id: vendorBill.id,
        po_id: po.id,
        approved_by: session.user_id,
        approved_amount: match.approved_amount,
        held_amount: match.held_amount,
        qbo_bill_id: qboResult.qbo_bill_id,
        approved_at: now,
      };
      let committed;
      try {
        committed = await sql.transaction((txn) => [
          txn`UPDATE um_rows SET data=${JSON.stringify(updatedPo)}::jsonb,updated_at=now()
            WHERE tbl='purchase_orders' AND id=${po.id} AND deleted=false
              AND data->'ap_posting_lock'->>'nonce'=${postingNonce}
              AND COALESCE((data->>'receiving_revision')::int,0)=${Number(po.receiving_revision || 0)}
              AND EXISTS (SELECT 1 FROM um_rows b WHERE b.tbl='vendor_bills' AND b.id=${vendorBill.id}
                AND b.data->>'posting_nonce'=${postingNonce})
            RETURNING id`,
          txn`UPDATE um_rows SET data=${JSON.stringify(approved)}::jsonb,updated_at=now()
            WHERE tbl='vendor_bills' AND id=${vendorBill.id} AND deleted=false AND data->>'posting_nonce'=${postingNonce}
              AND EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='purchase_orders' AND p.id=${po.id}
                AND p.data->>'ap_commit_nonce'=${postingNonce})
            RETURNING id`,
          txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
            SELECT 'vendor_bill_approvals',${approval.id},${JSON.stringify(approval)}::jsonb,false,now()
            WHERE EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='purchase_orders' AND p.id=${po.id}
              AND p.data->>'ap_commit_nonce'=${postingNonce})
            ON CONFLICT (tbl,id) DO NOTHING
            RETURNING id`,
          txn`SELECT 1 / CASE WHEN
              EXISTS (SELECT 1 FROM um_rows p WHERE p.tbl='purchase_orders' AND p.id=${po.id} AND p.data->>'ap_commit_nonce'=${postingNonce})
              AND EXISTS (SELECT 1 FROM um_rows b WHERE b.tbl='vendor_bills' AND b.id=${vendorBill.id} AND b.data->>'qbo_bill_id'=${qboResult.qbo_bill_id})
              AND EXISTS (SELECT 1 FROM um_rows a WHERE a.tbl='vendor_bill_approvals' AND a.id=${approval.id})
            THEN 1 ELSE 0 END AS committed`,
        ]);
      } catch (error) {
        const reconciliation = {
          ...vendorBill,
          status: 'reconciliation_required',
          posting_nonce: postingNonce,
          qbo_error: { reason: 'local_commit_uncertain', detail: error.message },
          qbo_candidate_bill_id: qboResult.qbo_bill_id,
          updated_at: new Date().toISOString(),
        };
        await sql`UPDATE um_rows SET data=${JSON.stringify(reconciliation)}::jsonb,updated_at=now()
          WHERE tbl='vendor_bills' AND id=${vendorBill.id} AND data->>'posting_nonce'=${postingNonce}`;
        return sendJson(res, 202, { ok: false, error: 'qbo_reconciliation_required', qbo_bill_id: qboResult.qbo_bill_id });
      }
      if (!committed[0]?.length || !committed[1]?.length || !committed[3]?.length) {
        return sendJson(res, 202, { ok: false, error: 'qbo_reconciliation_required', qbo_bill_id: qboResult.qbo_bill_id });
      }
      logEvent('ap.vendor_bills', 'approved', {
        vendor_bill_id: vendorBill.id,
        qbo_bill_id: qboResult.qbo_bill_id,
        approved_amount: match.approved_amount,
        held_amount: match.held_amount,
      });
      return sendJson(res, 200, { ok: true, vendor_bill: safeBill(approved), match });
    }

    return sendJson(res, 400, { error: 'invalid_action' });
  } catch (error) {
    logEvent('ap.vendor_bills', 'error', { error: error.message });
    return sendJson(res, 500, { error: 'vendor_bill_failed' });
  }
}
