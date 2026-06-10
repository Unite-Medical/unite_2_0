# Prompt registry

This is the **canonical home** for every Claude prompt that runs in
production. Every Anthropic call goes through `src/lib/ai/client.js`,
which loads a prompt from this directory by registry key.

## Conventions

- Filenames are `<name>.v<n>.md`. Bumping the version requires running
  the eval harness (`scripts/ai_evals.py`, when it lands) and
  documenting the metric change.
- Each prompt has YAML frontmatter:

  ```yaml
  ---
  model: claude-sonnet-4-6     # or claude-haiku-4 for cheap throughput
  max_tokens: 2048
  temperature: 0.2
  schema: ../schemas/<thing>.ts  # Zod schema for the tool-use response
  ---
  ```

- Prompt body is plain markdown. Mustache-style `{{placeholders}}` are
  substituted by the client.
- Promoting `v1 -> v2`: leave `v1` in place until the next deploy
  cycle. We never break old prompt versions.

## Index

| Key | File | Used by | Model |
|---|---|---|---|
| `fathom/extract_action_items` | `fathom/extract_action_items.v1.md` | PRD-05 Phase 2 | Sonnet |
| `fathom/extract_insights` | `fathom/extract_insights.v1.md` | PRD-05 Phase 2 | Sonnet |
| `digest/ceo_morning_brief` | `digest/ceo_morning_brief.v1.md` | PRD-05 Phase 5 | Sonnet |
| `vendor/outreach_email` | `vendor/outreach_email.v1.md` | PRD-07 Phase 5 | Sonnet |
| `vendor/recall_notice` | `vendor/recall_notice.v1.md` | PRD-07 Phase 4 | Sonnet |
| `quoting/hts_classify` | `quoting/hts_classify.v1.md` | PRD-08 Phase 2 | Sonnet |
| `quoting/cover_letter` | `quoting/cover_letter.v1.md` | PRD-08 Phase 5 | Sonnet |
| `surplus/line_normalize` | `surplus/line_normalize.v1.md` | PRD-10 Phase 2 | Haiku |
| `surplus/valuation` | `surplus/valuation.v1.md` | PRD-10 Phase 2 | Sonnet |

## Adding a new prompt

1. Write the prompt body. Keep it under 2k tokens of *prompt* (your
   input data can be larger). Use markdown headings to structure.
2. Author the matching Zod schema in `src/lib/ai/schemas.js`. The
   client validates every response against it.
3. Register the key in `src/lib/ai/registry.js`.
4. Author an eval set in `scripts/ai-evals/<key>/` with at least 5
   labeled inputs + expected-output assertions.
5. Run `python3 scripts/ai_evals.py --prompt <key>` and document the
   baseline metrics.
