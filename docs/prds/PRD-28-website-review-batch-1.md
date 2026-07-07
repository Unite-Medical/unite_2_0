# PRD-28 — Website Review Batch 1: Copy Corrections, Bug Fixes & New Builds

**From:** Damon Reed (CEO)
**To:** Alex (CTO)
**Date:** 2026-06-30
**Status:** Ready for implementation
**Source of record:** `docs/DAMON-PLATFORM-ADDITIONS.md` (running tracker — this PRD consolidates the page-by-page review of Batch 1 into an actionable spec)

---

## 0. Purpose & how to use this doc

Damon completed a page-by-page review of the live site (`unite-2-0.vercel.app`). This PRD turns that review into implementation-ready work. Every item is either:

- **[COPY]** — approved text/data change, copy is provided verbatim. Low risk, just apply.
- **[BUG]** — defect to fix.
- **[BUILD]** — new feature/structure requiring engineering + a capability decision.
- **[DELIVERABLE]** — an asset (already produced or to produce).

Each item lists the **file**, the **change**, and **acceptance criteria**. Approved copy is quoted in `>` blocks — use it as-is unless flagged "agent to finalize."

**Truthfulness standard (applies to everything):** never publish a claim the business can't substantiate. This entire review was driven by removing fabricated/overclaimed content. When in doubt, soften or omit — don't invent.

---

## 1. Global standards (apply site-wide)

### 1.1 [BUILD] Veteran status — strict rule
- ✅ "Veteran-owned" and "veteran-owned small business" are BOTH allowed (true, self-claimable, beneficial in supplier-diversity/bids). Damon = Alabama Army National Guard, honorable discharge, DD214, ID.me Military verified 12/14/2020.
- ❌ NEVER claim the formal **VOSB/SDVOSB certification** or a **Unite-held federal set-aside** — Damon does not hold that cert.
- The **SDVOSB is a partner** who holds the MSPV set-aside; **Unite/Medava is the brand/supplier behind them.**
- "MSPV BPA · via authorized SDVOSB partner" phrasing is accurate everywhere it appears — keep it.

### 1.2 [COPY] Email standardization
Use **`support@unitemedical.net`** for all site email instances **except** where a real functional inbox is warranted (`accounting@` kept). Sweep the codebase for `info@` and `sales@` and route to `support@` unless Alex has a real routing reason. (`info@` is a real inbox but unused by preference.)

### 1.3 [COPY] RegeniCool™ trademark — site-wide rule
Always render **RegeniCool™** with the ™ symbol. Current occurrences to fix (4):
- `src/pages/About.jsx` ~37
- `src/pages/Compliance.jsx` ~27
- `src/data/faqs.js` ~32
- `src/pages/ServicePDAC.jsx` ~67

All read "RegeniCool Pro" → **"RegeniCool™ Pro"**. Apply to all future copy too.

### 1.4 [BUILD] IP-protection rule — sell capability, not mechanism
Customer-facing copy sells the **outcome** ("compliance-checked," "all-in landed price"), never the **recipe** (no "validate FDA codes / pull live USITC duty rates / compare LCL vs FCL freight / 6-component landed cost / Claude letter"). Audit and scrub method-level detail from: `QuoteNew.jsx`, `Quote.jsx`, `ShortageMatch.jsx`, Services source-card. Detailed pipeline stays in internal/CTO docs only.

### 1.5 [COPY] "Landed cost" scoping
"Landed cost" language is CORRECT in the sourcing/quoting flow (Quote, QuoteNew, PortalQuote, ShortageMatch, Services source-card, WMS/quoting internals). It is WRONG on stocked/wholesale goods (Unite is a wholesaler by design). Don't strip it from the sourcing path; don't apply it to stocked catalog.

### 1.6 [COPY] Warehouse footprint
Single **Lithia Springs, GA** warehouse. No Nevada/Las Vegas/Reno/two-warehouse/both-coasts anywhere in customer copy. (See C1 — one straggler still live on the homepage.)

---

## 2. CRITICAL bugs & errors (do first)

### 2.1 [BUG] Stale/placeholder FDA number on customer documents — `src/lib/documents.js` ~27
`FOOTER_TEXT` contains a **placeholder FDA number `#3012345678`** — appears on quotes/invoices. Must be **FDA 3015727296**. This is a real error on customer-facing documents. **Highest priority.**

### 2.2 [BUG] Homepage "Las Vegas, NV" warehouse — `src/pages/Homepage.jsx` ~427
The `OwnedInventory` band still says: `'2', 'Warehouses', 'Lithia Springs, GA and Las Vegas, NV — coverage on both coasts.'` This was missed in the Nevada→GA sweep (commit `d74325b`). Fix to a single Georgia warehouse; drop "both coasts" / "Las Vegas, NV". (Part of the broader C1 rework — see §6.1.)

### 2.3 [BUG] Homepage product rail won't scroll on desktop mouse — `Homepage.jsx` ~272 + `src/index.css` ~464
`.um-rail` is a horizontal scroller with the scrollbar hidden (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`). Works on trackpad/touch but reads as broken on a plain mouse. **Fix:** add a real affordance — recommend **prev/next arrow buttons** (scroll one card). Acceptable alternates: map vertical wheel→horizontal on hover, click-drag, or at minimum a thin scrollbar.

### 2.4 [BUG] Homepage "IN STOCK" badge hardcoded — `Homepage.jsx` ~329–339
Every featured-rail card shows "IN STOCK" unconditionally, not checking inventory — substantiation risk. **Fix:** wire to the same real availability data `Catalog.jsx` uses (`availability` / WMS projection on-hand−reserved). The homepage "Live Inventory" widget already reads real WMS data, so the hook exists. Make the badge conditional or drop it on unverified items. (Ties to the 3-state model in §5.1.)

### 2.5 [BUG] Contact segment-tagging logic — `src/pages/Contact.jsx` ~57
Logic matches `form.reason.toLowerCase().includes('dealer')` but the reason option is "Distributor program" (no "dealer"). Distributor leads mis-tag as `asc`. **Fix:** match on `'distributor'`.

---

## 3. Page copy corrections (approved — apply verbatim)

### 3.1 [COPY] About page — `src/pages/About.jsx`

**Hero sub** — REPLACE with:
> Built by a veteran supply-chain operator and a practicing physician — the medical supply partner the industry was missing.

**Hero headline** — KEEP "Built on discipline. Driven by demand."

**Leadership bios** — keep INITIALS (Damon R. / Jackie S.).

**Jackie's bio — CONTINGENCY (note for Alex):** may need to be removed entirely. Jackie's employer is Kaiser Permanente; if they push back on her being listed as Unite co-owner/co-founder, we pull it. Build the leadership section so a single leader can be cleanly removed without breaking layout; don't hard-bake "co-founder" anywhere painful to undo.

**People section — add company descriptions** (Damon's bio name-drops these without explaining them). Add a brief "Unite family of companies" block:
> **Unite Pharma** — A multi-state licensed wholesale pharmacy and FDA-registered third-party logistics (3PL) provider.
>
> **Clyne Health** — An AI-powered concierge medicine platform that unifies a patient's care team, labs, and treatment into one personalized health system.

**Credentials grid** — all correct in code; only the ™ fix on "RegeniCool™ Pro" (§1.3). BPA already correct (`36C24123A0077`).

**Revenue figures** ($34K→$39M, $1.4M) — keep OFF all public pages. "500M units" is confirmed accurate (kept in the founder letter).

**Founder letter** — REPLACE existing letter (`~95–121`) with the approved rewrite:
> I've spent my career in supply chain. Since 2016 I've worked every link of it — sourcing, manufacturing, private label, logistics, fulfillment — and I learned early how often the chain breaks and what it costs the people depending on it. In 2019 I founded Unite Medical to be the partner I kept wishing existed: disciplined, accountable, and built to deliver when it matters most.
>
> That conviction was tested during the pandemic. When the traditional supply chain failed, Unite became one of the largest direct-to-patient drop shippers in the country, moving over 500 million units of tests, PPE, and critical supplies to the labs, hospitals, pharmacies, and retailers who needed them. We didn't just survive that period — we proved what a focused, vertically capable supply chain partner could do under pressure.
>
> What we built since has been earned the same way: by delivering and keeping our word. Surgery centers, hospitals, retailers, brand owners, and national partners work with Unite because we do what we say we'll do. It's the reason the leadership of Restore Robotics chose us to represent their program, and the reason customers who started with a single order stay with us for years. We've grown with one vision — to be the supply chain other companies can build on.
>
> The market has changed, and we've changed with it. The pandemic-driven demand that once came to our door is gone; today we earn every order, and we don't take a single one for granted. We're investing heavily in technology and AI to build a more scalable, transparent, and resilient Unite — a company designed for how business will be done next, not how it was done last.
>
> We are grateful for every customer who trusts us with their supply chain. They are the reason Unite exists, and everything we build, we build to serve them better.
>
> — Damon R., Founder & CEO

### 3.2 [COPY] Services page — `src/pages/Services.jsx` + `src/pages/ServicePDAC.jsx`

**Distribution card** (~18): "2 US warehouses" → **"Same-day shipping · Georgia warehouse · Ships to all 50 states + territories"**

**Quoting & Sourcing card** (~31) — REPLACE:
> Tell us what you need and get an instant, fully landed, compliance-checked quote — sourced from our vetted manufacturer network.

(Don't call the quoting system "private label." Private-label manufacturing is a separate real capability — keep it in the hero sub.)

**Hero sub** — KEEP as-is (private-label manufacturing is real).

**NEW 5th card — Restore Robotics** → links to dedicated `/robotics` landing page (§5.3).

**NEW 6th card — Diagnostics** → links to the Diagnostics page (§5.2) once built.

**PDAC value band (dark section) — REWORK (removes fabricated audit-SLA):**
- Headline KEEP: "Most braces stall at Medicare review. *Ours arrive billable.*"
- Body REPLACE:
> Every product in our Unite Medical orthopedic line is PDAC-approved and carries verified HCPCS L-coding. The code travels with the SKU — on the listing and on your invoice — so your bracing claims are ready to bill.
- Three stats REPLACE:
  1. **100%** · *PDAC-approved Unite Medical bracing line* — "Every Unite Medical orthosis is PDAC-approved." (scoped to Unite Medical line, NOT retail brands private-labeled without PDAC)
  2. **L-codes** · *On the listing and the invoice* — "Verified HCPCS L-code carried per Unite Medical bracing SKU and passed through to your invoice." **[BUILD NOTE]** wire the L-code into Unite Medical bracing product listings so it transfers to the invoice via QuickBooks Online.
  3. **Per SKU** · *PDAC approval letter on file* — "Download the current PDAC approval letter from any Unite Medical bracing product page."
- REMOVE entirely: "documentation checklist," "same-day audit response," "verification letter same day" (fabricated).

**PDAC Consulting page (`/services/pdac`) — fresh copy** (DME + orthotics ONLY, not supplies/prosthetics; do not use full "DMEPOS"):
> **PDAC Consulting — get your DME and orthotics coded right.**
> Unite Medical helps manufacturers and suppliers identify the correct HCPCS code for their durable medical equipment (DME) and orthotics before billing Medicare. Many of these items require a coding verification review by the PDAC contractor — and claims are denied when products aren't on the PDAC Product Classification List. We guide you through verification so your products are coded correctly and audit-ready.
> *Unite Medical makes no guarantee of reimbursement; medical necessity and payer documentation requirements remain the customer's responsibility.*

Keep PDAC **consulting** (helping others code) clearly separate from Unite's **own** line carrying PDAC approval.

### 3.3 [COPY] Procurement page — `src/pages/Procurement.jsx` (PREMISE WAS BACKWARDS)

The live page wrongly implies Unite is SDVOSB with "certified diverse suppliers behind our catalog." Correct intent is the **inverse**: Unite is the **supplier behind diverse resellers**. Unite makes ZERO diversity-status claims about itself.

**Hero** — REPLACE:
> **Headline:** A supply partner for diverse businesses.
> **Sub:** Unite Medical helps certified diverse suppliers win and fulfill healthcare contracts. We supply the products and the supply-chain muscle; you carry the relationship and the diversity certification your customers require.

**Body section** — REPLACE:
> **Headline:** Behind your diversity certification.
> **Body:** Health systems, GPOs, and government buyers increasingly require supplier-diversity spend. Unite Medical sits behind diverse distributors as a reliable, FDA-registered product and fulfillment partner — domestic manufacturing, agile sourcing, and same-day shipping — so you can confidently bid, win, and deliver. Your certification, your customer relationship; our catalog, compliance, and logistics doing the heavy lifting.

**Diverse-supplier categories (place LOWER on page, not in hero):** Women-Owned (WBE/WOSB), Minority-Owned (MBE), Veteran-Owned (VOSB), Service-Disabled Veteran-Owned (SDVOSB), LGBTQ+-Owned (LGBTBE), Disability-Owned (DOBE), HUBZone, 8(a)/SDB. Phrase as "We support distributors across the diversity classifications your customers track — including…" so it's inclusive without implying Unite holds these certs.

**Credentials grid:** add a 5th tile **MSPV BPA · 36C24123A0077**. Keep the Veteran-Owned/DD214 tile careful (refers to Damon being a veteran, not an SDVOSB cert).

**Contingency (note for Alex):** if Jackie is listed as owner and Unite gets WBE-certified, this page can later flip to position Unite itself as a (certified) woman-owned business. Until certified, claim nothing.

### 3.4 [COPY] Compliance page — `src/pages/Compliance.jsx`

1. **ISO 13485 → add an "IN PROGRESS" badge** styled like the product "IN STOCK" pill (rounded pill, brand colors). Surface it as a credential-style item. Reuse the in-stock pill component as a generic status badge. (Pursuit is confirmed active.)
2. **Veteran/DD214/ID.me tile** — KEEP (ID.me Military verified 12/14/2020).
3. **PDAC tile** (~27): "All orthotics + RegeniCool Pro" → **"All Unite Medical orthotics + RegeniCool™ Pro"**.
4. **MDR claim** (~35) — CORRECT: Unite files MDRs for its **own** products as manufacturer/distributor of record, NOT on customers' behalf:
   > Lot-level traceability for recall management. As the manufacturer/distributor of record, we file MDR-eligible reports to the FDA for our own products.
5. **"Audit-ready... DEA... second cup of coffee" band** (~172–176) — drop the cheesy bravado AND drop **DEA** (Unite handles no controlled substances; Unite Pharma is unrelated to this site). Reframe to a straight factual statement that supplier-qualification documentation is available to regulators/health-system auditors.
6. **ISO "Pursuing" policy text** (~33) — KEEP, tie to the new badge.
7. **BAA/HIPAA** doc-library item — KEEP (Unite has one on file).
8. **Email routing** (~46) — `info@` → `support@` (§1.2).

### 3.5 [COPY] Contact page — `src/pages/Contact.jsx`

1. **Collapse 4 redundant same-number blocks → 2 lines** (~128–141):
   - **Accounting & Billing** → `accounting@unitemedical.net` · **833.868.6483 ext. 3**
   - **All other inquiries** (sales, support, general) → `support@unitemedical.net` · **833.868.6483**
   Drop the separate `sales@` and `info@` blocks.
2. **Remove fake rep "Aidan Park"** (~60 `owner`). Set a real default/unassigned owner.
3. **Lead notification** (~76): `sales@` → `support@` (unless Alex has a real sales-inbox reason).
4. **SEO description** (~34) — update to match the new 2-line structure.
5. **Segment bug** — see §2.5.
6. **Reason dropdown** — align with the A5 quote-router + 3 supply states (§5.1) so leads tag consistently in HubSpot.

### 3.6 [COPY] Locations page — `src/pages/Locations.jsx`

Warehouse footprint already correct (single GA). Changes:
1. **Hero/eyebrow/map-label** — REPLACE:
   - Eyebrow: `GEORGIA WAREHOUSE · WE SHIP NATIONWIDE`
   - Headline: "One warehouse. *Every* zip code."
   - Sub: "Our Lithia Springs, Georgia warehouse ships to all 50 states and territories — same-day on orders placed before 2pm EST."
   - Map label (~37): "COVERAGE · CONUS" → **"SHIPPING · ALL 50 STATES"**
2. **Remove the SKU count** entirely (~13, ~60; drop `skus` field).
3. **Square footage** = **"Over 10,000 sq ft"** (replace the "—" placeholder).
4. **[BUILD]** Real hub-and-spoke US map — see §5.5.

---

## 4. Portfolio rebuild — `src/pages/Portfolio.jsx`

### 4.1 [COPY/BUILD] Replace all 6 fabricated cases; keep the layout

**All 6 current case studies are fabricated** and name real third parties (Medline, McKesson, a specific VA Medical Center, Cobb County EMS). KEEP the page structure/layout; replace the content. Soften the header ("Receipts. Real ones." / "Real numbers from real customers") so it doesn't assert "real" over anonymized content (e.g., "Proven outcomes. / The work, in plain numbers."). Don't name competitors anywhere.

**REAL flagship #1 — TJS (data pulled, copy approved):**
- Segment: "Physician Group · Patient Recovery Store"
- Customer: Total Joint Specialists
- Headline stat: **+43%** · "revenue growth, launch month to month three"
- Blurb:
> Unite built Total Joint Specialists a complete, branded patient-recovery store from scratch — a 49-product catalog, private-label bracing we manufacture, and direct-to-patient fulfillment from our Georgia warehouse. In its first 90 days, revenue grew every single month — up 43% from launch to month three ($5,278 → $7,547), on a rising average order value. The surgeon's brand stays on every touchpoint; we run everything behind it.
- Optional safe mini-stats: "$19.3K revenue, first 90 days" · "49-product catalog, live at launch" · "Revenue up every month."
- **[Alex] Pull a real TJS store/location photo** (no placeholder).
- **DO NOT PUBLISH:** monthly order count (June dipped 35→31 — lead with revenue), reorder/repeat rate (tiny 6-customer sample), margin/gross-profit % (incomplete COGS). Frame catalog as "launched with 49 products," NOT "added over time." (If asked why June revenue rose while orders dipped: AOV rose +31% — honest answer.)

**REAL flagship #2 — Restore Robotics savings:**
- Stat: **$900K+** · "saved for hospital systems to date"
- Blurb: total savings Unite has generated for hospital systems using the Restore Robotics program — over $900,000 to date (20–25% per-instrument savings, FDA 510(k) remanufactured da Vinci instruments).
- **Image + program content:** OK to use the Rocuvex site (rocuvexmed.com) for images and program content as the build reference.
- **[BUILD] Live savings calculator:** wire the $900K+ to a **live counter that increases from real data**. Data lives in the **Restore portal**. **Alex: tell Damon when you're ready to talk to Brad at Restore so Brad can build the data bridge.** Until wired, show static "$900K+ to date" (no fake-live number).

**REAL stat — Medava on MSPV:** **7** · "Medava SKUs on the national MSPV contract" (gov-credibility proof point — card or stat).

**Remaining cards:** illustrative/anonymized OK, but **NO NAMES** — generic descriptors ("A 4-OR ambulatory surgery center," "An independent GA pharmacy," "A regional distributor," "A county EMS agency"). No competitor names.

### 4.2 [COPY] TJS Case Study page — `src/pages/CaseStudyTJS.jsx`
Rework the thin 3-paragraph page to (1) showcase the full end-to-end capability and (2) sell the solution to new prospects. Lead with the capability story framed for prospects; spell out demonstrated capabilities (store build, private-label manufacturing, catalog+pricing, Force Therapeutics integration, direct-to-patient fulfillment from GA, same-day processing, WMS, branded-everything, reorders/analytics); quantify with the real growth data above; add a "Could this be your store?" who-it's-for block + a primary "Build my store / talk to us" CTA → HubSpot. Keep existing CTAs. Consistency check passed (single GA warehouse, private-label accurate).

---

## 5. New builds & features (engineering + capability decisions)

### 5.1 [BUILD] Catalog 3-supply-state model — `src/pages/Catalog.jsx`
Replace the binary IN STOCK/LOW badge with **3 real supply states** (model after Cato — cato.com):
1. **In Stock** — deeply stocked, ships today (bracing, diagnostics, American-made PPE, syringes, supplements).
2. **Source / Resiliency** — out-of-stock/backordered/on-allocation items Unite finds and sources (the Cato "supply-gap solver" play). Replaces the fuzzy "quick-ship."
3. **Available to Quote** — open RFQ on items not in catalog.

**Alex:** advise on structure (how states are modeled/displayed) and **confirm what's operationally capable** — especially Cato-style "find disrupted supply" data (same underlying capability question as C3 real-time-stock / open-RFQ). Per M1, OOS items must still SHOW with a path to source/quote.

Also on Catalog:
- Hero "Everything in stock" + eyebrow "STOCKED & SHIPPING SAME DAY" → reword (don't claim everything in stock). Recommend hero "The Unite catalog"; eyebrow "CATALOG · STOCKED + SOURCED" (agent to finalize to fit the 3-state model).
- Remove hardcoded "updated 04 min ago" (~92).
- Wire category filters (~24) to the M6 taxonomy (§5.6).
- Compliance filter checkboxes (~131–133, 148–150) are non-functional (no state) — wire them up (recommended; useful for procurement) or remove.
- Keep "no minimums on stocked items" (correctly scoped).

### 5.2 [BUILD] Dedicated Diagnostic Tests page (M4) — HIGH PRIORITY
Standalone, brand-neutral, SEO-focused page (separate from catalog):
- Brand-neutral: "Don't see your brand? Just ask."
- Show test categories covered (COVID, flu, HIV, strep, etc.).
- Supply capabilities: wholesale; retail (EDI, bulk, bulk discounts); private label; POC + OTC.
- **Unite's own private-label diagnostics line (IN PROGRESS):** build structure to feature a Unite-branded line alongside brand-neutral sourcing ("every major brand AND our own line"). Don't publish specific Unite-branded products until the line is live — confirm with Damon.
- SEO-optimized for retail buyers.
Rationale: diagnostics is Unite's #2 mover and a major retail growth lane.

### 5.3 [BUILD] Restore Robotics program — dedicated `/robotics` build (major, currently missing)
Build real structural page(s) (not a single buried page) — treat as a flagship service. **Strategic intent (internal):** robotics is the "trojan horse" to land large hospital systems — earn trust on instrument savings, then expand to Unite's full supply range. The site is the vehicle for that land-and-expand play.
- **Reference:** rocuvexmed.com (a Unite sub-distributor's program site) — OK to use for structure, images, and content as the build template; Unite sits above Rocuvex in the chain, so Unite's presence should be as strong or stronger.
- **Program facts (verified, OK to publish):** FDA 510(k)-cleared remanufactured da Vinci Xi & DV5 instruments + certified pre-owned; Restore Robotics is manufacturer of record (only FDA 510(k) clearance); Encore Medical = master distributor; **Unite is an authorized distributor/representative.** ~20% savings (remanufactured) / ~25% (certified pre-owned); manufacturer-of-record warranty. Collection→remanufacture loop (free trays + reusable containers, free return shipping, multi-step QC). Sustainability angle (reduced surgical waste/carbon footprint).
- **Conversion paths → HubSpot:** hospitals → "Request a Savings Analysis" + "Schedule a Consultation" (capture facility, contact, da Vinci model, instrument volume); sub-distributors → contact path to rep the program under Unite.
- Likely its own route under `/services` or a dedicated `/robotics` path + nav entry.

### 5.4 [BUILD] A5 "Start a quote" → multi-path quote router
Replace the single generic quote form with a chooser: "What you need?" → 3 paths, each asking only relevant fields, tagging lead type in HubSpot. Keep button label "Start a quote."
1. **Source a specific product / brand** (Cato-style RFQ)
2. **Custom quote** — source to spec, customer's label OR a Unite label (avoid the bare term "private label" as the path name)
3. **I have a shortage list** (resiliency → quote)
Ties to the Cato open RFQ, Quick Quote (A3), shortage matcher (C3). Sell capability/outcome per path; never expose the engine mechanism. Reconcile the Contact reason dropdown (§3.5) with these paths.

### 5.5 [BUILD] Locations hub-and-spoke US map — `src/pages/Locations.jsx`
Replace the CSS-placeholder "map" (~32–45) with a **real US map**: GA warehouse as origin, lines radiating to all 50 states (hub-and-spoke / distribution map, static or subtly animated). Tells the "one location, nationwide reach" story honestly.

### 5.6 [BUILD] M6 product taxonomy
Group every SKU into a product category: Bracing/Orthotics, Diagnostic Tests (POC+OTC, sub-typed by test), American-made PPE, Syringes, Supplements (+ Other/Medava, extensible).
- One-time classification pass over existing catalog.
- Make category a **required field** on new product upload (ties to A2 auto product pages).
- **Two independent classifications per SKU:** (1) product category [this], (2) availability tier [M2 / §5.1]. Confirm final category list with Damon before backfilling.

---

## 6. Site-wide consistency cleanup (existing copy that contradicts decisions)

### 6.1 [COPY] Homepage "OWNED INVENTORY" band — `Homepage.jsx` ~382–444 (C1)
Rework the band off the "we own & warehouse everything / zero middlemen" story:
- ~427 — "Las Vegas, NV / both coasts" → single GA warehouse (also §2.2).
- ~426 — "0 Middlemen / inventory owned and shipped from Unite-operated DCs" → overclaims; Unite sometimes sources without stocking and is a distributor in multi-tier chains (Restore).
- ~440 — "Most supplies cross four distributors before they reach you. Ours cross zero." → reframe.
- ~443–444 — "hold the stock in our own buildings… no brokered inventory… no third-party markups" → contradicts source-and-never-stock.
Rework to celebrate genuine strengths (direct relationships, owned stock on core categories, fast domestic re-source, transparency) without "owns everything / zero middlemen." Keep truthful to the two-model (stock + source) reality.

### 6.2 [COPY] Homepage hero — `Homepage.jsx` ~75–77 (C2)
"We source, stock, and ship… warehouse everything we sell. No minimum orders on stocked items. Landed cost, transparent." → "warehouse everything we sell" is false; "landed cost" must not describe stocked goods. Replace with the wholesale/global-supply-chain hero blurb (§7 homepage decisions).

### 6.3 [COPY/BUILD] Shortage-list real-time-match overclaim (C3) — 3 places
Claims Unite matches shortage lists against stocked inventory **in real time** and surfaces in-stock equivalents. Unite cannot do live third-party stock lookups today — it returns a **quote**. Reframe to "upload/paste your shortage list → Unite returns a quote" (resiliency play + sourcing network). Unite's OWN stock can be matched in real time via WMS — fine to say. Fix in:
- `src/pages/Homepage.jsx` ~496–503
- `src/pages/ShortageMatch.jsx` ~98 + ~168–170
- `src/pages/SupplyRisk.jsx` ~154
**[Alex question]** Is there a data source/API exposing other companies' real-time sellable stock (distributor availability feeds, marketplace inventory APIs)? Reference Cato. If we can get real-time availability, the copy could truthfully claim it — until then, "upload → we quote."

### 6.4 [COPY] Homepage "Enter data once / Sync everything" CTA — `Homepage.jsx` ~650–658 (C7)
Button is "Start a quote" but the copy describes order-fulfillment. Reword to the quoting flow; highlight INSTANT:
> Request a quote → get an instant, fully landed, compliance-checked price you can trust. Accept online and it becomes an order. No guesswork, no waiting, no back-and-forth.
**Honesty nuance:** "instant" is true for engine-priced items (in the vendor DB with known FOB/duty/freight), NOT for open-RFQ/brand-name/source-anything (manual). Keep "instant" tied to the engine-priced path.

### 6.5 [COPY] Testimonial reword — `src/data/testimonials.js` ~22 (C6)
"D. V. · Procurement Lead · Regional Health System":
- FROM: "Berry compliance documentation ready on day one…"
- TO: "Berry compliant **products** in stock when we needed them, same-day shipping, and a rep who knows our procurement process. Unite came in as a secondary source and earned a primary spot inside 90 days."
(Other testimonials stay as-is.)

### 6.6 [COPY] Footer credentials missing MSPV BPA — `src/components/layout/Footer.jsx` ~103 (C8)
Add MSPV BPA: "FDA 3015727296 · CAGE 8MK70 · MSPV BPA 36C24123A0077 · DUNS 117553945".

### 6.7 [BUILD] Exhaustive pre-launch grep (C5)
Grep the whole site for stragglers: Nevada/Las Vegas/Reno/two-warehouse/both-coasts; own-everything/zero-middlemen/no-brokered absolutes; "source, stock, and ship" or landed-cost on stocked goods; "no minimums" stated globally rather than scoped to stocked items.

---

## 7. Larger feature asks (already in the tracker — referenced for planning)

These are bigger forward-looking asks documented in `DAMON-PLATFORM-ADDITIONS.md`; they intersect Batch 1 but are their own work:
- **A1** — add Hospitals, Retailers, Brand Owners segments.
- **A2** — standardized auto-generated product pages from uploaded manufacturer content.
- **A3** — "Quick Quote" (instant wholesale price gated by professional-email lead capture).
- **A4** — Supply Chain Resiliency positioning + "Add Us as a Vendor" (W-9 download + shortage-item capture).
- **Open RFQ (Cato-style)** — quote on any brand/hard-to-find item (capability question for Alex).
- **Quoting engine vendor data fields** + **two-stage manufacturer onboarding** + **vendor self-service portal** (90-day price holds, approval-gated edits, translation, FOB/USD standard). Vendor field set #5 (Incoterm/FOB port, per-item certs, HTS/origin per alternate factory) confirmed by Damon.
- **M3** — demand-driven stocking (use site quote/request signals to decide what to deep-stock).
- **M5** — lead with Bracing + Diagnostics as hero "Stocked & Ready" categories.
- **Homepage repositioning** — global supply chain co. w/ medical specialty; wholesale + sourcing two-model; no "stock everything" / no blanket landed-cost / no blanket "no minimums."

---

## 8. Deliverables (assets)

### 8.1 [DELIVERABLE] Updated Unite Group Capability Statement — DONE
- PDF: `Desktop/Unite Medical/Capabilities Statement/Unite Team/Unite_Group_Capability_Statement_2026.pdf`
- Source: same folder, `.html`
- Brand-matched (tokens.js / Logo.jsx). Unite Group = Unite Medical®, Unite Pharma, Medava® (Clyne removed). Reflects: ortho = manufacturer-direct (not domestic), AI tech-forward framing, Unite Pharma broadened (no controlled substances / no cold-chain claim), Suite 1 address.
- **Wire the Government-page "Request capability statements" CTA to this PDF once hosted.**
- Open verification before external use: NAICS/SIC vs current SAM.gov registration.

---

## 9. Suggested implementation order

1. **§2 critical bugs** (stale FDA #, Las Vegas straggler, rail scroll, hardcoded badge, segment tag).
2. **§1 + §3 + §6 copy** (global standards + page copy + consistency cleanup) — low-risk, high-trust-impact; ship in a batch.
3. **§4 Portfolio rebuild** (TJS + Restore flagships + anonymize) — removes the biggest substantiation liability.
4. **§5 new builds** in priority: Diagnostics page (M4, high priority) → Restore `/robotics` → 3-state catalog model → quote router (A5) → hub-spoke map → M6 taxonomy.
5. **§7 larger asks** — separate PRDs/planning.

**Coordination Damon owes / cross-team:**
- Alex tells Damon when ready to talk to **Brad at Restore** (live savings calculator data bridge).
- Confirm Diagnostics private-label launch status before publishing Unite-branded tests.
- Decide on the Cato-style real-time-availability capability (affects §5.1, §6.3, open RFQ).
- Confirm final M6 category list before backfill.
