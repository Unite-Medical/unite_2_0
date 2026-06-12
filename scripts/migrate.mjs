#!/usr/bin/env node
/**
 * Apply the relational schema blueprints in docs/schema/migrations/
 * to a real Postgres database, in order, exactly once each.
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 *   DATABASE_URL=postgres://... npm run db:migrate -- --dry-run
 *
 * Applied filenames are recorded in a `_migrations` ledger table so
 * re-runs are no-ops. This is the cutover path from the interim JSONB
 * row-store (/api/db/sync) to the dedicated relational API tier.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'docs', 'schema', 'migrations');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }
  const sql = neon(url);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  const done = new Set((await sql`SELECT filename FROM _migrations`).map((r) => r.filename));

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) { console.log(`  = ${file} (already applied)`); continue; }
    const body = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    if (DRY_RUN) { console.log(`  ~ ${file} (would apply, ${body.length} bytes)`); continue; }
    try {
      // Neon's HTTP driver runs one statement per call; split on
      // semicolons at line ends (the blueprints don't use functions
      // or dollar-quoted bodies).
      // Keep statements that contain any non-comment line; leading
      // comment lines are valid SQL and pass through harmlessly.
      const statements = body
        .split(/;[ \t]*(?:--[^\n]*)?$/m)
        .map((s) => s.trim())
        .filter((s) => s.split('\n').some((line) => line.trim() && !line.trim().startsWith('--')));
      for (const stmt of statements) await sql.query(stmt);
      await sql`INSERT INTO _migrations (filename) VALUES (${file})`;
      console.log(`  + ${file}`);
      applied += 1;
    } catch (err) {
      console.error(`  ! ${file} failed: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(DRY_RUN ? 'Dry run complete.' : `Done — ${applied} migration(s) applied, ${done.size} previously applied.`);
}

main();
