# Tariff & Import Intelligence Pipeline — Concept Brief for Alex
## Feeding the quoting engine live trade intel + turning it into a customer-facing resource

**From:** Damon Reed (CEO)
**To:** Alex (CTO)
**Date:** 2026-07-16
**Status:** Concept for review — dig deeper, scope it, and come back with a build recommendation.

---

## 1. Damon's goal (the why)

Flexport's account emails and market updates are genuinely valuable to Unite: GRI notices, Section 301/232/122 developments, IEEPA refund status, CAPE filings, CPSC eFiling deadlines, UFLPA enforcement, HTS-specific exclusion confirmations. Today that intel lives in my inbox and dies there.

Two goals:

1. **Feed the quoting engine.** The engine's duty/landed-cost math must always reflect the CURRENT tariff reality. When a 301 exclusion appears for an HTS we quote, or a GRI moves ocean rates, our quotes should know before we get burned — or before we overquote and lose a deal.
2. **Become the resource, not just consume it.** Unite finds real value in Flexport's intel emails. Our customers (surgery centers, health systems, distributors) would find the SAME value in a medical-supply-specific version of that intel — sitting behind the quoting engine as a reason to log in, subscribe, and stay. Flexport does this for importers generally; nobody does it for medical supply buyers specifically. That's a moat + retention play.

## 2. What exists today (source material)

- 21 tariff/import intel emails (Apr–Jul 2026) extracted to `Desktop/Unite Medical/Flexport/Tariff_Import_Intel/` as text + 4 attachments (July 2026 Market Update PDF, UFLPA importer guidance, classification template).
- A live worked example: Flexport confirmed a **Section 301 exclusion exists for HTS 6210.10.5010 (China-origin CPE isolation gowns)** — this directly changes the landed cost on the active Greenish gown negotiation. Exactly the kind of event this pipeline must catch and route into quote math.
- Free primary sources already verified live in the repo work: USITC HTS REST (base duty), Federal Register API (301/AD-CVD actions), openFDA suite. Flexport API (bearer key, live in Vercel) for classification confirmations and freight.

## 3. Proposed architecture — three layers (keep them separate)

**Layer 1 — Deterministic rate data (engine math).**
Duty rates, 301 lists/exclusions, Chapter 99, base HTS rates. NEVER sourced from newsletters. Sources: USITC HTS REST + our Chapter 99 pre-filter + Flexport classification API as authoritative confirmation. Emails are the ALERT that something changed — the engine then re-verifies against the primary source. No quote math ever keys off an email.

**Layer 2 — Tariff-intelligence table (new, small build).**
A structured table the desk maintains (and automation appends to):
`date · source · summary · affected_hts[] · affected_origins[] · effective_date · action_needed · status (new/reviewed/applied) · link_to_source`
When a quote line touches an affected HTS/origin, the engine surfaces the note as a flag on the quote ("301 exclusion may apply — desk review"). High value, low complexity.

**Layer 3 — Freshness pipeline (automation).**
1. **Phase 1 (works today, no build):** weekly automated pull of Flexport/CBP/trade emails from Damon's inbox → extract tariff-relevant items → 5-bullet digest to Damon + structured rows staged for the intel table.
2. **Phase 2 (small build):** ingest endpoint — staged rows POST into the quoting DB; flags appear on quotes automatically.
3. **Phase 3 (independence):** subscribe to primary feeds directly — Federal Register API (301/AD-CVD/exclusion notices), CBP CSMS bulletins, USITC change notices — so alerts don't depend on Flexport's marketing cadence. Both free; Federal Register verified live already.

## 4. The customer-facing play (dig into this)

The same intel, repackaged per-customer, becomes a product feature behind the quoting engine:

- **"Tariff & supply intel" panel** on the customer dashboard: items filtered to the HTS codes/categories THEY buy (they already tell us this by quoting/ordering).
- **Quote-level context:** "This quote reflects the new Section 301 exclusion on HTS 6210.10.5010, effective [date]" — turns compliance plumbing into visible customer value and justifies our pricing credibility.
- **Weekly/monthly digest email** to customers (opt-in): medical-supply-specific trade brief — tariff changes, GRI/freight trends, shortage/recall intel (ties into the existing supply-risk monitor + openFDA recall feed already built).
- **Positioning:** Flexport does this for importers broadly. Unite does it for MEDICAL SUPPLY buyers specifically — filtered to their actual purchase categories. Nobody else in our lane does this. It's a login reason, a retention hook, and a credibility signal that supports the sourcing/quoting engine story.

## 5. Scope questions for Alex (what I want your read on)

1. **Intel table schema + quote-flag wiring** — effort estimate? (Feels like a 1-sprint item on top of the existing quote desk.)
2. **Email ingestion** — Hermes can run the weekly pull/digest from my inbox today. Longer term, do we want a dedicated inbox (intel@) that vendors/sources feed, parsed automatically?
3. **Primary-source feeds** — Federal Register API + CBP CSMS polling: what's the cleanest way to wire these as scheduled jobs into the same intel table? Dedupe/noise strategy?
4. **Customer-facing surface** — dashboard panel vs. quote-line flags vs. digest email: what order do you build them, and what does the customer-category → HTS mapping look like given we already have their quote/order history?
5. **The AI layer** — summarizing a CBP bulletin into a structured intel row is exactly an LLM task (we already have Anthropic wired with a budget cap). Where does that live in your architecture — ingest-time or render-time?
6. **What am I missing?** Freight-rate intel (GRIs) also affects quote validity windows — should GRI notices auto-shorten quote expiry on affected lanes?

## 6. Immediate actionable (independent of the build)

- 🔴 **HTS 6210.10.5010 / China — Section 301 exclusion confirmed by Flexport (6/23, Aiyanna Lowery).** Re-run the Greenish CPE gown landed-cost math with the exclusion applied. This is live deal money, don't wait for the pipeline.

---
*Source folder: `Desktop/Unite Medical/Flexport/Tariff_Import_Intel/` (21 extracted emails + July 2026 Market Update PDF + UFLPA guidance + classification template).*
