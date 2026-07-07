# PRD-29 — Website Review Batch 2: Services Sub-pages, Segments, Sourcing/Resiliency, Content & Legal

**From:** Damon Reed (CEO)
**To:** Alex (CTO)
**Date:** 2026-07-01
**Status:** Ready for implementation
**Source of record:** `docs/DAMON-PLATFORM-ADDITIONS.md` (Batch 2 section) — this PRD consolidates it into an actionable spec.
**Companion:** PRD-28 (Batch 1). Global standards from PRD-28 (veteran status, email standardization, RegeniCool™, IP/mechanism rule, landed-cost scoping, single-GA-warehouse) apply here too.

---

## 0. How to use this doc

Every item is tagged **[COPY]** (approved text, apply verbatim), **[BUG]**, **[BUILD]** (feature/logic + capability decision), or **[CONFIRM]** (Alex must verify a fact before it ships). Approved copy is in `>` blocks. Truthfulness standard governs everything — this batch removed a lot of fabricated/overclaimed content; when in doubt, soften or omit.

**Pages covered:** 4 services sub-pages, 4 segment pages, 3 sourcing/resiliency pages (+ surplus market), 4 content pages, 4 legal/policy pages. Commerce flow (`/quote`, cart/checkout) was intentionally out of scope for the copy review.

---

## 1. Highest-priority items (do first)

1. **[BUILD/LEGAL] Legal-doc migration + compliance review** (§9) — pull all legal docs from the OLD site, confirm business address, run a compliance check (docs are ~10 yrs old). Real legal exposure.
2. **[BUILD] Surplus model pivot** (§7) — the current buy-and-stock model is fundamentally wrong; rebuild as a brokered marketplace. Big scope + legal.
3. **[BUILD] Shortage-list + Supply-Risk expansion** (§6) — match against all 3 supply states + build the cross-reference SKU database.
4. **[COPY] Nevada/two-warehouse straggler on Distribution page** (§2.1) — same factual error being cleaned site-wide.
5. **[COPY] Returns + Shipping policy corrections** (§9) — currently misstate real policy.

---

## 2. Services sub-pages

### 2.1 [COPY] Distribution — `src/pages/ServiceDistribution.jsx`
🔴 Nevada/two-warehouse bug live in 4 spots (single Lithia Springs, GA):
1. **SEO title (~31):** "2 US warehouses" → **"Distribution — Georgia warehouse, same-day shipping, nationwide coverage."**
2. **Hero title (~41):** "Your *forward* warehouse." → **"One warehouse. Every dock."** (agent to finalize; drop "forward" = implies distributed network)
3. **Hero sub (~42):** "Two US warehouses, one routing engine…" → **"One Georgia warehouse, tuned to your rolling 30-day run rate — not last year's forecast."**
4. **STEPS (~21):** "Routing engine picks nearest warehouse with full fill" → **"Order routed and allocated for a complete, single-shipment fill."**
5. **Fill-rate stat (~15):** "98.6% FILL RATE" → **"99%+ FILL RATE"** (Damon-confirmed — avoids false-precision decimal; Unite genuinely fills at a high rate).
6. **Terms (~24):** "Net-30 with approved credit" → **"Invoice auto-creates; flexible terms available with approved credit."** (credit-based, not a fixed 30; Unite does 60/90 for some accounts).
- **Clean/keep:** same-day <2pm EST, 100% US + territories, 0 MOQ (stocked), two-way CTA.

### 2.2 [COPY] PDAC Consulting — `src/pages/ServicePDAC.jsx`
1. **Scope: "DMEPOS" → "DME and orthotics"** everywhere (SEO title ~38, desc ~40, hero sub ~49). Unite consults on DME + orthotics ONLY (not prosthetics/supplies).
2. **RegeniCool™** (~67): "RegeniCool Pro" → "RegeniCool™ Pro".
3. **"All Unite Medical orthotics and our RegeniCool™ Pro line are PDAC credentialed"** — keep (correctly scoped), just ™.
4. **"95%+ success rate"** (~84) — keep (Damon OK).
5. **Hero sub "difference between getting paid and eating the cost"** — keep.
6. **🔴 Fix PDAC-control overclaim — STEP 3 (~28-31):** "…we handle the revision and resubmit **until you have your code**" overstates (Unite doesn't control PDAC's decision/code). Replace:
   > If PDAC requests additional documentation, we handle the revision and resubmit. Coding decisions rest with PDAC — we manage the process to give your product its best shot at the right code.
7. **[BUILD] CTA wiring (~90-92):** "Browse PDAC-approved products →" → point to Unite's **braces category + the RegeniCool™ Pro listing.** ⚠️ The **RegeniCool™ Pro listing does not exist yet — Alex must create it first.** Ties to the PDAC letter-download + L-code-on-listing builds (PRD-28 §3.2).

### 2.3 [COPY/BUILD] Distributor Program — `src/pages/ServiceDistributors.jsx`
1. **🔴 Custom Sourcing card (~42):** "Real-time pricing, landed cost, compliance verified" (mechanism leak + real-time overclaim) →
   > Need products we don't stock? Use our quoting engine to source from our vetted manufacturer network — get an all-in landed price with compliance handled.
2. **Reciprocal catalog exposure = OPTIONAL (both directions).** Reword cards 01 & 02 so listing the distributor's products in Unite's catalog AND offering Unite's products to their customers are clearly opt-in:
   - **Card 01 · 3PL & Warehousing:**
     > We stock and ship your products from our facilities — your inventory lives in our warehouse and ships on your schedule, like it's your own. Optionally, list your products in our catalog to reach new buyers. Manage it all from your own distributor dashboard: stock levels, orders, shipments, and reporting, as if you owned the warehouse.
   - **Card 02 · Drop-Ship Integration:**
     > Integrate our catalog into your site and we fulfill on your behalf — blind-shipped, discreetly, under your brand. Your customers never see us. Offering our catalog to your customers is optional — you control what you list and what stays private. Track every order from your distributor dashboard in real time.
3. **🆕 [BUILD] Showcase the Distributor Dashboard** (new card or highlighted band):
   > **Run your business like you own the warehouse.** Every distributor gets a custom dashboard to manage inventory, place and track orders, handle drop-ship and blind-ship fulfillment, pull reporting, and control exactly which products you list — and which of ours you offer your customers. Full visibility, full control, zero warehouse overhead.
   (Maps to existing DistributorPortal `/distributor` + sub-routes; CTA → demo/contact or portal login.)
4. Keep: Wholesale "No minimums on stocked items"; hero "Your catalog. Our import desk." / "logistics partner, not a competitor."

### 2.4 [COPY] Private Label & Manufacturing — `src/pages/ServicePrivateLabel.jsx`
1. **🔴 Manufacturing-claim accuracy (~14):** "We manufacture domestically and overseas across vetted facilities" (implies Unite owns factories) →
   > Diagnostics, PPE, orthotics — produced under your brand through our network of vetted domestic and overseas manufacturers, with the QA paperwork to back it up.
2. Keep: "Request samples" CTA, hero "Your brand. Our supply chain." + TJS proof, white-label storefront card. No other issues.

### 2.5 [COPY] 🔴 SITE-WIDE "dealer" → "distributor" cleanup
The program was renamed to "Distributor Program" but "dealer" survives in the SEO/prerender + misc layers:
- **`scripts/prerender.mjs` ~67-68** — prerendered `<title>` is literally **"Dealer & distributor program"** + "dealers and distributors" desc → **"Distributor Program · Unite Medical"**, drop "dealer."
- **`scripts/prerender.mjs` ~56** — services desc "dealer programs" → "distributor programs."
- **`src/pages/legal/Legal.jsx` ~128-129** — "For dealers and pharmacies", "our dealer team" → "distributors", "distributor team."
- **`src/pages/SurplusMarket.jsx` ~5** — "clinics, dealers, exporters" → "distributors."
- **Internal (optional, not customer-facing):** `AdminAnalytics.jsx`, `AdminMarginPolicy.jsx`, `marginPolicy.js`, `pricing.js`, `QuoteNew.jsx` "Mid ASC / Dealer" — align to "distributor" for consistency.
- Keep `/services/dealer` + `/pages/dealer-program` → `/services/distributors` redirects (old-link SEO). Re-run prerender after edits.
- **New scan rule:** review `scripts/prerender.mjs` meta alongside every page (customer-facing `<title>`/description) for the same standards.

---

## 3. Segment pages (mostly clean — already rebuilt)

### 3.1 [COPY] ASC — `src/pages/segments/SegmentASC.jsx`
Clean (no fake stats/testimonials). One light reword — hero sub (~36) so "same day" doesn't imply same-day on *sourced* items:
> Procedure-specific products — stocked and shipped same-day, with sourcing for everything else. We supply ASCs of any size, with no minimum orders on stocked items.
Prerender meta clean. Low priority.

### 3.2 [COPY] Pharmacy — `src/pages/segments/SegmentPharmacy.jsx`
Clean. Optional: link the diagnostics tags ("OTC rapid tests," "Point-of-care diagnostics") to the future Diagnostics page (PRD-28 §5.2) once built. Low priority.

### 3.3 EMS — `src/pages/segments/SegmentEMS.jsx`
Clean. No changes.

### 3.4 Distributors segment — `src/pages/segments/SegmentDealers.jsx`
Content clean (uses "distributors" correctly). Only the prerender title fix (covered in §2.5). Component name can stay.

---

## 4. Sourcing / Resiliency pages (highest strategic density)

### 4.1 [COPY/BUILD] Shortage-list matcher — `src/pages/ShortageMatch.jsx`, `src/lib/matching.js`
Page model is honest (matches Unite's own catalog + routes rest to sourcing). Expansion + integrity:
1. **🔴 Match against ALL 3 supply states, not just in-stock.** (1) In Stock (real avail = on-hand − reserved, per B2), (2) Source/Resiliency = vetted-manufacturer product lines in the quoting engine, (3) Available to Quote (open RFQ). A line matches if Unite can supply via ANY path. Ties to the Catalog 3-state model (PRD-28 §5.1).
2. **🔴 "IN STOCK" badge = real available inventory** (not catalog presence) — B2 fix.
3. **🆕 [BUILD] Cross-reference SKU database from uploaded lists.** Capture customer-item ↔ Unite-equivalent pairs from every uploaded shortage list → proprietary cross-ref DB that makes matching smarter and enriches manufacturer product data. **NOTE (don't lose):** add a cross-reference-SKU field/table to the manufacturer product sheet / vendor data model (ties to quoting-engine vendor fields + vendor portal). Durable data-moat asset — Damon flagged this as "the missing piece of our manufacturer product sheet."
4. **🔴 Equivalents guardrails (medical safety).** No loose keyword-match "equivalents." Require the client to provide their list of **acceptable cross-SKUs** up front → (a) approved workable options, (b) removes Unite's liability for guessing, (c) feeds the cross-SKU DB with customer-validated pairs. Add a field/step for acceptable substitutes.
5. **[CONFIRM/RESEARCH] Purchasable medical cross-reference datasets** — investigate licensing commercial cross-ref/equivalency data (GUDID-based, distributor cross-ref files, third-party equivalency datasets) to seed the DB with real data vs. building from scratch.
6. **Copy tightening:**
   - SEO title (~97) "against live stock" → **"Match your shortage list against our full supply chain — instantly."**
   - Hero sub (~170) + SEO desc (~98) → **"We instantly check each line against our stock, our vetted manufacturer network, and our sourcing desk — then come back with what we can supply and a quote for the rest."**
7. Keep: non-stocked → "WE SOURCE IT" → quoting; landed-cost in sourcing flow; professional-email capture; "list never shared"; the no-EDI/no-formatting UX.

### 4.2 [COPY/BUILD/STRATEGY] Supply Risk monitor — `src/pages/SupplyRisk.jsx`
Page is strong (live openFDA recall feed, honest "SAMPLE FEED · OPENFDA UNREACHABLE" fallback, deep-link into shortage matcher — Cato Risk Radar equivalent on a free API).
1. **[COPY] Conversion band (~154):** "match it against live stock" → **"Paste your shortage list — we'll match it against our full supply chain."**
2. **[CONFIRM] Recall data source** — confirm openFDA (`src/lib/external/openfda.js`, device enforcement, 120 days), refresh cadence, fallback behavior.
3. **[BUILD] Wire recall matches to all 3 supply sources + cross-ref SKUs** — today `shelfCoverage()` (`rankCatalog`) only ranks the stocked catalog. Expand to also surface vetted-manufacturer/quoting-engine items + open-quote, so a recalled item can offer a stocked alternate, a sourced alternate, or a quote.
4. **🔴 THE EXECUTION PROBLEM (strategic — design data capture to feed this; don't build blindly yet).** Matching a recall to a cross-SKU is easy; being able to BUY + deliver the alternate is hard. Stocked = owned (fine); overseas sourced = manufacturer confirmed (mostly fine, needs client cross-SKU approval + hospital push-through); **OTG (on-the-ground/USA) = the hard one** — Unite may know the item but has no confirmed supplier, and brands typically bar authorized distributors from selling to resellers. Three execution models + proposed unlocks:
   - **Opt 1 (direct from brand — ideal, hardest):** use the recall page + portal + quoting system as a **demand-aggregation engine** — build per-brand "demand dossiers" (# facilities, units, timeframe, during competitor's recall) and take real demand to the brand to earn authorization.
   - **Opt 2 (3rd-party allocation — tactical, speed-dependent):** pre-build a quiet **allocation-network rolodex** per major brand *before* recalls hit, so a recall = calling known contacts within hours (the window closes fast). Recall feed reveals which brands to build depth around.
   - **Opt 3 (overseas — slowest, needs pre-work):** do the regulatory pre-work (510(k)/registration/specs pre-documented) + pre-negotiate client cross-SKU acceptance *before* the crisis, to collapse the new-SKU/new-vendor approval timeline into hospitals.
   - **Throughline:** recall page + shortage lists + quoting engine = a demand-intelligence system; the data is the *ammunition* to solve execution, not the product itself.
5. Keep: live feed + honest fallback, recall class colors, deep-link to shortage matcher.

---

## 5. Surplus — PIVOT to a brokered marketplace (`Surplus.jsx`, `SurplusMarket.jsx`, `src/lib/marketplace.js`, `/admin/surplus`)

### 5.1 [BUILD] 🔴 Core model pivot
The current pages are the WRONG model: Surplus.jsx = "Sell us your surplus, we make an offer, Net-30 on accepted lots" (Unite buys + stocks dead inventory on spec); SurplusMarket.jsx = Unite resells "accepted" lots at a brokerage spread. **Damon does NOT want to buy/stock dead inventory on an 'if-come' basis.** Rebuild as a **transaction bridge / broker** earning a transparent **technology-transfer fee**, with an *option* to buy/sell direct.

**Model:**
- **Sell side:** vendors upload excess/expired/random inventory (CSV upload + downloadable required template) + set their target/ask price. Unite does NOT buy up front by default.
- **Buy side:** Unite markets to willing buyers across **multiple target markets — not medical only**: also non-medical, veterinary, research, overseas. (Framing: these are *additional* target markets that widen the buyer pool — NOT a fallback for items hospitals "can't use." A good in-date lot might sell to a medical buyer OR an overseas clinic OR a research lab; expired/near-expiry simply opens even more non-medical channels.)
- **The bridge:** buyer offer (qty + price) + seller accepts (vs. target) = **binding** → **Unite collects its % fee UP FRONT before the two sides are connected** (safety gate: fee secured before contact info/connection released).
- **Transparency:** "Unite doesn't want to stand in the way of you moving your products — if we bridge you to a buyer, we earn a fee for the connection."
- **Track both sides** for the *optional* Unite direct-buy (stock a SKU worth owning) or direct-sell path. Default is broker, not speculative stock.

### 5.2 [BUILD] Specific asks
1. **CSV upload on sell-side intake** (Surplus.jsx) in addition to manual entry; provide a downloadable template.
2. **Rewrite Surplus.jsx** off "we buy it/Net-30" → broker framing ("list → we find a buyer across channels → you set target → we bridge for a transparent fee"). Keep AI line-normalization.
3. **Rewrite SurplusMarket.jsx** from "lots Unite accepted & resells" → "listings Unite is brokering." Buyer offer → mutual acceptance = binding → Unite fee up front → connection released. Keep offer UI.
4. **Binding-offer + fee-escrow flow** (`marketplace.js` + `/admin/surplus`): agreement + up-front-fee gate; track buyer & seller for optional direct buy/sell.
5. **Buyer channels:** support non-medical / veterinary / research / overseas buyer segments.
6. "dealers" → "distributors" (§2.5).

### 5.3 Fee structure (Damon-approved) — tiered
- **10–15%** on easy in-date lots (Unite mostly just connected).
- **20–30%** on hard-to-place inventory (expired, needs non-medical/vet/research/export channel, regulatory hoops — Unite creates the only viable exit).
- **Minimum fee floor ~$250–500/transaction.**
- Scales with value created. Benchmarks: pure brokerage 5–15%; B2B liquidation 10–20%; secondary/surplus medical + hard-to-move 20–35%.

### 5.4 [BUILD/LEGAL] Guardrails
1. **🔴 Disintermediation — DAMON DIRECTIVE: make the platform AS STICKY AS POSSIBLE using Unite's full feature/service set.** Up-front fee protects deal #1, but repeat deals can route around Unite. Mask identities until fee clears AND bake in logistics/freight, compliance & doc handling, escrow/payments, quoting engine, buyer network, ratings/history, saved templates, recurring-listing tools — so both sides get ongoing value from staying on-platform. Stickiness is the primary moat; design every surplus touchpoint to increase switching cost / ongoing utility.
2. **Regulatory/liability on expired + regulated goods.** Real rules (expired sterile devices must NOT re-enter patient care; some exports need clearance; "research use only" labeling). Require: (a) terms placing compliance on buyer + seller, (b) system channel-guardrails (e.g. an expired lot can't be bought by a medical-use buyer), (c) legal review before launch. The broker model (vs. taking title) is also the safer model.

---

## 6. Content pages

### 6.1 [COPY] Careers — SIMPLIFY to a contact page (`src/pages/Careers.jsx`)
Current page fabricates "60-something people on three coasts" (false headcount + single-location contradiction), 5 fake open roles, and 4 unverified benefit promises ($0 co-pay, day-one equity, 12-wk leave, unlimited PTO).
- **Remove** the ROLES array, the 4 benefit stats, and the headcount/"three coasts" line.
- **Rebuild** as a short honest page: veteran-owned, growing, single "interested in working with us? get in touch" CTA → /contact. No fake roles/headcount/benefits.
- Suggested copy: eyebrow "CAREERS," + "We're a veteran-owned medical supply + supply-chain company, always interested in great people — engineering, sales, ops, compliance. Don't see a posting? Reach out anyway." Headline "Help us run like a soldier." may stay.
- Update careers prerender meta (drop "three coasts"/headcount; keep "veteran-owned," "remote-friendly" only if genuinely offered).

### 6.2 Blog / Field Notes — `src/pages/Blog.jsx`
Intentionally EMPTY (`SAMPLE_BLOG_POSTS` cleared; real content pending with Jill). Honest state — no fix needed now.
- When real posts land: use a real byline (AdminCMS default author is "You"); keep the truthfulness standard.
- Optional: friendly empty-state ("Field notes coming soon") so it doesn't look broken. Low priority.

### 6.3 [BUILD] Resources (HCPCS reference) — WIRE TO REAL DATA (`src/pages/Resources.jsx`)
Currently a half-built feature dressed as finished: fake static "Search 4,820 codes" input, dead "Download PDF" button, fabricated family counts + per-code SKU counts (only 8 hardcoded rows), non-functional "VIEW SKUS →" and family filters, unverified "current through April 2026 CMS update."
**🔴 Damon chose: build it real (don't ship the fake, don't cosmetically patch):**
1. Wire to the real public **CMS HCPCS Level II dataset** — real codes/descriptions/families + true counts.
2. Functional search.
3. Cross-link codes to **real Unite SKUs** with true counts; "VIEW SKUS →" → filtered catalog.
4. Functional family filters.
5. "Download PDF" produces a real PDF (or remove until it does).
6. Real/dynamic CMS-update date.
7. Review `/resources/coding` alongside — same real-data standard.
Rationale: genuine SEO magnet + sticky utility. Until wired, the fake search/download/counts must not ship (a dead "Download PDF" costs trust on the real claims).

### 6.4 [COPY/BUILD] Support / FAQ — `src/pages/Support.jsx`, `src/data/faqs.js`
1. "Minimum order quantities?" — clean, keep.
2. "How fast do you ship?" — clean, keep.
3. **"Do you bill net-30?" — revise:**
   > New accounts start with credit card, wire, or ACH. Terms (Net-30 and, for qualifying/government accounts, Net-60) require prior credit approval.
   *(Note: do NOT advertise Net-90 anywhere — see §9. Even though offered to some clients.)*
4. "Do you support EDI?" (850/810/856) — confirmed live, keep.
5. **"How does PDAC approval work?"** — (a) RegeniCool™ trademark; (b) **[BUILD]** wire the per-product PDAC letter download — the letters exist on the current site (migration/wiring, not fabrication). Ties to PDAC CTA + RegeniCool™ Pro listing.
6. **🔴 [BUILD] Category gap:** 7 category filters but only 6 FAQs in one flat list — filters non-functional + most categories empty. Write real FAQs for the remaining sections (Returns, Compliance, Private label, etc.) and wire the filters to actually filter by section. Keep all answers to the truthfulness standard.

---

## 7. Legal / Policy pages (`src/pages/legal/Legal.jsx`)

### 7.1 [BUILD/LEGAL] 🔴 Migration + compliance review (top priority)
Pull ALL legal docs from the OLD site → new site. Docs are ~10 years old and may need updating. Run a compliance check (privacy, terms, returns, shipping, BAA). Confirm the business address across all docs (HQ: **1487 Trae Lane, Lithia Springs, GA 30122**). The copy fixes below are interim; the migrated + legally-reviewed real documents are authoritative.

### 7.2 [COPY/CONFIRM] Privacy (`/privacy`)
1. **[CONFIRM]** "SOC 2 Type II environments" + "AES-256 encrypted backups" — verify accuracy. If it's the hosting provider that's SOC 2, word as "hosted in SOC 2 Type II data centers"; don't claim Unite itself is SOC 2 unless true.
2. **[BUG]** "our billing system Online, Stripe" (~56) → **"QuickBooks Online and Stripe"** (mangled text).
3. "No PHI without a signed BAA" — keep (consistent with BAA on file).

### 7.3 [COPY] Terms (`/terms`)
4. **Governing law (~83):** "State of Georgia, exclusive venue in Douglas County" → **"State of Georgia, exclusive venue in Fulton County."**
5. Payment Terms (~79): keep Net-30/Net-60 at discretion + 1.5%/mo past-due. **Do NOT advertise Net-90.**

### 7.4 [COPY] 🔴 Returns (`/returns`) — policy correction
Update to Unite's actual policy: **No returns EXCEPT manufacturer defect. Unopened items may be returned within 30 days of the original PO.** Rewrite the sections accordingly (remove broader/easier-return language); keep sterile/single-use + patient-safety framing. Reconcile the "prepaid label for Net-30 vs. self-generate for card customers" detail with this. Verify against the migrated real return doc.

### 7.5 [COPY] 🔴 Shipping (`/shipping`) — remove pricing + specifics
6. **Remove ALL shipping prices** (no free-over-$500, no $38 expedited, no $95 overnight, no $95 same-day flat). Unite does NOT currently offer blanket free shipping over $500.
7. **Remove Atlanta-metro same-day specifics** (old-site content).
8. **No shipping lead times** (remove "median delivery: 4 business days" and any transit-time claims).
9. Shipping CAN say: **same-day order processing & shipping** (orders before 2pm EST ship same day, from the Georgia warehouse, to all 50 states + territories). Nothing more.
10. "dealers" ×2 (~128-129) → "distributors" (§2.5).
11. "International: currently US-only" — keep.

---

## 8. Suggested implementation order
1. **§7 legal migration + compliance review** (real exposure) + the returns/shipping/governing-law copy corrections.
2. **§2.1 Distribution Nevada fix + §2.5 dealer→distributor sweep + prerender meta pass** (quick, high-consistency-impact).
3. **§2.2–2.4 services copy + §3 segment tweaks + §6.4 FAQ revise** (batch of low-risk copy).
4. **§5 Surplus pivot** (biggest rebuild; legal-gated).
5. **§4 shortage-list + supply-risk expansion** (cross-ref SKU DB, 3-state matching).
6. **§6.3 Resources real-data build** + **§6.1 Careers simplify** + **§6.2 Blog empty-state.**

**Cross-team / confirmations owed:**
- **[CONFIRM]** SOC 2 / AES-256 (Privacy), openFDA source/cadence (Supply Risk).
- **[RESEARCH]** purchasable medical cross-reference SKU datasets (shortage matcher).
- **[LEGAL]** surplus broker terms + expired-goods compliance; legal-doc compliance review.
- Create the **RegeniCool™ Pro product listing** (unblocks PDAC CTA + PDAC letter download).
- Design shortage/recall data capture to feed the demand-intelligence + cross-SKU database.
