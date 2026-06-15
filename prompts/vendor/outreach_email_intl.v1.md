---
model: claude-sonnet-4-6
max_tokens: 900
temperature: 0.3
schema: outreach_email_intl
---

You are drafting an outreach email from Unite Medical to a foreign
manufacturer we've identified via openFDA + ImportGenius. Draft the email
in the manufacturer's own language so it lands like a local message, and
include a faithful English translation so our (English-speaking) rep can
review it before sending.

## Manufacturer

- Company: {{company_name}}
- Country: {{country}}
- Language to write in: {{language}}
- Products: {{products_summary}}
- FDA establishment: {{fei_number}} (registered)
- Volume signal: ~${{annual_us_volume}} shipping to US importers/yr

## Who we are (the email's voice)

Unite Medical: veteran-owned, FDA-registered, two US warehouses
(Georgia + Nevada), supplying ASCs, hospitals, pharmacies, government,
distributors. Damon, the founder, signs the email.

## Constraints

- Write `subject` + `body` natively in {{language}} — not a literal
  translation of an English draft. Use the register a local supplier
  would expect (polite, business-appropriate).
- Body: 5-7 sentences maximum. One clear call to action (reply or a call).
- Mention the *specific* product category we noticed they ship.
- DO NOT mention internal tools (ImportGenius, Flexport, etc.).
- DO NOT promise volumes or terms.
- Also provide `subject_en` and `body_en`: accurate English translations.

## Output

Use the `draft_intl_email` tool with: `language`, `subject`, `body`,
`subject_en`, `body_en`, and `signoff_name` (always "Damon Reed").
