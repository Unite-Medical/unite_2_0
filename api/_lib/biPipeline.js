import crypto from 'node:crypto';
import { BI_SOURCES, biRecordId, readBiSourcePage } from './biSources.js';

const DAY = 86400000;
export function newBiRun(source, previous = {}, now = Date.now()) {
  return { source, label: BI_SOURCES[source], generation: crypto.randomUUID(), status: 'running', started_at: new Date(now).toISOString(),
    since: new Date(now - 60 * DAY).toISOString().slice(0,10), page: 1, cursor: null, records_received: 0, warnings: [], attempts: 0,
    published: previous.published || null, last_step: previous.last_step || null };
}
export function advanceBiState(state, result, now = Date.now()) {
  if (!Array.isArray(result.records) || typeof result.has_more !== 'boolean') throw new Error('invalid_source_page');
  if (state.identity && state.identity !== result.identity) throw new Error('source_account_changed_during_refresh');
  if (result.has_more && (!result.records.length || state.page >= 2000)) throw new Error('source_pagination_limit_or_stall');
  if (result.has_more && (state.source.startsWith('shopify_') || state.source.startsWith('stripe_')) && (!result.next_cursor || result.next_cursor === state.cursor)) throw new Error('source_cursor_stalled');
  const seen = new Set();
  for (const row of result.records) { const id = biRecordId(state.source, row); if (seen.has(id)) throw new Error('source_duplicate_id_in_page'); seen.add(id); }
  const next = { ...state, identity: result.identity, page: state.page + 1, cursor: result.next_cursor || null,
    records_received: state.records_received + result.records.length, warnings: [...new Set([...state.warnings, ...(result.warnings || [])])].slice(0, 100),
    coverage: result.coverage, last_step: new Date(now).toISOString(), attempts: 0, error: null, retry_at: null };
  if (next.records_received > 100000) throw new Error('source_record_limit');
  if (!result.has_more) {
    next.status = next.warnings.length ? 'partial' : 'ready';
    next.finished_at = next.last_step;
    next.published = { generation: state.generation, started_at: state.started_at, finished_at: next.finished_at, status: next.status,
      identity: next.identity, coverage: next.coverage, pages: state.page, records_received: next.records_received, warnings: next.warnings };
  }
  return next;
}

// A short fenced lease serializes workers. Pages, records and the publication
// pointer commit together, so a timeout cannot advertise a half-written dataset.
export function biRepository(sql) {
  return {
    async acquire(owner) {
      const rows = await sql`INSERT INTO um_rows(tbl,id,data) VALUES('bi_control','worker',jsonb_build_object('owner',${owner}::text,'until',now()+interval '120 seconds'))
        ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()
        WHERE (um_rows.data->>'until')::timestamptz < now() RETURNING id`;
      return rows.length > 0;
    },
    async release(owner) { await sql`UPDATE um_rows SET data=jsonb_set(data,'{until}',to_jsonb(now())),updated_at=now() WHERE tbl='bi_control' AND id='worker' AND data->>'owner'=${owner}`; },
    async states() { return (await sql`SELECT data FROM um_rows WHERE tbl='bi_sources' AND deleted=false ORDER BY id`).map(r => r.data); },
    async commit(owner, state, result = null) {
      const records = result ? result.records.map(row => ({ id: `${state.generation}:${biRecordId(state.source, row)}`, data: { source: state.source, generation: state.generation, record_id: biRecordId(state.source, row), retrieved_at: result.retrieved_at, record: row } })) : [];
      const meta = result ? { ...result, records: undefined, record_count: result.records.length } : null;
      const saved = await sql`WITH guard AS (
        UPDATE um_rows SET updated_at=now() WHERE tbl='bi_control' AND id='worker' AND data->>'owner'=${owner} AND (data->>'until')::timestamptz>now() RETURNING id
      ), records AS (
        INSERT INTO um_rows(tbl,id,data) SELECT 'bi_records',r->>'id',r->'data' FROM jsonb_array_elements(${JSON.stringify(records)}::jsonb) r CROSS JOIN guard
        ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() RETURNING id
      ), page AS (
        INSERT INTO um_rows(tbl,id,data) SELECT 'bi_pages',${state.generation + ':' + (result?.page || 0)},${JSON.stringify(meta)}::jsonb FROM guard WHERE ${Boolean(result)}
        ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() RETURNING id
      ) INSERT INTO um_rows(tbl,id,data) SELECT 'bi_sources',${state.source},${JSON.stringify(state)}::jsonb FROM guard
        ON CONFLICT(tbl,id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() RETURNING id`;
      if (!saved.length) throw new Error('bi_worker_lease_expired');
    },
  };
}
export async function runBiPipeline(sql, { repository = biRepository(sql), readPage = readBiSourcePage, now = () => Date.now(), maxPages = 20, budgetMs = 35000, refreshRequested = false } = {}) {
  const owner = crypto.randomUUID(), start = now();
  if (!await repository.acquire(owner)) return { busy: true, pages_processed: 0 };
  let processed = 0;
  try {
    const states = new Map((await repository.states()).map(s => [s.source, s]));
    if(refreshRequested && states.size && ![...states.values()].some(s=>s.status==='running')) {
      for(const source of Object.keys(BI_SOURCES)){const state=newBiRun(source,states.get(source),now());await repository.commit(owner,state);states.set(source,state);}
    }
    while (processed < maxPages && now() - start < budgetMs) {
      const eligible = Object.keys(BI_SOURCES).filter(source => {
        const s = states.get(source);
        return !s || (s.status === 'running' ? !s.retry_at || Date.parse(s.retry_at) <= now() : now() - Date.parse(s.finished_at || s.last_step || 0) >= DAY);
      }).sort((a,b) => String(states.get(a)?.last_step || '').localeCompare(String(states.get(b)?.last_step || '')));
      if (!eligible.length) break;
      const source = eligible[0];
      let state = states.get(source);
      if (state?.status !== 'running') { state = newBiRun(source, state, now()); await repository.commit(owner, state); }
      let result, next;
      try {
        result = await readPage(sql, state);
        next = advanceBiState(state, result, now());
      } catch (error) {
        if (error.message === 'bi_worker_lease_expired') throw error;
        const attempts = (state.attempts || 0) + 1;
        next = { ...state, attempts, error: /^[a-z0-9_]+$/.test(error.message) ? error.message : 'source_read_failed',
          status: attempts >= 3 ? 'error' : 'running', last_step: new Date(now()).toISOString(), retry_at: new Date(now() + attempts * 60000).toISOString() };
        if (next.status === 'error') next.finished_at = next.last_step;
        result = null;
      }
      // A database failure must not rewind an already committed page after an uncertain acknowledgment.
      await repository.commit(owner, next, result); states.set(source, next);
      processed++;
    }
    return { busy: false, pages_processed: processed, sources: pipelineStatus([...states.values()], now()) };
  } finally { await repository.release(owner); }
}
export function pipelineStatus(states, now = Date.now()) {
  const bySource = new Map(states.map(s => [s.source, s]));
  return Object.entries(BI_SOURCES).map(([source,label]) => {
    const s = bySource.get(source), p = s?.published;
    return { source, label, status: s?.status || 'not_started', pages_loaded: (s?.page || 1)-1, records_received: s?.records_received || 0,
      error: s?.error || null, retry_at: s?.retry_at || null, last_attempt_at: s?.last_step || null,
      published: p ? { ...p, age_hours: Math.round((now-Date.parse(p.finished_at))/360000)/10, stale: now-Date.parse(p.finished_at)>DAY*1.25 } : null };
  });
}
