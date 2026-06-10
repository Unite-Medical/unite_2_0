/**
 * AI tool-use schemas — PRD-11 Phase 2.
 *
 * Anthropic's Messages API supports "strict" tool use: define a JSON
 * Schema for the tool input, set `strict: true`, and the API will
 * return only valid inputs. This file is the canonical home for every
 * such schema, keyed by registry key.
 *
 * Docs: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
 *
 * Each export is a JSON Schema object that doubles as a Zod-shaped
 * runtime validator via the tiny `validate()` helper below. We avoid
 * a Zod dependency to keep the bundle lean; the validator is ~50
 * lines and matches the subset of JSON Schema Anthropic supports.
 */

// ---- Helpers ---------------------------------------------------------------

/** Build a JSON-Schema property record. */
const p = {
  string: (description, extras = {}) => ({ type: 'string', description, ...extras }),
  number: (description, extras = {}) => ({ type: 'number', description, ...extras }),
  integer: (description, extras = {}) => ({ type: 'integer', description, ...extras }),
  boolean: (description) => ({ type: 'boolean', description }),
  enum: (description, values) => ({ type: 'string', description, enum: values }),
  array: (description, items) => ({ type: 'array', description, items }),
  object: (description, properties, required = [], additionalProperties = false) => ({
    type: 'object', description, properties, required, additionalProperties,
  }),
};

// ---- 1. fathom/extract_action_items ---------------------------------------

export const fathom_action_items = {
  tool_name: 'record_action_items',
  description: 'Record action items extracted from a sales/support call transcript.',
  input_schema: p.object(
    'Container for action items extracted from a Fathom call transcript.',
    {
      items: p.array(
        'List of action items. Maximum 8.',
        p.object('A single action item with owner + due date + evidence.', {
          task:           p.string('Imperative task description, ≤ 140 chars.'),
          owner_kind:     p.enum('Who is responsible.', ['rep', 'customer', 'manager', 'other']),
          owner_email:    p.string('Optional email of the owner.', {}),
          due_iso:        p.string('ISO date for due date, or the literal string "ASAP".'),
          confidence:     p.number('0..1 confidence.'),
          evidence_quote: p.string('Short verbatim quote from the transcript.'),
        }, ['task', 'owner_kind', 'due_iso', 'confidence']),
      ),
    },
    ['items'],
  ),
};

// ---- 2. fathom/extract_insights -------------------------------------------

export const fathom_insights = {
  tool_name: 'record_insights',
  description: 'Record structured sales insights from a call transcript.',
  input_schema: p.object('Structured call insights.', {
    objections: p.array('Customer objections raised.', p.object('A single objection.', {
      category: p.enum('Objection category.', ['price', 'terms', 'product_fit', 'timing', 'competitor', 'decision_authority', 'other']),
      quote:    p.string('Verbatim quote from the transcript.'),
    }, ['category', 'quote'])),
    competitors: p.array('Competitors mentioned by name.', p.object('A competitor mention.', {
      name:    p.string('Competitor name.'),
      context: p.string('Quoted context from the call.'),
    }, ['name', 'context'])),
    pricing:    p.array('Price/terms discussion moments.', p.object('A pricing moment.', {
      quote:        p.string('Quote from the discussion.'),
      rep_response: p.string('What the rep said in response.'),
    }, ['quote'])),
    coaching_flags: p.array('Improvable rep behaviors with quote.', p.object('A coaching flag.', {
      pattern: p.enum('Pattern category.', ['missed_objection', 'missed_discovery', 'over_promise', 'missed_buying_signal', 'other']),
      quote:   p.string('Quote that triggered the flag.'),
      suggestion: p.string('Actionable, constructive suggestion.'),
    }, ['pattern', 'quote'])),
    next_step:         p.string('Concise next-step commitment.'),
    sentiment_score:   p.integer('1..5 buying likelihood.'),
    sentiment_reason:  p.string('One-sentence justification.'),
  }, ['objections', 'competitors', 'pricing', 'coaching_flags', 'next_step', 'sentiment_score', 'sentiment_reason']),
};

// ---- 3. digest/ceo_morning_brief ------------------------------------------

export const ceo_digest = {
  tool_name: 'record_digest',
  description: 'Record a 5-bullet (or fewer) morning brief for the CEO.',
  input_schema: p.object('Morning digest container.', {
    bullets: p.array(
      'Exactly 3 to 5 bullets, ordered by priority.',
      p.object('A digest bullet.', {
        priority:       p.integer('1 is highest.'),
        headline:       p.string('≤ 80 char headline.'),
        summary:        p.string('≤ 240 char summary.'),
        why_it_matters: p.string('≤ 180 char "so what".'),
        deep_link:      p.string('Internal admin path the CEO can click.'),
        severity:       p.enum('Visual severity.', ['info', 'attention', 'urgent']),
      }, ['priority', 'headline', 'summary', 'why_it_matters', 'deep_link', 'severity']),
    ),
  }, ['bullets']),
};

// ---- 4. vendor/outreach_email ---------------------------------------------

export const outreach_email = {
  tool_name: 'draft_email',
  description: 'Draft a vendor outreach email.',
  input_schema: p.object('Outreach draft.', {
    subject:      p.string('Subject line, ≤ 60 chars.'),
    body:         p.string('Email body, plain text.'),
    signoff_name: p.string('Sender display name.'),
  }, ['subject', 'body', 'signoff_name']),
};

// ---- 5. vendor/recall_notice ----------------------------------------------

export const recall_notice = {
  tool_name: 'draft_recall_notice',
  description: 'Draft a recall notification email for a customer.',
  input_schema: p.object('Recall notice.', {
    subject: p.string('Subject including "Recall notice" and SKU.'),
    body:    p.string('Email body, plain text, 6 short paragraphs max.'),
  }, ['subject', 'body']),
};

// ---- 6. quoting/hts_classify ----------------------------------------------

export const hts_classify = {
  tool_name: 'propose_hts',
  description: 'Propose an HTS code with alternates + reasoning.',
  input_schema: p.object('HTS proposal.', {
    primary: p.object('Best-guess HTS code.', {
      code:        p.string('6- or 10-digit HTS code, e.g. "6307.90" or "6307.90.9889".'),
      description: p.string('Description of that code.'),
      confidence:  p.number('0..1.'),
    }, ['code', 'description', 'confidence']),
    alternates: p.array('Up to 2 alternates with confidence.',
      p.object('Alternate HTS guess.', {
        code:        p.string('HTS code.'),
        description: p.string('Description.'),
        confidence:  p.number('0..1.'),
      }, ['code', 'description', 'confidence']),
    ),
    reasoning: p.string('1-2 sentence justification.'),
  }, ['primary', 'alternates', 'reasoning']),
};

// ---- 7. quoting/cover_letter ----------------------------------------------

export const cover_letter = {
  tool_name: 'draft_cover_letter',
  description: 'Draft the cover letter that goes at the top of a customer quote.',
  input_schema: p.object('Cover letter draft.', {
    content: p.string('Letter body, plain text, ≤ 1000 chars.'),
  }, ['content']),
};

// ---- 8. surplus/line_normalize --------------------------------------------

export const surplus_normalize = {
  tool_name: 'record_lines',
  description: 'Normalize raw surplus inventory lines into categorized records.',
  input_schema: p.object('Container of normalized surplus lines.', {
    lines: p.array('Same order as input lines.', p.object('A normalized line.', {
      index:           p.integer('0-based input index.'),
      normalized_name: p.string('Generic product name, ≤ 80 chars.'),
      category:        p.enum('Unite category.', ['Orthotics', 'Diagnostics', 'PPE', 'Surgical', 'Supplements', 'Other']),
      condition_hint:  p.enum('Condition.', ['new_in_box', 'opened', 'expired', 'unknown']),
      expiry_iso:      p.string('ISO date or null.', { nullable: true }),
      qty:             p.integer('Quantity preserved from input.'),
      gtin:            p.string('GTIN if present, else null.', { nullable: true }),
      flags:           p.array('Risk flags.', p.string('Flag string.')),
    }, ['index', 'normalized_name', 'category', 'condition_hint', 'qty', 'flags'])),
  }, ['lines']),
};

// ---- 9. surplus/valuation -------------------------------------------------

export const surplus_valuation = {
  tool_name: 'record_valuation',
  description: 'Value surplus inventory lines and decide whether to buy each.',
  input_schema: p.object('Container of valuation decisions.', {
    valuations: p.array('Same order as input lines.', p.object('A valuation decision.', {
      index:               p.integer('0-based input index.'),
      decision:            p.enum('Buy or pass.', ['want', 'pass']),
      decision_reason:     p.string('≤ 140 chars.'),
      est_retail_usd:      p.number('Estimated retail.'),
      offer_usd_per_unit:  p.number('Offer per unit.'),
      offer_usd_total:     p.number('Offer total.'),
      confidence:          p.number('0..1.'),
    }, ['index', 'decision', 'decision_reason', 'est_retail_usd', 'offer_usd_per_unit', 'offer_usd_total', 'confidence'])),
  }, ['valuations']),
};

// ---- Registry mapping prompt_key → schema ---------------------------------

export const SCHEMA_BY_PROMPT_KEY = {
  'fathom/extract_action_items': fathom_action_items,
  'fathom/extract_insights':     fathom_insights,
  'digest/ceo_morning_brief':    ceo_digest,
  'vendor/outreach_email':       outreach_email,
  'vendor/recall_notice':        recall_notice,
  'quoting/hts_classify':        hts_classify,
  'quoting/cover_letter':        cover_letter,
  'surplus/line_normalize':      surplus_normalize,
  'surplus/valuation':           surplus_valuation,
};

// ---- Runtime validator ----------------------------------------------------

/**
 * Validate a value against a JSON-Schema-style spec produced by this
 * file. Returns { ok, errors } — never throws.
 */
export function validate(value, schema, path = '$') {
  const errors = [];
  if (!schema) return { ok: true, errors };

  // Allow null when explicitly marked nullable.
  if (value === null && schema.nullable) return { ok: true, errors };

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}: expected string, got ${typeof value}`);
      else if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
      break;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`${path}: expected number, got ${typeof value}`);
      break;
    case 'integer':
      if (!Number.isInteger(value)) errors.push(`${path}: expected integer, got ${value}`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean, got ${typeof value}`);
      break;
    case 'array':
      if (!Array.isArray(value)) { errors.push(`${path}: expected array, got ${typeof value}`); break; }
      value.forEach((item, i) => {
        const r = validate(item, schema.items, `${path}[${i}]`);
        errors.push(...r.errors);
      });
      break;
    case 'object':
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path}: expected object, got ${typeof value}`);
        break;
      }
      for (const req of schema.required || []) {
        if (!(req in value)) errors.push(`${path}.${req}: required field missing`);
      }
      for (const [k, sub] of Object.entries(schema.properties || {})) {
        if (k in value) {
          const r = validate(value[k], sub, `${path}.${k}`);
          errors.push(...r.errors);
        }
      }
      break;
    default:
      break;
  }

  return { ok: errors.length === 0, errors };
}
