import crypto from 'node:crypto';

// Compare complete source records and commit every consequence together. A stale
// source or conflicting insert aborts the transaction, including its audit rows.
export async function atomicTransition(sql, { checks = [], writes = [] }) {
  const nonce = crypto.randomUUID();
  const keys = [...new Set([...checks, ...writes].map(r => `${r.table}:${r.id || r.data.id}`))].sort();
  const prepared = writes.map(r => ({ ...r, id: r.id || r.data.id, data: { ...r.data, operation_nonce: nonce } }));
  try {
    await sql.transaction(tx => [
      ...keys.map(key => tx`SELECT pg_advisory_xact_lock(hashtext(${key}))`),
      ...checks.map(r => tx`SELECT id FROM um_rows WHERE tbl=${r.table} AND id=${r.id} FOR UPDATE`),
      ...checks.map(r => r.before == null
        ? tx`SELECT 1 / CASE WHEN NOT EXISTS(SELECT 1 FROM um_rows WHERE tbl=${r.table} AND id=${r.id}) THEN 1 ELSE 0 END AS valid`
        : tx`SELECT 1 / CASE WHEN EXISTS(SELECT 1 FROM um_rows WHERE tbl=${r.table} AND id=${r.id} AND deleted=false AND data=${JSON.stringify(r.before)}::jsonb) THEN 1 ELSE 0 END AS valid`),
      ...prepared.map(r => r.before == null
        ? tx`INSERT INTO um_rows(tbl,id,data) VALUES(${r.table},${r.id},${JSON.stringify(r.data)}::jsonb) ON CONFLICT(tbl,id) DO NOTHING`
        : tx`UPDATE um_rows SET data=${JSON.stringify(r.data)}::jsonb,updated_at=now() WHERE tbl=${r.table} AND id=${r.id} AND deleted=false AND data=${JSON.stringify(r.before)}::jsonb`),
      ...prepared.map(r => tx`SELECT 1 / CASE WHEN EXISTS(SELECT 1 FROM um_rows WHERE tbl=${r.table} AND id=${r.id} AND deleted=false AND data->>'operation_nonce'=${nonce}) THEN 1 ELSE 0 END AS committed`),
    ]);
    return { ok: true };
  } catch (error) {
    if (['22012','23505','40001','40P01'].includes(error.code)) return { ok: false, reason: 'records_changed_refresh' };
    throw error;
  }
}
export async function storedRow(sql, table, id) {
  const rows = await sql`SELECT data FROM um_rows WHERE tbl=${table} AND id=${String(id || '')} AND deleted=false`;
  return rows[0]?.data || null;
}
