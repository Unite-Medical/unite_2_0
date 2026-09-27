export function validateRestoreSnapshot(body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok:false, error:'invalid_snapshot' };
  const total = body.total_savings_usd;
  if (typeof total !== 'number' || !Number.isFinite(total) || total < 0 || total > Number.MAX_SAFE_INTEGER / 100) return { ok:false, error:'total_savings_usd_required' };
  if (typeof body.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.as_of) || !Number.isFinite(Date.parse(body.as_of)) || Date.parse(body.as_of) > now.getTime() + 300000) return { ok:false, error:'valid_as_of_required' };
  const snapshot = { total_savings_usd: Math.round(total * 100) / 100, as_of:new Date(body.as_of).toISOString(), received_at:now.toISOString() };
  for (const field of ['instrument_count','hospital_count']) {
    if (body[field] === undefined) continue;
    if (!Number.isSafeInteger(body[field]) || body[field] < 0) return { ok:false, error:`invalid_${field}` };
    snapshot[field] = body[field];
  }
  // Detailed customer/hospital breakdowns stay private in the stored snapshot.
  if (body.breakdown !== undefined) snapshot.breakdown = body.breakdown;
  return { ok:true, snapshot };
}
export function publicRestoreSnapshot(snapshot, updatedAt) {
  if (snapshot?.checked_at) {
    const validated = validateRestoreSnapshot({ total_savings_usd: snapshot.total_savings_usd, as_of: snapshot.checked_at });
    if (!validated.ok) return { ok: false, reason: 'invalid_snapshot' };
    return { ok: true, total_savings_usd: validated.snapshot.total_savings_usd, checked_at: validated.snapshot.as_of, updated_at: updatedAt };
  }
  const validated=validateRestoreSnapshot(snapshot);
  if(!validated.ok)return {ok:false,reason:'invalid_snapshot'};
  return {ok:true,total_savings_usd:validated.snapshot.total_savings_usd,as_of:validated.snapshot.as_of,updated_at:updatedAt,...Object.fromEntries(['instrument_count','hospital_count'].filter(k=>snapshot[k]!==undefined).map(k=>[k,snapshot[k]]))};
}
