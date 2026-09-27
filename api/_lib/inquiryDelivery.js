import { Resend } from 'resend';
export async function deliverInquiryNotification(sql, inquiryId, { apiKey = process.env.RESEND_API_KEY } = {}) {
  if (!apiKey) return { status: 'queued', reason: 'email_not_configured' };
  const claimed = await sql`UPDATE um_rows SET data=data || '{"status":"sending"}'::jsonb,updated_at=now()
    WHERE tbl='inquiry_notifications' AND data->>'ref_id'=${inquiryId} AND deleted=false AND data->>'status'='queued' RETURNING data`;
  if (!claimed.length) {
    const current = await sql`SELECT data->>'status' AS status FROM um_rows WHERE tbl='inquiry_notifications' AND data->>'ref_id'=${inquiryId} AND deleted=false LIMIT 1`;
    return {status:current[0]?.status || 'not_queued'};
  }
  const row=claimed[0].data;
  try {
    const client=new Resend(apiKey);
    const result=await client.emails.send({from:process.env.UNITE_INQUIRY_FROM||'Unite Medical <support@unitemedical.net>',to:row.to_address,subject:row.subject,text:row.body}, {idempotencyKey:row.idempotency_key});
    const next=result.error?{status:'delivery_failed',last_error:result.error.name||'provider_rejected'}:{status:'provider_accepted',provider_message_id:result.data?.id,last_error:null,sent_at:new Date().toISOString()};
    await sql`UPDATE um_rows SET data=data || ${JSON.stringify(next)}::jsonb,updated_at=now() WHERE tbl='inquiry_notifications' AND id=${row.id} AND deleted=false`;
    return next;
  }catch{
    // Do not blindly retry an uncertain send after the provider idempotency window.
    await sql`UPDATE um_rows SET data=data || '{"status":"delivery_unknown","last_error":"verify_provider_before_retry"}'::jsonb,updated_at=now() WHERE tbl='inquiry_notifications' AND id=${row.id} AND deleted=false`;
    return {status:'delivery_unknown'};
  }
}
