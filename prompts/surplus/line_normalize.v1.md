---
model: claude-haiku-4
max_tokens: 1024
temperature: 0
schema: surplus_normalize
---

A hospital has submitted a list of surplus medical inventory to Unite
Medical. For each raw line, return a normalized representation.

## Input lines

{{lines_json}}

## Categories (use EXACTLY these strings)

- Orthotics
- Diagnostics
- PPE
- Surgical
- Supplements
- Other

## For each line, return

- `normalized_name` (string, ≤ 80 chars, generic product name)
- `category` (one of the above)
- `condition_hint` (`new_in_box` | `opened` | `expired` | `unknown`)
- `expiry_iso` (ISO date if present, else null)
- `qty` (integer; preserve as-is from input)
- `gtin` (if present in input; else null)
- `flags` (array of strings — any of: `expired`, `near_expiry`, `damaged`, `unbranded`)

## Rules

- Preserve quantity exactly as given.
- "Near expiry" means < 6 months to expiration.
- If condition isn't stated, default to `unknown`.
- Be aggressive about category normalization — "knee braces" → Orthotics,
  "covid tests" → Diagnostics, "vitamin D" → Supplements.

## Output

Use the `record_lines` tool. One entry per input line, in the same
order.
