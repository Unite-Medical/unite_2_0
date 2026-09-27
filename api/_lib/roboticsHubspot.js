// Durable CRM delivery. Inquiry storage and owner notification remain independent.
const PROPERTY_LABELS = {
  unite_program: 'Unite program',
  unite_robotics_inquiry: 'Robotics inquiry type',
  unite_robotics_model: 'Robotics instrument model',
  unite_robotics_volume: 'Robotics annual instrument volume',
  unite_robotics_reference: 'Unite robotics inquiry reference',
};
export function roboticsContactProperties(row) {
  return {
    unite_program: 'Restore Robotics',
    unite_robotics_inquiry: row.inquiry_type,
    unite_robotics_model: row.instrument_model || 'Not applicable',
    unite_robotics_volume: row.instrument_volume || 'Not applicable',
    unite_robotics_reference: row.id,
  };
}
export async function pushRoboticsContact(row, { token, fetcher = fetch } = {}) {
  if (!token) return { status: 'not_configured' };
  const signal = AbortSignal.timeout(20000);
  async function call(path, method = 'GET', body) {
    const response = await fetcher(`https://api.hubapi.com${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal,
    });
    if (!response.ok) { const error = new Error(`hubspot_http_${response.status}`); error.status = response.status; throw error; }
    return response.status === 204 ? {} : response.json();
  }
  // Schema writes are needed only on first connection. Existing fields are reused.
  const schema = await call('/crm/v3/properties/contacts');
  const existingNames = new Set((schema.results || []).map(p => p.name));
  for (const [name, label] of Object.entries(PROPERTY_LABELS)) {
    if (existingNames.has(name)) continue;
    try { await call('/crm/v3/properties/contacts', 'POST', { name, label, type: 'string', fieldType: 'text', groupName: 'contactinformation' }); }
    catch (error) { if (error.status !== 409) throw error; }
  }
  const tagged = roboticsContactProperties(row);
  const contactPath = `/crm/v3/objects/contacts/${encodeURIComponent(row.email)}?idProperty=email`;
  // Keep existing identity, lifecycle and marketing permissions. Only update program fields.
  try { const existing = await call(contactPath, 'PATCH', { properties: tagged }); return { status: 'synced', contact_id: existing.id }; }
  catch (error) { if (error.status !== 404) throw error; }
  const [firstname, ...last] = row.name.split(/\s+/);
  try {
    const created = await call('/crm/v3/objects/contacts', 'POST', { properties: { email: row.email, firstname, lastname: last.join(' '), company: row.company, ...(row.phone ? { phone: row.phone } : {}), lifecyclestage: 'lead', ...tagged } });
    return { status: 'synced', contact_id: created.id };
  } catch (error) {
    if (error.status !== 409) throw error;
    const existing = await call(contactPath, 'PATCH', { properties: tagged });
    return { status: 'synced', contact_id: existing.id };
  }
}
export async function syncRoboticsInquiry(sql, id, { token = process.env.HUBSPOT_PRIVATE_APP_TOKEN, fetcher = fetch } = {}) {
  const claim = await sql`UPDATE um_rows SET data=data || jsonb_build_object('hubspot_status','syncing','hubspot_attempted_at',now()::text),updated_at=now()
    WHERE tbl='public_inquiries' AND id=${id} AND deleted=false AND data->>'kind'='robotics'
    AND (COALESCE(data->>'hubspot_status','pending') NOT IN ('synced','syncing') OR (data->>'hubspot_status'='syncing' AND (data->>'hubspot_attempted_at')::timestamptz < now()-interval '5 minutes')) RETURNING data`;
  if (!claim.length) return { status: 'unchanged' };
  let result;
  try { result = await pushRoboticsContact(claim[0].data, { token, fetcher }); }
  catch (error) { result = { status: 'failed', error: /^hubspot_http_\d+$/.test(error.message) ? error.message : 'hubspot_unavailable' }; }
  const patch = { hubspot_status: result.status, hubspot_contact_id: result.contact_id || null, hubspot_error: result.error || null, ...(result.status === 'synced' ? { hubspot_synced_at: new Date().toISOString() } : {}) };
  await sql`UPDATE um_rows SET data=data || ${JSON.stringify(patch)}::jsonb,updated_at=now() WHERE tbl='public_inquiries' AND id=${id} AND deleted=false`;
  return result;
}
