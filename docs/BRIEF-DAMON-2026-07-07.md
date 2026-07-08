# Damon — Status Brief

**From:** Alex · **Date:** July 7, 2026
**TLDR:** Everything is merged to `main` and pushed. Seven of the eight §8 checks from your quoting-engine briefing are built, tested, and passing — 32 automated tests plus all four compliance checkers are green — and the eighth (the vendor dashboard hook) has its foundation in place. The redesign and the PRD-28/29 copy sweep are in the same push, including your MSPV BPA correction applied site-wide. Below: what's live, what it does, and the calls I need from you.

---

## 1. What went live in this push

One merge to `main` containing three bodies of work:

1. **The "Precision" redesign** — full visual system replacement across all 49 pages. Bone paper, surgical green, serif display, mono data layer. The AI-startup tells (gradient shimmer text, glass, orbs) are gone. There's now a written brand & voice guideline: `docs/BRAND-VOICE-GUIDELINES.md`.
2. **PRD-28/29 copy compliance** — the honest-copy sweep (single Georgia warehouse, no fake roles/counts, retired phone numbers, `.net` emails). Machine-enforced: the build fails if forbidden copy reappears.
3. **The vendor-onboarding / quoting-engine build** — your briefing, end to end. Detail below.

I also reconciled your two June 29 commits during the merge: **MSPV BPA 36C24123A0077** is now the only contract number anywhere on the site (nav, homepage, government page, printed quotes/invoices, meta tags), labeled "MSPV BPA" as you specified. The BPA-number conflict from my last handback is closed.

## 2. Your §8 checks — seven built and tested, one scoped

| Your check | Status | What's actually there |
|---|---|---|
| 1. Field mapping vs v2 template | ✅ | Parser ingests all 53 columns — compliance, logistics, carton dims, price breaks, tooling. Fuzzy header matching + AI fallback for messy vendor sheets. |
| 2. Flexport API coverage | ✅ | Freight quoting (LCL/FCL/AIR) plus a new classification call. Origin port now comes from the vendor's sheet (was hardcoded), and freight math uses real carton dimensions (was a guess). |
| 3. Free validation layer | ✅ | USITC HTS lookup + openFDA (device class, 510(k), establishment reg, recalls) run before any paid call. Result: free APIs pre-fill, Flexport confirms. |
| 4. Auto-export to Flexport template | ✅ | One click on the quote screen produces the classification file in Flexport's exact column layout. No more manual re-keying. |
| 5. SKU-match engine | ✅ | Every uploaded line is checked against our catalog — exact and fuzzy. In-stock hits show a "buy now" badge on the quote itself. |
| 6. Two private-label paths | ✅ | Every quote line now carries side-by-side offers: **Unite Ready** (stock or import) and **Unite Custom** (private label, tooling amortized across the order qty, sample cost/lead shown). |
| 7. No-quote feedback loop | ✅ | Anything we can't quote — unmatched shortage-list lines, unparseable rows, dropped lines — is captured as a demand signal with a reason code and a desk queue to resolve it. Nothing evaporates anymore. |
| 8. Vendor dashboard hook | ◐ | Foundation is in (parse-quality scoring, miss signals). The motivational dashboard itself is designed but not built — candidate for next sprint, see §4. |

Two bugs from the audit worth knowing about, both fixed:

- **The duty bug:** when a vendor left `hts_code` blank, the engine silently defaulted to a generic textile code and quoted the wrong duty. It now uses the manufacturer's HS code as a hint, flags the line **HTS PENDING**, and the desk confirms via classification before the quote is final.
- **Section 301 was missing entirely.** China-origin goods were being quoted without the 25%/7.5% surcharges — on a Class II device from Shenzhen that's the difference between a winning quote and a money-losing one. A Chapter 99 pre-filter now applies List 1–4A rates automatically.

## 3. Verification

- **32 automated tests** (`npm test`) covering the parser, 301 duty math, offer variants, the exporter, the miss loop, and a full end-to-end quote run — all passing.
- **Four compliance checkers** (copy rules, PRD requirements, quoting invariants, consignment/ordering/WMS) — all passing, 45/45 checks.
- **Lint clean, production build clean** — 122 routes prerendered.

## 4. What we can do next — your call on priority

1. **Vendor dashboard "hook" (check #8, the unfinished one).** Data-quality score per vendor, quote-win feedback, multilingual UI (zh/vi/es). This is the retention play from your briefing — my pick for next.
2. **Live Flexport credentials.** Everything runs against a faithful local stub today; the real API is one env var away. Needs the account/keys from you.
3. **GUDID templates + FDA listing flow** — the compliance-as-a-service piece from your notes. Class I/II templates exist in your docs; wiring them into vendor onboarding is a ~1-sprint build.
4. **Quote-miss digest.** The demand signals are being captured; a weekly roll-up ("we failed to quote $X across N lines, top reasons") would turn it into a sourcing to-do list.
5. **Pentastar pilot.** The Unite Custom offer path is exactly the machinery the pilot needs; we can run their line sheet through it as a real-world shakedown.

## 5. Decisions / items I need from you

1. **Flexport API credentials** — needed to take item 2 in §4 live.
2. **Confirm the inboxes** `privacy@`, `billing@`, `surplus@unitemedical.net` exist — they appear in customer-facing copy. Otherwise I route them to support@/accounting@.
3. **Priority order for §4.** My recommendation: dashboard hook → miss digest → GUDID.
4. **Deployment:** `main` is pushed and ready; say the word if you want it promoted to production hosting now versus after you click through the new quote flow.
