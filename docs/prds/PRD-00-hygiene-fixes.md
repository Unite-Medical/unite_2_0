# PRD-00 — Hygiene & Truthfulness Fixes

**Source:** Audit of `unite_2_0` against `Unite_Medical_CTO_Brief.docx` (May 2026)
**Owner:** Alex (CTO)
**Status:** draft
**Repo:** `unite_2_0`
**Depends on:** nothing
**Blocks:** safe to launch *or* land any further code changes

> The existing `docs/PRD.md` Phase 1–4 verifier reports PASS, but the
> audit caught a handful of real issues that slip past the regex
> checks because they live in JS object literals, admin-only pages, or
> sub-fields. This PRD closes them all in one short pass.

---

## 1. North star

The site says nothing that isn't true. Internal tooling names don't leak.
Domains, warehouses, emails, and certification language are all consistent
with the brief and with reality.

---

## 2. Scope

### In scope

- The 11 concrete findings from the May 2026 audit (§3 below)
- Extend `scripts/phase_check.py` so each of those can't regress

### Out of scope

- Anything that requires a backend or external API (all deferred to
  later PRDs)
- Adding new copy — this is strictly a cleanup pass

---

## 3. Findings & fixes

### 3.1 Ghost "Dallas, TX" warehouse in seeded data

**File:** `src/lib/seed.js`

- Line 81: `wh_dal` entry has `city: 'Dallas', state: 'TX'` AND a
  mis-labeled `name: 'Reno, NV'`
- Line 183: order shipments still rotate through `wh_dal`
- Line 271: inventory loop seeds a `wh_dal` row for every product

**Fix:**

- Delete the `wh_dal` warehouse entry entirely
- Update line 183 ship-from rotation to `['wh_atl', 'wh_reno']` (no
  `wh_dal`)
- Remove the third inventory insert (line 271) that targets `wh_dal`
- Verify no other code references `'wh_dal'` (`rg "wh_dal" src/`)

### 3.2 `.com` email addresses surviving in code

Per the existing PRD §3.1, everything must be `@unitemedical.net`.

| File | Line(s) | Current | Replace with |
|---|---|---|---|
| `src/lib/seed.js` | 99 | `damon@unitemedical.com` | `damon@unitemedical.net` |
| `src/lib/seed.js` | 100 | `ops@unitemedical.com` | `ops@unitemedical.net` |
| `src/pages/Login.jsx` | 41, 44, 103 | `damon@unitemedical.com` | `damon@unitemedical.net` |
| `src/pages/legal/Legal.jsx` | 57, 59 | `privacy@unitemedical.com` | `privacy@unitemedical.net` |
| `src/pages/OrderSuccess.jsx` | 111 | `${first}@unitemedical.com` | `${first}@unitemedical.net` |
| `docs/multi-agent-stack.md` | 107 | `support@unitemedical.com` | `support@unitemedical.net` |

### 3.3 Internal tooling names leaking into admin UI

The existing PRD §3.1 forbids `ShipStation`, `Cin7`, `Flexport`, `QBO`
in customer-facing code. Admin pages are technically internal but the
audit flagged two cases that should be sanitized for safety (a logged-in
customer with admin role accidentally toggled to could see them):

| File | Line | Current | Replace with |
|---|---|---|---|
| `src/pages/admin/AdminOverview.jsx` | 48 | `our billing system · SHIPSTATION · STRIPE` | `BILLING · SHIPPING · PAYMENTS` |
| `src/pages/admin/AdminOrders.jsx` | 80 | `Sync our WMS + Cin7` | `Sync warehouse` |

### 3.4 "SDVOSB partner" phrasing — DECIDED: keep precise

The existing PRD §3.1 forbids self-claimed VOSB / SDVOSB. The audit
flagged 8 surviving uses that frame the BPA as held "via authorized
**SDVOSB partner**". Legally this is third-party-attributed (not a
self-claim).

Locations: `About.jsx:30`, `Procurement.jsx:28,38,60`, `Government.jsx:11,21,91`,
`Compliance.jsx:19`.

**Decision (2026-05-27, Damon):** **Keep precise** — the phrasing is
accurate (Unite is not the SDVOSB; the partner is). No code changes.

Verifier note: `phase_check.py` continues to forbid bare `VOSB` and
`SDVOSB` *self-claims*, but `via authorized SDVOSB partner` is an
allowed phrasing. The current Phase 1 forbidden-string rules already
match standalone `VOSB`/`SDVOSB` but pass the "partner" framing — no
verifier change needed for this item.

### 3.5 Verifier extensions

Update `scripts/phase_check.py`:

- Add `Dallas` (with or without comma) to Phase 1 forbidden strings,
  scoped to `src/` so the PRD doc itself is exempt.
- Add `wh_dal` as a forbidden identifier in `src/lib/seed.js`.
- Add `@unitemedical.com` (case-insensitive) as a forbidden string.
- Re-run `python3 scripts/phase_check.py --strict` — must PASS.

---

## 4. Phases

| Phase | Title | Exit criteria |
|---|---|---|
| 1 | Data layer cleanup | `wh_dal` gone from `seed.js`; `rg "wh_dal"` returns nothing |
| 2 | Email-domain sweep | `rg "@unitemedical\.com"` returns nothing in `src/`; verifier blocks regressions |
| 3 | Admin sanitize | Tooling names hidden from `AdminOverview.jsx` + `AdminOrders.jsx` |
| 4 | SDVOSB decision | Damon picks "keep precise" vs. "soften"; copy updated to match |
| 5 | Verifier hardening | `phase_check.py --strict` PASS with new rules added |

---

## 5. Open questions

1. **SDVOSB phrasing** — see §3.4. Default if no answer in 5 business
   days: soften to "via authorized partner".
2. Should admin pages be considered customer-facing for verifier
   purposes? Recommendation: **yes**, because role drift happens. PRD-14
   formalizes admin-vs-customer surface.

---

## 6. Out-of-band

None. This PRD is entirely code/copy edits.

---

## 7. Definition of done

- `python3 scripts/phase_check.py --strict` PASS with the new rules
- `npm run lint` clean
- `npm run build` succeeds
- One commit per phase, all reviewed
- Damon signs off on the SDVOSB decision (§3.4)
