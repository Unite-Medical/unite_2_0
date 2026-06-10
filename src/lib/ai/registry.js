/**
 * Prompt registry — PRD-11.
 *
 * Every Anthropic call routes through `client.run(key, ...)`. This
 * file lists the known keys + their files so the registry is the
 * single source of truth (no inline prompts anywhere else).
 *
 * Each entry holds the prompt-file URL (browser fetches via Vite
 * import.meta.glob; backend reads from disk).
 */

// Vite resolves these as static assets at build time.
// In a backend (PRD-01), we'd swap this for fs.readFileSync.
const promptUrls = import.meta.glob('../../../prompts/**/*.v*.md', {
  query: '?raw',
  import: 'default',
  eager: false,
});

export const PROMPT_REGISTRY = {
  // ---- PRD-08 quoting ----
  'quoting/cover_letter': { path: 'quoting/cover_letter.v1.md', model: 'claude-sonnet-4-6', maxTokens: 800, temperature: 0.3 },
  'quoting/hts_classify': { path: 'quoting/hts_classify.v1.md', model: 'claude-sonnet-4-6', maxTokens: 1024, temperature: 0 },

  // ---- PRD-05 fathom ----
  'fathom/extract_action_items': { path: 'fathom/extract_action_items.v1.md', model: 'claude-sonnet-4-6', maxTokens: 2048, temperature: 0 },
  'fathom/extract_insights': { path: 'fathom/extract_insights.v1.md', model: 'claude-sonnet-4-6', maxTokens: 2048, temperature: 0.1 },

  // ---- PRD-05 digest ----
  'digest/ceo_morning_brief': { path: 'digest/ceo_morning_brief.v1.md', model: 'claude-sonnet-4-6', maxTokens: 1500, temperature: 0.2 },

  // ---- PRD-07 vendor ----
  'vendor/outreach_email': { path: 'vendor/outreach_email.v1.md', model: 'claude-sonnet-4-6', maxTokens: 600, temperature: 0.3 },
  'vendor/recall_notice': { path: 'vendor/recall_notice.v1.md', model: 'claude-sonnet-4-6', maxTokens: 800, temperature: 0.1 },

  // ---- PRD-10 surplus ----
  'surplus/line_normalize': { path: 'surplus/line_normalize.v1.md', model: 'claude-haiku-4', maxTokens: 1024, temperature: 0 },
  'surplus/valuation': { path: 'surplus/valuation.v1.md', model: 'claude-sonnet-4-6', maxTokens: 2048, temperature: 0.1 },
};

/**
 * Load the raw prompt body for a registry key.
 * Strips the YAML front matter; returns the markdown body.
 */
export async function loadPrompt(key) {
  const entry = PROMPT_REGISTRY[key];
  if (!entry) throw new Error(`Unknown prompt key: ${key}`);

  const url = `../../../prompts/${entry.path}`;
  const loader = promptUrls[url];
  if (!loader) {
    throw new Error(`Prompt file not found in registry glob: ${entry.path}`);
  }
  const raw = await loader();
  // Strip YAML front matter ( ---\n...---\n )
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) return fmMatch[2].trim();
  return String(raw).trim();
}
