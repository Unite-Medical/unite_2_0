# PRD-31 — PDAC Intelligence: Productizing the Consulting Practice

**Source:** AI-leverage strategy session (Alex + Hermes, 2026-07) — "convert
Damon's #1-ranked PDAC expertise from billable hours into software margin +
recurring revenue."
**Owner:** Alex (CTO) · Damon as domain expert / reviewer-of-record
**Status:** draft / proposed
**Depends on:** PRD-11 (AI layer — client, prompt registry, strict schemas),
PRD-17 (PDF pipeline — branded report delivery), PRD-09 (Stripe — checkout),
PRD-30 (telemetry conventions; shared outcome-labeling patterns).
**Blocks:** nothing — pure additive revenue stream.

> The strategic context: DME reimbursement is compressing under competitive
> bidding. When margins compress, coding correctness stops being paperwork and
> becomes survival — a denied claim at 15% margin is a catastrophic loss. Demand
> for PDAC/coding help is *counter-cyclical* to the industry's distress. Unite
> already owns the #1 Google rank for "PDAC consulting." This PRD adds a
> checkout, a classifier, and a subscription to traffic we already get for free.

---

## 1. North star

Turn `/services/pdac` from a consulting lead-form into a **three-tier product
ladder**:

1. **Free instant code-check** (lead magnet) — paste a product description, get
   the most-likely HCPCS code family in seconds. Email-gated full result.
2. **Paid PDAC Readiness Assessment** (product, human-in-loop) — upload product
   documentation, receive a scored, branded report: candidate codes, descriptor
   fit, coverage criteria, documentation gaps, risk flags. **Damon reviews every
   report before delivery** — his judgment is the product; the AI does the first
   90% of the reading.
3. **Coding Watch subscription** (recurring) — continuous monitoring of the
   codes/policies a customer's product line depends on; alerts when a fee
   schedule, LCD, or PDAC coding bulletin changes something that affects them.

Success = consulting revenue per Damon-hour goes up (he reviews instead of
researches), plus a monthly-recurring line that compounds.

---

## 2. Why we can build this (assets in hand)

| Asset | Where |
|---|---|
| #1 organic rank for "PDAC consulting" — free demand | `/services/pdac` |
| AI client + prompt registry + strict JSON-schema tool use | `src/lib/ai/` (PRD-11) |
| FDA/HTS classification prompts already working | `quoting/fda_classify` |
| Branded PDF report pipeline | `src/lib/pdf.js`, `src/lib/documents.js` (PRD-17) |
| Stripe checkout + invoicing | PRD-09 |
| Damon's determination history (proprietary edge) | his files — needs ingestion sign-off |
| **Public labeled ground truth** | see §3 — this is the unlock |

---

## 3. The data moat: public corpora nobody bothers to use

All of the following are public and legally ingestible. Together they form both
the RAG corpus and — critically — **labeled evaluation data**:

| Corpus | What it gives us | Access |
|---|---|---|
| **DMECS** (DME Coding System, Palmetto GBA) | The database of *actual PDAC code determinations* — verified product→HCPCS pairs. This is labeled ground truth for the classifier. | Public search; build a respectful scraper/ingester |
| **HCPCS Level II code set + long descriptors** | The label space | CMS, quarterly files |
| **LCDs/NCDs + Policy Articles** (CMS Medicare Coverage Database) | Coverage criteria per code — what documentation a claim needs | Public API/downloads |
| **DMEPOS fee schedules** | Reimbursement per code per jurisdiction — lets the report say what a code is *worth* | CMS, quarterly |
| **PDAC coding bulletins / correct-coding advisories** | The "case law" — how the contractor actually reasons | Public |
| **Competitive-bid single payment amounts** | Bid-area pricing reality | CMS |
| Damon's past engagements | Proprietary reasoning layer; few-shot exemplars | Requires his sign-off (§10) |

**The evaluation gate this enables:** hold out N hundred DMECS determinations;
the classifier must hit agreed accuracy (§7 Phase 2 exit: top-3 code-family
accuracy ≥ 90%, top-1 ≥ 75% on holdout) before anything is sold. We can state
honestly in marketing: "validated against the public determination record."

---

## 4. Product design

### 4.1 Free instant code-check (the funnel mouth)
- Widget embedded on `/services/pdac` (and `/resources/coding`): textarea for a
  product description (+ optional materials/intended-use fields).
- Returns: top code family + confidence band + one-line descriptor fit, with the
  full candidate list + reasoning **email-gated** (creates a CRM lead, feeds the
  nurture sequence).
- Rate-limited, cached, cheap model tier. Every query is demand telemetry:
  which product categories are people trying to code? (→ content + catalog
  signals).

### 4.2 PDAC Readiness Assessment (the product)
**Flow:** upload docs (spec sheet, 510(k) summary if any, materials, photos,
intended-use statement) → pipeline runs → **Damon review queue** → branded PDF
delivered + 30-min readout call (upsell to full consulting when it's complicated).

**Report contents (the deliverable):**
1. Candidate HCPCS codes ranked, with descriptor-by-descriptor fit analysis
   (which clause of the code descriptor the product does/doesn't satisfy).
2. Applicable LCD/Policy-Article coverage criteria + the documentation checklist
   a supplier would need for clean claims.
3. Fee-schedule context: what each candidate code reimburses in the customer's
   jurisdictions; competitive-bid exposure flag.
4. Risk flags: descriptor mismatches, benefit-category problems, "verification
   required before billing" items, precedent determinations from DMECS that
   resemble this product (citations).
5. Verdict: READY / GAPS (with fix list) / UNLIKELY (with reasoning) + a
   Damon-signed reviewer note.

**Human-in-the-loop is non-negotiable:** the admin review queue
(`/admin/pdac`) shows the draft report with every claim linked to its source
(DMECS record, LCD section, bulletin). Damon approves/edits/rejects. Target:
his review takes 20–30 min instead of the 4–6 h the research takes today.

### 4.3 Coding Watch (the recurring revenue)
- Customer subscribes per product line (list of HCPCS codes + product keywords).
- Nightly diff job over the corpora in §3 (fee schedules, LCD revisions, PDAC
  bulletins, competitive-bid updates).
- Material changes → AI-drafted plain-English alert ("L0650 SPA dropped 12% in
  Round 2029 areas; your GA volume is affected") → **review-gated** send.
- Quarterly portfolio report auto-generated per subscriber.
- This is the same standing-agent pattern as the recall monitor (PRD-07 Phase 4)
  pointed at a different corpus — most of the machinery exists.

### 4.4 Pricing (defaults — Damon decision D-17)
| Tier | Price (default, confirm) | COGS |
|---|---|---|
| Instant check | Free (email-gated) | ~$0.01/query |
| Readiness Assessment | $1,495 per product | AI pennies + ~30 min Damon |
| Assessment 3-pack | $3,495 | — |
| Coding Watch | $199/mo per product line | near-zero marginal |
| Full consulting engagement | Current hourly/project rates (unchanged) | the upsell target |

---

## 5. Architecture

```
INGEST (scripts/pdac/ingest_*.py, scheduled)
  DMECS scraper → dmecs_determinations table (product, code, date, rationale)
  CMS HCPCS/fee/LCD downloads → normalized corpus tables
  PDAC bulletins → chunked + embedded

INDEX
  Embeddings + BM25 hybrid over corpus chunks (pgvector on the existing Neon DB)
  Structured tables queried directly (fee schedules, code set)

CLASSIFY + DRAFT (src/lib/ai/ prompts, strict schemas — existing pattern)
  pdac/code_candidates   → ranked codes + descriptor-fit rationale (schema-validated)
  pdac/coverage_map      → LCD criteria + documentation checklist
  pdac/risk_flags        → mismatches, precedent conflicts (with DMECS citations)
  pdac/watch_alert       → plain-English change alert (Coding Watch)
  Confidence gating: low-confidence → flagged prominently in Damon's queue

REVIEW + DELIVER
  /admin/pdac review queue → approve/edit → pdf.js branded report → Stripe-gated
  download + email delivery (Resend)

EVAL (scripts/pdac_eval.py — CI gate)
  Frozen DMECS holdout; top-1/top-3 accuracy + citation-validity checks;
  regression-blocks any prompt/model change that drops accuracy
```

New tables (`0020_pdac.sql`): `pdac_assessments`, `pdac_reports`,
`dmecs_determinations`, `pdac_corpus_chunks`, `pdac_watch_subscriptions`,
`pdac_watch_alerts`.

---

## 6. Compliance & legal guardrails (hard requirements)

- **Disclaimers everywhere:** this is coding *analysis*, not legal advice, not a
  guarantee of a PDAC determination, not Medicare billing advice. Counsel
  reviews the disclaimer + terms before launch.
- **No customer-facing output without human review** (assessments) or explicit
  review-gating with opt-down (watch alerts, after 90 days of clean operation).
- **Citations required:** every claim in a report links to its source document.
  The eval suite fails reports containing uncited assertions.
- **No PHI** — product data only; say so in the upload UI.
- Marketing language: "validated against the public determination record" — never
  "approved by PDAC/CMS."

---

## 7. Phases

### Phase 1 — Corpus + ingestion
DMECS ingester, CMS downloads, embedding index on Neon. **Exit:** corpus tables
populated; spot-check 50 DMECS records for fidelity; nightly refresh job green.

### Phase 2 — Classifier + eval harness
`pdac/code_candidates` prompt + schema; `scripts/pdac_eval.py` with frozen
holdout. **Exit: top-3 code-family accuracy ≥ 90%, top-1 ≥ 75% on the DMECS
holdout; citation-validity 100%.** No sales before this gate.

### Phase 3 — Free instant check on /services/pdac
Widget + email gate + CRM lead wiring + rate limiting. **Exit:** live on the
page; leads land in CRM; cost per query < $0.02.

### Phase 4 — Paid assessment pipeline
Upload flow, full report draft (coverage + fees + risks), `/admin/pdac` review
queue, PDF delivery, Stripe checkout. **Exit:** one end-to-end paid assessment
delivered (can be a friendly customer); Damon review time ≤ 45 min.

### Phase 5 — Coding Watch
Diff job, alert drafting, subscription billing (Stripe), quarterly report.
**Exit:** first paying subscriber; one true-positive alert shipped.

### Phase 6 — Scale & content flywheel
Anonymized aggregate insights → SEO content ("2029 competitive-bid impact by
code family") reinforcing the #1 rank; assessment→consulting upsell tracking.

---

## 8. Verifier

`scripts/pdac_check.py` (CI):
- Eval-gate accuracy thresholds hold on the frozen holdout (Phase 2 numbers).
- Every generated report artifact: all citations resolve to a corpus document.
- Corpus freshness: newest fee-schedule/LCD snapshot < 35 days old.
- Disclaimer text present in every report template + page footer.
- Stripe products/prices exist and match the pricing table.

---

## 9. Business metrics (review monthly)

- `/services/pdac` visitor → free-check conversion; free-check → email capture.
- Email → paid assessment conversion; assessments/month; revenue per
  Damon-review-hour (target ≥ 4× current consulting realization).
- Coding Watch MRR + churn; alert precision (subscriber-rated).
- Assessment → full-consulting upsell rate.

---

## 10. Open questions (Damon)

1. **D-17 pricing** — confirm/adjust the §4.4 defaults.
2. Can his historical engagement files be ingested as few-shot exemplars
   (client-confidential material — likely needs anonymization)?
3. Review SLA he'll commit to (proposal: 3 business days per assessment).
4. Counsel review of disclaimers/terms — who and when.
5. Does he want his name/signature on reports (recommended: yes — the brand IS
   the moat) or a firm signature?

---

## 11. Out of scope (v1)

- Filing PDAC verification applications on the customer's behalf (v2 — natural
  upsell once volume proves out).
- Medicare claim/billing advice or appeals support.
- Non-DMEPOS coding (CPT etc.).
- Fully-automated (no-review) assessments — revisit only with 6+ months of
  accuracy data.

---

## 12. Definition of done

- Free check live on the #1-ranked page, feeding CRM.
- Eval gate ≥ thresholds, enforced in CI, on public ground truth.
- Paid assessments delivering branded, citation-complete, Damon-reviewed
  reports through Stripe.
- Coding Watch billing monthly with review-gated alerts.
- Damon's revenue per hour of PDAC work measurably up; a recurring-revenue line
  exists that did not exist before.
