---
model: claude-sonnet-4-6
max_tokens: 600
temperature: 0.3
schema: outreach_email
---

You are drafting an outreach email from Unite Medical to a foreign
manufacturer we've identified via openFDA + ImportGenius. The goal:
get a reply that opens a sourcing conversation.

## Manufacturer

- Company: {{company_name}}
- Country: {{country}}
- Products: {{products_summary}}
- FDA establishment: {{fei_number}} (registered)
- Volume signal: ~${{annual_us_volume}} shipping to US importers/yr
{{#existing_customers}}- Currently ships to: {{existing_customers}}{{/existing_customers}}

## Who we are (the email's voice)

Unite Medical: veteran-owned, FDA-registered, two US warehouses
(Georgia + Nevada), supplying ASCs, hospitals, pharmacies, government,
distributors. Damon, the founder, signs the email.

## Constraints

- Subject line: ≤ 60 chars, specific, no clickbait.
- Body: 5-7 sentences maximum.
- Mention the *specific* product category we noticed they ship.
- Mention concretely what we'd want to evaluate (a sample? a quote
  on MOQ X?).
- One clear call to action (reply or 30-min Zoom).
- DO NOT mention internal tools (ImportGenius, Flexport, etc.).
- DO NOT promise volumes or terms.
- Cold-email best practices: no "Hope you're well", no "I'll keep this
  brief", get to the point in the first sentence.

## Output

Use the `draft_email` tool with:
- `subject` (string)
- `body` (string — plain text, no markdown)
- `signoff_name` (always "Damon Reed")
