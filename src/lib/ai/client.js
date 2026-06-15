/**
 * Claude client — PRD-11 Phase 1.
 *
 * Single entry point for every Anthropic call:
 *
 *   import { ai } from './lib/ai/client.js';
 *   const { data, usage } = await ai.run('quoting/cover_letter', {
 *     input: { customer_name: 'Atlanta Surgical', ... },
 *   });
 *
 * - Loads the prompt by registry key (`./registry.js`)
 * - Substitutes {{placeholders}} (mustache-lite)
 * - Calls Anthropic Messages API IF an API key is configured AND we're
 *   running server-side (browser can't safely hold the key)
 * - Otherwise falls back to a synthesized response so the demo + tests
 *   still produce sensible output
 * - Logs every call to the in-browser `ai_usage` table so the
 *   admin dashboard can render cost-by-prompt
 */

import { db } from '../db.js';
import { uid, delay } from '../format.js';
import { API_BASE } from '../external/_http.js';
import { loadPrompt, PROMPT_REGISTRY } from './registry.js';
import { SCHEMA_BY_PROMPT_KEY, validate } from './schemas.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
// Node-side direct key (verifier scripts, future workers). The browser
// NEVER holds the key — it calls /api/proxy/anthropic/v1/messages and
// the serverless proxy injects ANTHROPIC_API_KEY (api/_lib/services.js).
const API_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANTHROPIC_API_KEY) || '';
const IS_BROWSER = typeof window !== 'undefined';
const PROXY_URL = API_BASE ? `${API_BASE}/proxy/anthropic/v1/messages` : '';

// Per-prompt usage cost (USD per million tokens) — Sonnet 4.6 rates
// approximated; refresh from Anthropic pricing periodically.
const MODEL_COSTS = {
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'claude-haiku-4':    { input: 0.80, output: 4.00 },
};

function substitute(template, input = {}) {
  // mustache-lite: {{key}} substitution. No conditionals beyond
  // {{#key}}...{{/key}} block existence check.
  let out = String(template || '');
  // Block sections: {{#key}}…{{/key}}
  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, body) => {
    const v = input[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return '';
    return body;
  });
  // Simple substitutions: {{key}} (case-sensitive).
  out = out.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = input[k];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v, null, 2);
    return String(v);
  });
  return out;
}

function estimateTokens(text) {
  // Cheap heuristic: ~4 chars per token.
  return Math.ceil(String(text || '').length / 4);
}

function logUsage(entry) {
  try {
    if (!db.list('ai_usage')) return; // table missing — schema not bumped
    db.insert('ai_usage', { id: uid('aiu'), ...entry, created_at: new Date().toISOString() });
  } catch {
    // Best effort — never throw from the logger.
  }
}

/**
 * Stub responses keyed by prompt name. Used when no API key is set
 * (i.e., during the entire pre-backend phase). Each stub matches the
 * eventual response shape so callers don't branch on stub-vs-real.
 */
const STUBS = {
  'quoting/cover_letter': (input) => ({
    content: `${input.contact_first || input.contact_name?.split(' ')[0] || 'Hi'} —\n\nPer our conversation, here is the landed-cost quote on ${input.product_count || 'these'} SKUs for ${input.customer_name || 'your team'}, totaling $${(input.total_usd_formatted || '0')} delivered FOB Georgia.\n\nMargin is calibrated to our standard tier. Vessel arrives ${input.eta_human || 'as noted'}; we release inventory the day it clears CBP. Every line was validated against the FDA database before pricing.\n\nReach back with any line edits and we'll re-cost in real time.\n\n— Damon\nFounder, Unite Medical`,
  }),
  'quoting/hts_classify': (input) => {
    const guesses = ['9021.10', '3822.19', '4015.19', '6307.90', '3005.10', '3004.90', '9025.19'];
    const i = (input.product_name?.length || 0) % guesses.length;
    return {
      primary: { code: guesses[i], description: 'Best-guess classification', confidence: 0.6 },
      alternates: [],
      reasoning: 'Heuristic fallback (no API key configured).',
    };
  },
  'quoting/column_map': () => ({ mappings: [] }),
  'quoting/translate_lines': (input) => {
    let lines = [];
    try { lines = JSON.parse(input.lines || '[]'); } catch { lines = []; }
    // Offline: echo source text (no real translation, but never breaks).
    return { translations: lines.map((l) => ({ index: l.index, name_en: l.name || '', description_en: l.description || '' })) };
  },
  'fathom/extract_action_items': () => ({ items: [] }),
  'fathom/extract_insights':     () => ({ objections: [], competitors: [], pricing: [], coaching_flags: [], next_step: '', sentiment_score: 3, sentiment_reason: 'no API key configured' }),
  'digest/ceo_morning_brief':    () => ({ bullets: [{ priority: 1, headline: 'Daily digest unavailable', summary: 'Anthropic API key not configured.', why_it_matters: 'Wire VITE_ANTHROPIC_API_KEY (dev) or ANTHROPIC_API_KEY (prod) to enable.', deep_link: '/admin/integrations/ai', severity: 'attention' }] }),
  'vendor/outreach_email':       (input) => ({ subject: `Sourcing partnership — ${input.company_name || 'your company'}`, body: 'Stub outreach email body.', signoff_name: 'Damon Reed' }),
  'vendor/recall_notice':        () => ({ subject: 'Recall notice', body: 'Stub recall notice body.' }),
  'surplus/line_normalize':      (input) => ({ lines: (input.lines || []).map((l, idx) => ({ index: idx, normalized_name: l.raw_description, category: 'Other', condition_hint: 'unknown', expiry_iso: null, qty: l.qty, gtin: null, flags: [] })) }),
  'surplus/valuation':           (input) => ({ valuations: (input.normalized_lines_json?.lines || []).map((l) => ({ index: l.index, decision: 'pass', decision_reason: 'no API key configured', est_retail_usd: 0, offer_usd_per_unit: 0, offer_usd_total: 0, confidence: 0 })) }),
};

async function callAnthropic({ model, maxTokens, temperature, prompt, tool }) {
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  };
  // When a schema is registered for this prompt, use strict tool-use.
  // This guarantees Anthropic returns input that validates against the
  // schema — no string parsing, no JSON repair needed.
  // Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
  if (tool) {
    body.tools = [{
      name: tool.tool_name,
      description: tool.description,
      strict: true,
      input_schema: tool.input_schema,
    }];
    body.tool_choice = { type: 'tool', name: tool.tool_name };
  }

  // Browser → serverless proxy (key injected server-side).
  // Node     → direct Anthropic call with the local key.
  const viaProxy = IS_BROWSER || !API_KEY;
  const url = viaProxy ? PROXY_URL : ANTHROPIC_API_URL;
  const headers = viaProxy
    ? { 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' };
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();

  let toolInput = null;
  let textOut = '';
  for (const block of json.content || []) {
    if (block.type === 'tool_use' && block.name === tool?.tool_name) {
      toolInput = block.input;
    } else if (block.type === 'text') {
      textOut += block.text;
    }
  }

  return {
    content: textOut,
    tool_input: toolInput,
    input_tokens: json.usage?.input_tokens || 0,
    output_tokens: json.usage?.output_tokens || 0,
    model: json.model || model,
  };
}

export const ai = {
  /**
   * Run a registered prompt.
   *
   * @param {string} key  Registry key (e.g. 'quoting/cover_letter')
   * @param {object} opts
   * @param {object} opts.input  Values to substitute into {{placeholders}}
   * @param {string} [opts.source]  Caller tag for cost tracking
   * @returns {Promise<{ data: any, usage: object, stub: boolean }>}
   */
  async run(key, { input = {}, source = 'unknown' } = {}) {
    const entry = PROMPT_REGISTRY[key];
    if (!entry) throw new Error(`Unknown prompt key: ${key}`);
    const start = Date.now();
    const version = entry.path.match(/\.v(\d+)\./)?.[1] || 'unknown';

    // Real-first: in the browser we go through the serverless proxy
    // (key injected server-side); in Node we call Anthropic directly
    // when a key is present. Any failure — including the proxy's 503
    // "not_configured" before ANTHROPIC_API_KEY is set in Vercel —
    // falls through to the deterministic stub so the UI never blocks.
    const canTryReal = (API_KEY && !IS_BROWSER) || Boolean(PROXY_URL);
    let realError = null;

    if (canTryReal) {
      const template = await loadPrompt(key);
      const prompt = substitute(template, input);
      const tool = SCHEMA_BY_PROMPT_KEY[key];
      try {
        const resp = await callAnthropic({
          model: entry.model,
          maxTokens: entry.maxTokens,
          temperature: entry.temperature,
          prompt,
          tool,
        });
        const cost = MODEL_COSTS[entry.model] || { input: 0, output: 0 };
        const usd =
          (resp.input_tokens / 1_000_000) * cost.input
          + (resp.output_tokens / 1_000_000) * cost.output;
        const usage = {
          prompt_key: key,
          prompt_version: version,
          model: resp.model,
          input_tokens: resp.input_tokens,
          output_tokens: resp.output_tokens,
          usd_cost: +usd.toFixed(4),
          duration_ms: Date.now() - start,
          status: 'ok',
          source,
        };
        logUsage(usage);

        // Schema-validated tool output if tool-use was active.
        if (tool && resp.tool_input != null) {
          const { ok, errors } = validate(resp.tool_input, tool.input_schema);
          if (!ok) {
            logUsage({ ...usage, status: 'schema_violation', error: errors.join('; ') });
            throw new Error(`schema violation in ${key}: ${errors[0]}`);
          }
          return { data: resp.tool_input, usage, stub: false };
        }
        return { data: { content: resp.content }, usage, stub: false };
      } catch (err) {
        realError = err;
        logUsage({
          prompt_key: key,
          prompt_version: version,
          model: entry.model,
          input_tokens: estimateTokens(prompt),
          output_tokens: 0,
          usd_cost: 0,
          duration_ms: Date.now() - start,
          status: 'error',
          source,
          error: err.message,
        });
      }
    }

    // Stub path — either real isn't reachable or it failed above. We
    // still log usage so the admin dashboard reflects the call.
    const stub = STUBS[key];
    if (!stub) {
      if (realError) throw realError;
      throw new Error(`No stub registered for prompt key: ${key}`);
    }
    await delay(220, 540);
    const data = await stub(input);
    const usage = {
      prompt_key: key,
      prompt_version: version,
      model: entry.model,
      input_tokens: 0,
      output_tokens: 0,
      usd_cost: 0,
      duration_ms: Date.now() - start,
      status: realError ? 'stub_fallback' : 'stub',
      source,
      ...(realError ? { error: realError.message } : {}),
    };
    logUsage(usage);
    return { data, usage, stub: true };
  },

  /** For tests / verifier. */
  __substitute: substitute,
  __STUBS: STUBS,
};
