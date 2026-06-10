# PRD-11 — AI Intelligence Layer (Claude)

**Source:** CTO Brief §9
**Owner:** Alex (CTO) — leverages his mathematics background
**Status:** draft
**Depends on:** PRD-01 (Platform)
**Used by:** PRD-05 (digests, transcripts), PRD-07 (vendor outreach drafts), PRD-08 (HTS classification, cover letters), PRD-10 (surplus categorization)

> "The AI layer is not an add-on — it is the connective tissue that makes every other integration more valuable." — Brief §9

---

## 1. North star

A single, shared Claude client with consistent prompt engineering,
typed responses, rate limiting, cost tracking, and prompt versioning.
Every other PRD calls into this layer instead of building its own
Anthropic wrapper.

---

## 2. Current state

- `src/lib/services.js` has a `claude` stub with two simulated
  functions: `generateQuoteLetter`, `classifyHTS`
- Real Anthropic API: not integrated
- No prompt management, no cost tracking, no rate limiting

---

## 3. Scope

### In scope

- A `claudeClient` library shared across the codebase
- Prompt registry: every prompt is named, versioned, stored in
  `prompts/` directory, deployed atomically
- Typed responses via Anthropic's tool-use feature (Zod schemas
  enforced server-side)
- Cost tracking per call (model + input tokens + output tokens +
  USD cost) → `ai_usage` table
- Rate limiting at the client (max concurrent + per-minute) to avoid
  vendor rate limits and runaway costs
- Standard error handling + retries with exponential backoff
- "Eval harness" — small batch tests we run when changing prompts

### Out of scope

- Multi-model orchestration (OpenAI, Gemini fallbacks) — Anthropic
  only for v1
- Custom fine-tuning
- A general-purpose chatbot UI for staff (out of scope; can be added
  later if useful)

---

## 4. Use cases (consolidated from brief §9 + cross-PRD)

| PRD | Use case | Model | Notes |
|---|---|---|---|
| 05 | Fathom transcript → action items | Sonnet | Tool use with strict JSON schema |
| 05 | Fathom transcript → sales insights | Sonnet | Tool use |
| 05 | CEO daily digest | Sonnet | Long context input (multiple data sources) |
| 07 | Vendor outreach email | Sonnet | Personalized, single output |
| 07 | Recall outreach to customers | Sonnet | High-stakes — human-approve before send |
| 08 | HTS code classification assist | Sonnet | Multi-language support (Chinese product descriptions per brief) |
| 08 | FDA code classification assist | Sonnet | Tool use |
| 08 | Quote cover letter | Sonnet | Tunable Damon-voice prompt |
| 08 | Compliance checklist generation | Sonnet | Tool use |
| 10 | Surplus line normalization + categorization | Haiku | Cheaper, lots of throughput |
| 10 | Surplus valuation | Sonnet | Reasoning-heavy |
| 12 | Forecasting natural-language commentary | Sonnet | Optional |
| 14 | "Damon assistant" inside admin (Phase 6, optional) | Sonnet | Future |

Model selection rule: **Haiku for cheap classification at scale,
Sonnet for everything else**. Opus is overkill for current workloads.

---

## 5. Prompt registry layout

```
prompts/
├── fathom/
│   ├── extract_action_items.v1.md
│   ├── extract_insights.v1.md
│   └── schemas.ts
├── digest/
│   ├── ceo_morning_brief.v3.md
│   └── schemas.ts
├── vendor/
│   ├── outreach_email.v1.md
│   ├── recall_notice.v1.md
│   └── schemas.ts
├── quoting/
│   ├── hts_classify.v2.md
│   ├── fda_classify.v1.md
│   ├── cover_letter.v4.md
│   └── schemas.ts
├── surplus/
│   ├── line_normalize.v1.md
│   ├── valuation.v2.md
│   └── schemas.ts
└── README.md
```

Each prompt file: front matter (model, max_tokens, temperature) +
prompt body in markdown. Schemas in TS so callers + responses are
typed end-to-end.

---

## 6. Client shape (sketch)

```ts
import { claudeClient } from '@unite/ai';
import { actionItemsSchema } from '@unite/ai/schemas';

const { data, usage } = await claudeClient.run('fathom/extract_action_items.v1', {
  input: { transcript, rep_email, deal_id },
  schema: actionItemsSchema,
  context: { request_id, source: 'webhook:fathom' },
});

// usage is auto-logged to ai_usage table
// data is typed per schema
```

The `run` method:
- looks up the prompt by registry key
- compiles input into prompt template
- calls Anthropic with tool use bound to the schema
- validates response against schema
- retries with exponential backoff on rate-limit / transient errors
- logs cost + latency to `ai_usage`

---

## 7. Cost tracking

```sql
CREATE TABLE ai_usage (
  id              UUID PRIMARY KEY,
  prompt_key      TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_tokens    INT,
  output_tokens   INT,
  usd_cost        NUMERIC(10,4),
  duration_ms     INT,
  status          TEXT, -- 'ok' / 'error' / 'rate_limited'
  request_id      TEXT,
  source          TEXT, -- 'webhook:fathom', 'cron:digest', etc.
  caller_user_id  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_created ON ai_usage (created_at);
CREATE INDEX idx_ai_usage_prompt ON ai_usage (prompt_key, created_at);
```

Daily aggregate view in `/admin/integrations/ai` shows: cost by
prompt, by model, error rates, latency p95.

---

## 8. Rate limiting + budget caps

- Per-prompt concurrency: configurable (default 5)
- Global concurrency: 20
- Daily USD budget cap (configurable per environment); over budget →
  alerts + new calls fail closed with a clear error
- "Soft cap" at 80% of daily budget → alert only

---

## 9. Phases

### Phase 1 — Client + prompt registry + cost tracking

- `@unite/ai` package created in monorepo
- Anthropic SDK + Zod + a tiny prompt-loading helper
- `ai_usage` table + admin view

**Exit:** A "hello world" prompt runs through the client, returns
typed output, logs cost.

### Phase 2 — Migrate existing simulator calls (Quoting Engine)

- `quoting/cover_letter.v1` and `quoting/hts_classify.v1` prompts
  authored
- `src/lib/quoting.js` calls them instead of the simulator

**Exit:** A live quote run uses the real Claude for cover letter and
HTS assist.

### Phase 3 — Fathom integration (depends on PRD-05 Phase 2)

- Action items + insights prompts authored
- Eval harness: 20 hand-labeled call transcripts; precision/recall
  measured

**Exit:** > 90% precision on action items + > 85% recall.

### Phase 4 — Daily digest (depends on PRD-05 Phase 5)

- Long-context input from multiple sources
- Eval: side-by-side with Damon's manual notes for 5 days; tune prompt

**Exit:** Damon prefers the AI digest over his own notes (or honestly
says it).

### Phase 5 — Vendor + recall outreach drafts (PRD-07)

- Two prompts; both human-approve-before-send

**Exit:** First real vendor outreach campaign uses AI drafts.

### Phase 6 — Surplus categorization (PRD-10)

- Haiku-based throughput-optimized prompt
- Eval: 100 hand-labeled lines, measure categorization accuracy

**Exit:** Surplus submissions auto-categorize at > 92% accuracy.

---

## 10. Verifier + eval harness

`scripts/ai_evals.py` (manual, but available):

- For each prompt, run a fixed set of inputs through the current
  version, diff outputs against the previous version
- For prompts with ground-truth labels, compute accuracy/precision/recall
- Block prompt-version promotion if a metric regresses > threshold

`scripts/ai_check.py` (nightly):

- Alert if daily spend > 2× rolling 7-day average
- Alert if error rate for any prompt > 5%
- Alert if any prompt key has had no successful call in 24h (likely
  broken pipeline)

---

## 11. Open questions

1. **Multi-model fallback**: if Anthropic has an outage, do critical
   flows (recall notices) fall back to OpenAI? Default: no — outage
   alerting is enough; recall notices are human-approved anyway.
2. **Prompt-versioning approval**: who can promote a prompt from v1
   → v2? Default: any engineer can author + run evals; Damon or VP
   Sales approves prompts that produce customer-facing copy.
3. **Data retention**: do we keep full prompt inputs/outputs for
   debugging? Default: yes for 30 days then trimmed (PII concerns).
4. **PII redaction**: should we strip PII before sending to
   Anthropic? Default: yes for transcripts (Fathom). Other inputs
   (catalog, vendors) are non-PII.

---

## 12. Out-of-band

- Anthropic API key + organization
- Anthropic budget cap set in their dashboard as a hard backstop
- New env vars: `ANTHROPIC_API_KEY`, `AI_DAILY_BUDGET_USD`,
  `AI_GLOBAL_CONCURRENCY`

---

## 13. Definition of done

- Every Anthropic call across the codebase goes through `@unite/ai`
- Prompt registry is the single source of truth (no inline prompts
  elsewhere)
- Daily spend dashboard exists; alerts work
- Eval harness in place for every prompt that has ground-truth labels
- Per-PRD acceptance criteria (FAQ accuracy, action item precision,
  etc.) all met
