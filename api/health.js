/**
 * Integration health / configuration snapshot — PRD-01.
 *
 *   GET /api/health
 *
 * Returns booleans only (never secrets) so /admin/integrations can
 * show which upstreams are live-wired on the server versus stubbed.
 */

import { configSnapshot } from './_lib/services.js';
import { sendJson } from './_lib/http.js';

export default async function handler(req, res) {
  sendJson(res, 200, {
    ok: true,
    at: new Date().toISOString(),
    runtime: 'vercel-node',
    services: configSnapshot(),
  });
}
