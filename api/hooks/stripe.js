/** Durable Stripe payment webhook for authoritative customer orders. */
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { readRawBody, sendJson, verifyStripeSignature, logEvent } from '../_lib/http.js';
import {
  orderPaymentFromStripeEvent,
  planOrderPaymentApplication,
  releasePaidOrder,
} from '../_lib/orderLifecycle.js';
import { createOrderLabel } from '../_lib/orderShipping.js';

async function getRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id)} AND deleted=false LIMIT 1`;
  return rows[0]?.data || null;
}
async function findRow(sql, table, field, value) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND deleted=false AND data->>${field}=${String(value)} LIMIT 1`;
  return rows[0]?.data || null;
}
async function upsert(sql, table, row) {
  await sql`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
    VALUES (${table},${String(row.id)},${JSON.stringify(row)}::jsonb,false,now())
    ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'method_not_allowed' });
  if (!process.env.DATABASE_URL) return sendJson(res, 503, { error: 'database_not_configured' });

  const raw = await readRawBody(req);
  const payload = raw.toString('utf8');
  const check = verifyStripeSignature({
    header: req.headers['stripe-signature'],
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  if (!check.ok) {
    logEvent('hooks.stripe', 'rejected', { reason: check.reason });
    return sendJson(res, 400, { error: 'signature_verification_failed', reason: check.reason });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return sendJson(res, 400, { error: 'invalid_json' });
  }
  if (!event?.id || !event?.type) return sendJson(res, 400, { error: 'invalid_event' });

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS um_rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY (tbl,id))`;
    const providerEventId = `stripe:${event.id}`;
    const existing = await getRow(sql, 'provider_events', providerEventId);
    if (existing?.status === 'applied' || existing?.status === 'ignored') {
      return sendJson(res, 200, { received: true, duplicate: true, status: existing.status });
    }

    const parsed = orderPaymentFromStripeEvent(event);
    if (!parsed.ok) {
      await upsert(sql, 'provider_events', {
        id: providerEventId, provider: 'stripe', provider_event_id: event.id,
        event_type: event.type, provider_object_id: event.data?.object?.id || null,
        status: parsed.reason === 'event_not_paid' ? 'ignored' : 'unmatched',
        reason: parsed.reason, received_at: new Date().toISOString(),
      });
      logEvent('hooks.stripe', 'recorded_nonpayment', { type: event.type, id: event.id, reason: parsed.reason });
      return sendJson(res, 200, { received: true, status: parsed.reason === 'event_not_paid' ? 'ignored' : 'unmatched' });
    }

    const existingIdentity = await getRow(sql, 'provider_payment_identities', parsed.canonical_payment_id);
    if (existingIdentity?.status === 'applied') {
      await upsert(sql, 'provider_events', {
        id: providerEventId, provider: 'stripe', provider_event_id: event.id,
        event_type: event.type, provider_object_id: parsed.provider_object_id,
        canonical_payment_id: parsed.canonical_payment_id,
        order_id: parsed.order_id, amount: parsed.amount, currency: parsed.currency,
        status: 'duplicate_payment', duplicate_of: existingIdentity.first_event_id,
        received_at: new Date().toISOString(),
      });
      return sendJson(res, 200, { received: true, duplicate: true, status: 'duplicate_payment' });
    }

    const order = await getRow(sql, 'orders', parsed.order_id);
    if (!order) {
      await upsert(sql, 'provider_events', {
        id: providerEventId, provider: 'stripe', provider_event_id: event.id,
        event_type: event.type, provider_object_id: parsed.provider_object_id,
        order_id: parsed.order_id, amount: parsed.amount, currency: parsed.currency,
        status: 'unmatched', reason: 'order_not_found', received_at: new Date().toISOString(),
      });
      return sendJson(res, 200, { received: true, status: 'unmatched' });
    }
    if (String(parsed.currency).toLowerCase() !== 'usd') return sendJson(res, 400, { error: 'unsupported_currency' });
    const applied = planOrderPaymentApplication({ order, payment: parsed });
    if (!applied.ok) return sendJson(res, 409, { error: applied.reason });
    const nonce = crypto.randomBytes(16).toString('hex');
    const eventRow = {
      id: providerEventId, provider: 'stripe', provider_event_id: event.id,
      event_type: event.type, provider_object_id: parsed.provider_object_id,
      canonical_payment_id: parsed.canonical_payment_id,
      order_id: order.id, amount: parsed.amount, currency: parsed.currency,
      status: 'processing', processing_nonce: nonce, received_at: new Date().toISOString(),
    };
    const identityRow = {
      id: parsed.canonical_payment_id, provider: 'stripe', order_id: order.id,
      amount: parsed.amount, currency: parsed.currency,
      payment_intent_id: parsed.payment_intent_id,
      first_event_id: event.id, status: 'processing', processing_nonce: nonce,
      created_at: eventRow.received_at,
    };
    const invoice = await findRow(sql, 'invoices', 'order_id', order.id);
    const paymentRequest = await findRow(sql, 'payment_requests', 'order_id', order.id);
    const updatedInvoice = invoice ? {
      ...invoice,
      status: applied.order.payment_status === 'paid' ? 'paid' : invoice.status,
      paid_at: applied.order.payment_status === 'paid' ? applied.order.paid_at : invoice.paid_at || null,
      balance: Math.max(0, Number(order.total || 0) - Number(applied.order.paid_amount || 0)),
      stripe_payment_intent_id: parsed.payment_intent_id,
    } : null;
    const updatedRequest = paymentRequest ? {
      ...paymentRequest,
      status: applied.order.payment_status === 'paid' ? 'paid' : 'partial',
      paid_amount: applied.order.paid_amount,
      paid_at: applied.order.paid_at,
      provider_event_id: event.id,
    } : null;
    const audit = {
      id: `aud_${crypto.createHash('sha256').update(providerEventId).digest('hex').slice(0, 20)}`,
      kind: 'order.payment_recorded', ref_id: order.id, actor_id: 'stripe_webhook',
      payload: { event_id: event.id, amount: parsed.amount, payment_status: applied.order.payment_status },
      created_at: applied.payment.received_at,
    };
    const results = await sql.transaction((txn) => [
      txn`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('provider_payment_identities',${identityRow.id},${JSON.stringify(identityRow)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO NOTHING RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        VALUES ('provider_events',${eventRow.id},${JSON.stringify(eventRow)}::jsonb,false,now())
        ON CONFLICT (tbl,id) DO UPDATE SET data=EXCLUDED.data,deleted=false,updated_at=now()
        WHERE um_rows.data->>'status' NOT IN ('applied','ignored','duplicate_payment') RETURNING id`,
      txn`UPDATE um_rows SET data=${JSON.stringify(applied.order)}::jsonb,updated_at=now()
        WHERE tbl='orders' AND id=${order.id} AND deleted=false
          AND COALESCE(data->>'last_payment_reference','')<>${parsed.canonical_payment_id}
          AND COALESCE((data->>'paid_amount')::numeric,0)=${Number(order.paid_amount || 0)}
          AND EXISTS (SELECT 1 FROM um_rows e WHERE e.tbl='provider_events' AND e.id=${eventRow.id} AND e.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='provider_payment_identities' AND i.id=${identityRow.id} AND i.data->>'processing_nonce'=${nonce})
        RETURNING id`,
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'payments',${applied.payment.id},${JSON.stringify(applied.payment)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows e WHERE e.tbl='provider_events' AND e.id=${eventRow.id} AND e.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='provider_payment_identities' AND i.id=${identityRow.id} AND i.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'last_payment_reference'=${parsed.canonical_payment_id})
        ON CONFLICT (tbl,id) DO NOTHING`,
      ...(updatedInvoice ? [txn`UPDATE um_rows SET data=${JSON.stringify(updatedInvoice)}::jsonb,updated_at=now()
        WHERE tbl='invoices' AND id=${updatedInvoice.id} AND deleted=false
          AND EXISTS (SELECT 1 FROM um_rows e WHERE e.tbl='provider_events' AND e.id=${eventRow.id} AND e.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='provider_payment_identities' AND i.id=${identityRow.id} AND i.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'last_payment_reference'=${parsed.canonical_payment_id})`] : []),
      ...(updatedRequest ? [txn`UPDATE um_rows SET data=${JSON.stringify(updatedRequest)}::jsonb,updated_at=now()
        WHERE tbl='payment_requests' AND id=${updatedRequest.id} AND deleted=false
          AND EXISTS (SELECT 1 FROM um_rows e WHERE e.tbl='provider_events' AND e.id=${eventRow.id} AND e.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='provider_payment_identities' AND i.id=${identityRow.id} AND i.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'last_payment_reference'=${parsed.canonical_payment_id})`] : []),
      txn`INSERT INTO um_rows (tbl,id,data,deleted,updated_at)
        SELECT 'audit_log',${audit.id},${JSON.stringify(audit)}::jsonb,false,now()
        WHERE EXISTS (SELECT 1 FROM um_rows e WHERE e.tbl='provider_events' AND e.id=${eventRow.id} AND e.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows i WHERE i.tbl='provider_payment_identities' AND i.id=${identityRow.id} AND i.data->>'processing_nonce'=${nonce})
          AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'last_payment_reference'=${parsed.canonical_payment_id})
        ON CONFLICT (tbl,id) DO NOTHING`,
      txn`UPDATE um_rows SET data=data || ${JSON.stringify({ status: 'applied', applied_at: new Date().toISOString() })}::jsonb,updated_at=now()
        WHERE tbl='provider_payment_identities' AND id=${identityRow.id} AND data->>'processing_nonce'=${nonce}
          AND EXISTS (SELECT 1 FROM um_rows o WHERE o.tbl='orders' AND o.id=${order.id} AND o.data->>'last_payment_reference'=${parsed.canonical_payment_id})`,
    ]);
    if (!results[1]?.length) {
      const winner = await getRow(sql, 'provider_payment_identities', identityRow.id);
      await upsert(sql, 'provider_events', {
        ...eventRow, status: 'duplicate_payment', duplicate_of: winner?.first_event_id || null,
        applied_at: new Date().toISOString(),
      });
      return sendJson(res, 200, { received: true, duplicate: true, status: 'duplicate_payment' });
    }
    if (!results[3]?.length) {
      await sql`DELETE FROM um_rows WHERE tbl='provider_payment_identities' AND id=${identityRow.id} AND data->>'processing_nonce'=${nonce}`;
      await upsert(sql, 'provider_events', { ...eventRow, status: 'conflict', reason: 'order_payment_conflict' });
      return sendJson(res, 409, { error: 'order_payment_conflict' });
    }

    let release = null;
    let label = null;
    if (applied.order.payment_status === 'paid') {
      release = await releasePaidOrder(sql, order.id, { actorId: 'stripe_webhook' });
      if (!release.ok) {
        await upsert(sql, 'tasks', {
          id: `task_paid_allocation_${order.id}`, kind: 'paid_order_allocation_exception',
          subject: `Paid order allocation exception · ${order.id}`,
          owner_email: 'ops@unitemedical.net', status: 'open', ref_type: 'order', ref_id: order.id,
          payload: { reason: release.reason, sku: release.sku || null }, created_at: new Date().toISOString(),
        });
      } else if (release.order?.distributor_flow === 'blind_ship') {
        await upsert(sql, 'tasks', {
          id: `task_distributor_prepare_${order.id}`, kind: 'distributor_blind_order_prepare',
          subject: `Prepare distributor order · ${order.id}`,
          owner_email: 'warehouse@unitemedical.net', status: 'open', ref_type: 'order', ref_id: order.id,
          payload: { fulfillment_mode: release.order.fulfillment_mode, carrier_name: release.order.carrier_name },
          created_at: new Date().toISOString(),
        });
      } else {
        label = await createOrderLabel(sql, order.id, { actorId: 'stripe_webhook' });
        if (!label.ok) {
          await upsert(sql, 'tasks', {
            id: `task_label_${order.id}`, kind: 'order_label_required',
            subject: `Create or reconcile label · ${order.id}`,
            owner_email: 'ops@unitemedical.net', status: 'open', ref_type: 'order', ref_id: order.id,
            payload: { reason: label.reason }, created_at: new Date().toISOString(),
          });
        }
      }
    }
    await upsert(sql, 'provider_events', {
      ...eventRow,
      status: 'applied', applied_at: new Date().toISOString(),
      release_status: release ? (release.ok ? 'inventory_reserved' : release.reason) : 'partial_payment',
      label_status: label ? (label.ok ? 'label_created' : label.reason) : null,
    });
    logEvent('hooks.stripe', 'applied', { type: event.type, id: event.id, order_id: order.id, release: release?.ok || false });
    return sendJson(res, 200, {
      received: true, status: 'applied', order_id: order.id,
      inventory_released: Boolean(release?.ok), label_created: Boolean(label?.ok),
    });
  } catch (error) {
    logEvent('hooks.stripe', 'error', { type: event.type, id: event.id, error: error.message });
    return sendJson(res, 500, { error: 'stripe_event_persistence_failed' });
  }
}
