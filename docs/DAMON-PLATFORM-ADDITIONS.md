# Unite Platform — Damon's Additions & Notes (for Alex)

**From:** Damon Reed (CEO)
**To:** Alex (CTO)
**Re:** Additions to the Platform Map (`UNITE-PLATFORM-MAP.docx`, June 23, 2026)
**Status:** Running list — Damon is still adding. Each item includes the business context behind the ask so the *why* is clear.

> Format: **THE ASK** (what to build/change) followed by **WHY / CONTEXT** (Damon's reasoning + business background) so Alex has the full picture, not just a feature request.

---

## ⚠️ ALREADY PUSHED TO `main` TODAY (2026-06-29) — Alex: review & confirm OK, do NOT redo

These copy/data edits were made directly and are already committed + pushed to `origin/main` (authored as Damon Reed). They build clean (`vite build` passed). Please review and confirm they're acceptable:

1. **`a5985b2`** — MSPV BPA contract number updated `36F79725D0203` → **`36C24123A0077`** everywhere (nav, About, Government, Compliance, SEO/structured data, invoice + quote footers, product copy, admin settings); labels changed to **"MSPV BPA"** site-wide.
2. **`d74325b`** — Warehouse footprint corrected from "Georgia & Nevada" (two) → **single Georgia (Lithia Springs)** warehouse across homepage ticker, Locations page (removed Nevada hub + orphaned map arcs), Services/Distribution, FAQs, global SEO, Legal shipping (also fixed a stray "four DCs" claim), and removed the "Reno DC" job posting from Careers. **NOTE for Alex:** backend WMS still references `wh_reno` (seed data, pick/reservation priority arrays, port routing, admin Receiving/Transfers/Count dropdowns) — left untouched because it's system behavior, not copy. Decide whether to remove the Nevada warehouse from the WMS too.
3. **`9ca6702`** — Partner/customer marquee list replaced with: Restore Robotics, goPuff, Veterans Affairs, Publix, Henry Ford Hospital, Ardent Health, Harps Food Stores, UF Health, Orlando Health, Total Joint Specialists. Added a **text-wordmark fallback** so names without a logo file still render. **NOTE for Alex:** only goPuff, Veterans Affairs, and Publix have real logo assets — the other 7 currently render as styled text until real logos are added to `/public/logos/partners/` (Damon wants real logos for all; sourcing them is pending).

**Going forward:** Damon will only document edit requests in this doc; **Alex pushes all further changes.** (Decision made mid-review to keep Damon's review pace fast.)

---

## Zone A — Public storefront

### A1. Add missing customer segments: **Hospitals, Retailers, Brand Owners**

**The ask:** The segment story currently lists surgery centers, pharmacy, EMS, government, and distributors. Add **Hospitals**, **Retailers**, and **Brand Owners** as first-class segments (nav, segment pages, and homepage messaging).

**Why / context:** I don't want to pin the company down to just the five segments we have today. We are a **global supply chain company with a specialty in medical** — not only a medical-provider supplier. We sell *to* and provide services *for* retailers, brand owners, and wholesalers (the people who supply the market), and hospitals are a major target we're currently not speaking to directly. The site should reflect the full breadth of who we serve so we attract newer clients — both those buying what we stock and those coming to us for sourcing/quoting on things we don't (and never will) stock. Narrow segment messaging quietly turns away exactly the larger accounts we want.

---

### A2. Standardized, auto-generated product pages from uploaded manufacturer content

**The ask:** (1) Enforce **one consistent format** for every product page — same layout, image treatment, spec block, sections — so the catalog looks clean and uniform. (2) Build a feature where, when we add a new product, we **upload the manufacturer's content and/or our own spec sheets** (specs + any marketing materials) and the **system generates a rich, consistent B2B product page automatically** — writing the B2B copy for us from the uploaded information, so we don't hand-write content per product.

**Why / context:** We're going to be adding a lot of products. Writing copy per item by hand is slow, inconsistent, and doesn't scale. We already *have* the source material — manufacturer spec sheets, our own spec docs, marketing materials. The system should ingest that and produce clean, on-brand B2B copy and a consistent page every time. The goal is consistency (every page looks like it belongs to the same catalog) and zero manual copywriting. We provide the specs + materials; the platform writes the page.

*(Implementation note for Alex: we already have the AI layer (PRD-11) and xlsx/PDF parsing (PRD-18/17). This is plausibly an extension of those — upload → extract → AI-generate page copy into the standard product-page template.)*

---

### A3. "Quick Quote" — instant wholesale price on a product, gated by lead capture

**The ask:** Add a **quick-quote feature** on product pages. A visitor sees a product they like and can request a "Quick Quote" (open to a better name). We then serve them a price for that item — **still wholesale, but heavily discounted vs. retail**. Requirements:
- A place in admin to **set "quick quote" pricing per item** (distinct from list/tier/contract pricing).
- We get them right to the point of showing the price — but **capture their information first**: first name, **professional email only** (personal email domains like gmail/yahoo/outlook must be rejected).
- Then reveal the price.

**Why / context:** This is a top-of-funnel lead magnet to reach **new** clients. Someone lands on a product, we give them a compelling wholesale number on the spot — that converts browsers into leads and orders. But the price is valuable and we don't want tire-kickers or competitors pulling our pricing, so we gate it behind a real business identity: name + a professional (work-domain) email. Personal emails won't work. It needs its own pricing field per item because quick-quote pricing is a specific, promotional wholesale number — not the same as a logged-in customer's contracted price.

---

### A4. Supply Chain Resiliency positioning + "Add Us as a Vendor" flow (shortage marketing)

**The ask:** Make **Supply Chain Resiliency** a featured marketing pillar, especially toward **hospitals**. Specifically:
- A prominent **shortages / resiliency** call-out and page positioning Unite Medical as a **Supply Chain Resiliency partner**.
- Ability to feature **client quotes/testimonials** from organizations we've helped (I can provide these).
- An **"Add Us as a Vendor"** button that lets a hospital **download our current-year W-9** and **request additional onboarding info** (e.g. COI / Certificate of Insurance, sales tax / resale docs).
- When someone downloads the W-9 or requests docs, **we get notified who they are**, and an **automation fires**: a thank-you plus a **fillable email/form where they can request a specific item they're having trouble sourcing** (a shortage/problem item).
- Reference point: **similar to Cato/Cardinal-style vendor onboarding, but better** and more self-serve.

**Why / context:** This is core to how we win hospitals, and it's the hardest part of our business. **Getting added as an approved vendor is the biggest barrier** — hospitals usually only add a new vendor when they hit a **shortage or a major supply-chain disruption**. So resiliency is our wedge: we market ourselves as the partner you call when your usual channel fails. We need to lean hard into this. The "Add Us as a Vendor" flow lowers the friction of that hardest step — give procurement an easy, self-serve way to grab our W-9 and start the paperwork (COI, sales tax), while we capture the lead and immediately open a conversation with a "what are you short on?" prompt. That turns their moment of pain into our entry point. I can supply real client quotes proving we've solved this for others.

---

## Quoting engine — additional vendor data fields required

**The ask:** The quoting engine's vendor/manufacturer data model needs these fields added so the system can actually produce a quote (freight, landed cost, container math, private-label):

- **Case pack details:** case dimensions (L × W × H), case weight, units per case
- **Pallet details:** units per pallet, pallet dimensions (L × W × H), pallet weight
- **20' container details:** capacity (units / cases / pallets per 20' container)
- **40' container details:** capacity (units / cases / pallets per 40' container)
- **Private-label MOQ per item** — MOQs must be the *private-label* MOQ for each item (not just stock MOQ)
- **Shipping port** — the port the goods ship from (origin port)
- **Country of origin** + **whether the manufacturer has alternate manufacturing locations** to avoid / reduce tariffs
- **Manufacturer FDA registration #**

**Why / context:** These are the inputs the landed-cost + freight + container-optimization logic needs to generate a real quote. Without case/pallet/container dims and weights, the system can't calculate freight or how much fits in a 20'/40' container. Private-label MOQs matter because our model is largely private-label sourcing — the stock MOQ isn't the number we quote against. Country-of-origin + alternate factory locations directly affect tariff/duty exposure (and let us route around tariffs), and the FDA registration # is part of vetting the manufacturer for the vendor database.

**Agent-suggested additional fields worth capturing (gaps to consider):**
- **HS/HTS code per item** (drives duty rate — already partially in the engine via classification, but better supplied by the manufacturer)
- **Currency** of the FOB price (engine assumes USD; foreign vendors quote in local currency — needed for conversion, PRD-22)
- **FOB price validity / price expiration date** (FOB prices move; a quote built on stale pricing is a liability)
- **Incoterm** the FOB price is quoted on (FOB port vs. EXW factory vs. CIF — changes the landed-cost math materially)
- **Certifications/registration evidence** (ISO 13485, CE, 510(k) status, ASTM) — already in scope for vetting; confirm captured per item
- **HTS/origin per alternate factory** (if they have multiple locations, duty differs by origin — capture per location, not just "yes they have others")
- **Product shelf life / expiration** (for lot/expiry tracking once stocked — ties to WMS)
- **NDA status flag** on the vendor record (whether a mutual NDA is signed before sensitive FOB/factory data is exposed)

---

## Manufacturer onboarding — two-stage data collection (intro first, requirements after)

**The ask:** When approaching new foreign manufacturers (e.g., from World Health Expo), do **not** front-load the full data requirements. Stage it:
- **Stage 1 (intro):** introductory email — teaser on the quoting system, framed as a selective review ("not all manufacturers will be approved — all are being reviewed"). Ask only for a reply expressing interest + their general catalog.
- **Stage 2 (requirements):** only *after* they reply interested do we send the full data requirements (the case/pallet/container/private-label-MOQ/port/origin/FDA-reg spec above), ideally as a fillable Excel template.

**Why / context:** These are brand-new relationships — met once at a trade show. Dropping a 15-field data demand up front is a big ask that kills momentum. Leading with the vision + exclusivity (selective vetting) earns the reply; the detailed requirements land better once they've opted in. This staged flow should inform any manufacturer-onboarding tooling in the vendor module.

---

## "Request for Quote on ANY item" — open RFQ / branded-item sourcing (Cato-style) — QUESTION FOR ALEX + feature

**Question for Alex (first):** Did you figure out how **Cato's site** is working — specifically how they're pulling **other companies' SKUs / brand-name catalog items** into their site for quoting? If you cracked that, we should do the same (or better).

**The ask:** Don't silo our quoting capability to "source-only / private-label" items. We need an **open Request-for-Quote** path where a customer comes to unitemedical.net and asks Unite to source + quote **a brand-name item, or any item they're having trouble finding** — not just items already in our catalog or our vetted-manufacturer network. They type/search the brand-name product (or describe the item), and submit an RFQ for Unite to source and price it.

- Match the **Cato format** — or build something better — for letting a customer request a quote on a specific branded/hard-to-find product.
- This is the front-door expression of Unite as a **Supply Chain Resiliency partner** (ties to the A4 "Add Us as a Vendor" / shortages positioning): "can't find it / your usual channel failed → we'll source and quote it."
- Should live alongside the existing "Two ways to buy" framing (Ready to buy = stocked catalog / Need to source = quoting engine). This RFQ is the **broadest** version of "Need to source" — any item, including brand names, not just our manufacturer-network items.

**Why / context:** The current quoting engine is oriented to items we source from our vetted manufacturer network (private-label / FOB sourcing). But a huge part of our value — and how we win resiliency-driven hospital relationships — is being the partner a customer turns to when they can't find a **specific brand-name product** anywhere else. If a customer can only request quotes on things already in our system, we've siloed ourselves out of exactly the demand that makes us a resiliency partner. Cato apparently solved pulling broad brand/SKU data into their quoting flow; we want that capability (or better) so a customer can RFQ literally anything and we go source it. This converts "I can't find X" into a Unite lead + sourcing opportunity.

*(Implementation notes for Alex: depends on the answer to the Cato question — where does the broad brand/SKU reference data come from (a licensed catalog/GUDID/distributor data feed/trade data)? Overlaps the quoting engine + the A4 resiliency/"Add Us as a Vendor" flow + lead capture (A3 professional-email gate). The "Two ways to buy" homepage section already frames stocked vs. source — this RFQ extends the "source" side to ANY item.)*

---

## Manufacturer / Vendor Self-Service Portal (NEW MODULE)

**The ask:** Build a **vendor/manufacturer portal** where approved foreign manufacturers manage their own accounts — so we stop emailing spreadsheets back and forth. Capabilities:

- **Manage their product catalog** — the products that feed the quoting engine (add/edit items, specs, packaging, MOQs, etc.).
- **Self-update pricing** — when they receive a price-confirmation notice, they update their own FOB pricing directly in the portal (no spreadsheet round-trip).
- **Multi-language / translation** — these are foreign vendors; the portal must translate into multiple languages so they can operate in their own language.
- **Some level of control, scoped** — they manage their data, but Unite controls what's exposed to buyers and approves changes (vendors don't get free rein over the live quote surface).
- **Unite admin side of the same portal** — Unite needs admin access to **create our own quotes and manipulate pricing/data as the admin** over the top of vendor-supplied data.

**Price-validity + reminder workflow (drives the portal):**
- Standard ask: manufacturers **hold firm pricing for 90 days** (quarterly cadence). Rationale: long enough for our quote→approval→production cycle, short enough that vendors will commit vs. padding the price.
- System tracks, **per manufacturer + per item:** quote/pricing **submission date** and **expiration date** (submission + 90 days).
- System sends **automated reminders** as expiry approaches, asking the vendor to confirm pricing is **same / higher / lower**, and to update it in the portal.
- Vendor updates pricing in the portal → engine uses the new price going forward; old quotes flagged as built on expired pricing.

**Vendor edits are APPROVAL-GATED (decided — default):** vendor-submitted catalog/pricing changes do **not** go live to the quote surface automatically. The vendor submits → **Unite reviews and approves** → only then does the change reach the quoting engine. Rationale: a vendor bumping a price mid-deal could blow up a quote already given to a customer; Unite stays in control of the number buyers see. (Trusted-vendor "instant-live" is explicitly NOT the default.)

**Incoterm + currency standard (informs the data model):**
- Standard quote basis is **FOB (named origin port), in USD**. FOB is what the landed-cost engine is built to start from (it already models ocean → brokerage → drayage → duty → receiving on top of FOB-origin). EXW pushes foreign inland/export costs onto us; CIF hides freight inside their price and kills our freight rate-shop/markup — so FOB is the standard ask.
- The FOB port also satisfies the "shipping port" field (FOB names the port by definition).
- Master intake template header states **"All pricing in USD unless otherwise noted"** + a single **Currency** field per vendor (defaults USD) for the few who quote local currency → PRD-22 conversion handles the rest. No per-line currency column.

**Why / context:** At scale, emailing spreadsheets back and forth with dozens of foreign manufacturers is unmanageable and error-prone. A self-service portal where vendors maintain their own catalog + pricing — with automated quarterly price re-confirmation — keeps the quoting engine's data fresh without manual chasing. Translation is non-negotiable because the vendors are foreign. Unite retains admin override to build/manipulate quotes and control what reaches buyers. This is the seamless, self-maintaining data layer the whole quoting engine depends on.

*(Implementation notes for Alex: overlaps existing PRD-07 vendor approval + PRD-22 multi-currency/translation + the quoting engine. Likely a new PRD. The reminder loop ties to the email/notification layer (PRD-05) and a scheduled job. Consider whether vendor edits go live immediately or require Unite approval before hitting the quote surface — recommend approval-gated.)*

---

## BUGS / FIXES FOR ALEX (found during site review)

### B1. Homepage product rail won't scroll on desktop (mouse)

**The bug:** The featured-product carousel on the homepage ("In stock, shipping today" section) can't be scrolled with a normal desktop mouse. Cards bleed off-screen to the right but there's no visible way to advance them.

**Diagnosis (already traced in code):** The rail (`.um-rail` in `src/pages/Homepage.jsx` ~line 272 + `src/index.css` ~line 464) is built as a horizontal scroller (`overflow-x:auto; scroll-snap-type:x mandatory`) but the **scrollbar is deliberately hidden** (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`). So it only works via trackpad two-finger swipe or touch/mobile. On a plain mouse there's no scrollbar, no arrows, and the vertical wheel doesn't move it horizontally — so it reads as broken. There's a small "SCROLL" text hint but no actual affordance.

**Fix (Alex — interaction logic, not copy):** Add a real affordance. Best→: (1) prev/next arrow buttons that scroll one card; (2) map vertical mouse-wheel → horizontal scroll on hover; (3) click-drag ("grab & pull"); (4) at minimum, show a thin scrollbar. Recommend (1) — clearest and works for everyone.

### B2. Homepage "IN STOCK" badge is hardcoded, not real stock

**The bug:** Every card in the homepage featured-product rail shows an "IN STOCK" pill unconditionally — it is NOT checking inventory. (`Homepage.jsx` ~line 329–339 renders the badge with no stock condition.)

**Why it matters:** The page asserts "IN STOCK" on specific named products (and the hero says "In stock, shipping today") without verifying — a substantiation risk if any featured item isn't actually stocked.

**Fix (Alex):** Wire the badge to the same real availability data the Catalog page already uses (`Catalog.jsx` shows "IN STOCK" vs "LOW" off `availability` / the WMS projection). Make the homepage badge conditional on real on-hand−reserved, or drop it on items not verified in stock. Note: the homepage "Live Inventory" widget already reads real WMS data, so the data hook exists — the featured rail just isn't using it.

---

## MERCHANDISING & AVAILABILITY STRATEGY (catalog presentation — core business problem)

**The core problem Damon is solving:** Unite is genuinely deep in a few categories but can't deep-stock everything as a smaller company. A site that only shows a handful of "in stock" SKUs makes Unite look thin / like it stocks "a few things here and there." We need the catalog to look full and credible WITHOUT either (a) falsely claiming deep stock, or (b) hiding items that are temporarily out.

**Stock reality (what Unite actually carries):**
- **Stocked & Ready at all times (always in stock):** Orthopedic **bracing**, **diagnostic tests** (POC + OTC), **American-made PPE**, **syringes**, and **supplements**. These are the core always-available categories and should be merchandised as reliably in stock.
- **Heavily stocked (main movers):** Bracing — historically the #1 category. Diagnostic tests — #2 mover.
- **Stocked at lower levels (can briefly go out of stock):** other PPE / Medava items that occasionally dip — but Unite can reliably re-source these from the manufacturer **domestically** (NOT long-lead overseas), so a stockout is short and low-risk.

### M1. Never hide an item for being out of stock (at least not on the home page)

**The ask:** Do **not** remove/hide a product just because it's currently out of stock — at minimum never on the home page. Out-of-stock commonly-stocked items should still show, with a path to **"Quick Quote"** or **"order anyway,"** messaged around the fact that it's a commonly-stocked item Unite can source from the manufacturer quickly (no supply-chain issue, no long overseas delay). Hiding the OOS state more aggressively (only showing it once logged in, etc.) is acceptable for deeper catalog pages, but the home page should always look full.

**Why / context:** A small "in stock" SKU list makes Unite look like a tiny operation. The breadth of the catalog and the reliability of quick re-sourcing are just as credible as raw stock depth. PPE/Medava/supplements stock out at low levels but Unite can refill fast from domestic manufacturers — so an "order anyway / quick quote" path keeps the sale and the credibility instead of showing an empty shelf.

### M2. Honest multi-tier availability model (not binary in/out)

**The ask:** Replace binary "IN STOCK / nothing" with an honest availability status per item, e.g.:
- **In Stock — Ships Today** (bracing + diagnostics depth)
- **Quick-Ship / Stocked to Order** (carried at lower levels or fast-replenished — "ships in X days"; covers PPE, Medava, supplements when low/out)
- **Available to Source / Quote** (catalog item Unite will source + quote — the resiliency play)

This makes a large catalog look full and credible, every item is purchasable some way, and Unite never falsely claims deep stock. (Ties to bug B2 — the hardcoded "IN STOCK" badge must be wired to real inventory for this to be truthful.)

**Why / context:** Lets Unite list a broad catalog (credibility + SEO) while only tying up cash in proven movers. Standard distributor "long tail, shallow shelf" model — quoting engine + vendor network powers the tail.

### M3. Demand-driven stocking (use the site as the signal)

**The ask:** Track which items get **requested / quoted often** and surface that as data. When an un-stocked (or low-stocked) item is repeatedly requested, that's the data-backed trigger to bring it into stock (or deepen it). Use quote requests + "source this" clicks + reorder patterns as the demand signal (ties to existing PRD-12 run-rate replenishment / forecasting).

**Why / context:** As a smaller company Damon wants to grow the stocked range on **proven demand, not guesses** — capital-efficient. The site becomes the instrument that tells Unite what to deep-stock next, with real data behind every stocking decision.

### M4. Dedicated Diagnostic Tests page (brand-neutral, SEO-focused) — HIGH PRIORITY

**The ask:** Build a **standalone page dedicated to Diagnostic Tests** (separate from the general catalog), positioned around Unite being **brand-neutral** on diagnostics. Key elements:
- **Brand-neutral messaging:** "Don't see your brand? Just ask" — Unite can source across brands, not locked to one.
- **Highlight all test categories covered:** COVID, flu, HIV, strep, etc. (full menu of what we can supply).
- **Highlight supply capabilities:** wholesale; **retail (EDI, bulk orders, bulk discounts)**; **private label**; POC + OTC.
- **SEO-optimized** so **retail buyers** searching for diagnostic tests find Unite and come to us.

**Why / context:** Diagnostics is Unite's #2 mover and a major growth lane, especially into **retail**. A dedicated, brand-neutral, SEO-strong page targets retail buyers looking for test supply (bulk, EDI, private label) — a different and larger audience than the medical-provider segments. "Don't see your brand, just ask" reinforces the sourcing/resiliency model specifically for diagnostics. Damon explicitly wants to rank in search here to pull in new retail buyers.

### M5. Lead with category strength (Bracing + Diagnostics as hero "Stocked & Ready")

**The ask:** Merchandise **Bracing/Orthotics** and **Diagnostics (POC + OTC)** as the hero "Stocked & Ready — ships today" categories. Consider category tiles (e.g. "Bracing — deep stock," "Diagnostics — POC & OTC," "PPE / supplements — quick-ship," "Need something else? We'll source it") instead of relying only on a small "in stock" product rail to carry credibility.

**Why / context:** Owning two categories deeply reads as **focused and expert**, not thin. Category breadth + sourcing capability should carry the homepage's credibility, not a 4-card stock list (this also addresses why the current featured rail makes Unite look thin).

---

## SERVICE / REVENUE AREA: Restore Robotics — Remanufactured Da Vinci Robotic Instruments (NEW — major, missing from site)

**The ask:** Add a dedicated service area (its own tab/page, likely 1–2 pages) for Unite's role as an authorized **distributor/representative of the Restore Robotics / Encore Medical** remanufactured robotic-instrument program. This is currently **missing entirely** from the Services / capabilities on the site, yet it is now a **significant part of Unite's annual revenue**. It needs prominent placement plus clear contact paths for new hospitals and sub-distributors.

**Reference for structure (do NOT copy content):** One of Unite's own sub-distributors built a site around the program — https://rocuvexmed.com/ — which is a good structural model (hero "reduce the cost of robotic surgery," how-it-works steps, FDA-clearance trust block, savings stats, sustainability angle, contact CTAs). Recreate something to this effect on Unite's site, but written for **Unite's role** and original to Unite — not a copy of the Rocuvex copy.

**What the page(s) should cover (program facts — already verified in the Restore Robotics session/briefing):**
- **What it is:** FDA **510(k)-cleared remanufactured** robotic instruments + certified pre-owned inventory for Intuitive **da Vinci Xi & DV5** surgical systems. Restore Robotics is the **manufacturer of record** and holds the industry's only FDA 510(k) clearance to remanufacture these instruments; **Encore Medical** is the master distributor. **Unite Medical is an authorized distributor/representative** in this chain.
- **The value prop:** hospitals access remanufactured / certified pre-owned instruments at materially lower cost — **~20% savings (remanufactured), ~25% (certified pre-owned)** — with full warranty coverage (manufacturer of record), no compromise to clinical performance.
- **How it works (collection → remanufacture loop):** free collection trays + reusable shipping containers provided to the hospital at no cost → used instruments shipped back free → multi-step evaluation, cleaning, testing, QC, electrical verification under the 510(k) → certified instruments returned to market. Minimal disruption to existing surgical workflow.
- **Trust / compliance block:** FDA 510(k) clearance, manufacturer-of-record warranty, quality-control steps (visual inspection, functional performance testing, electrical verification, QC validation).
- **Sustainability angle:** remanufacturing reduces surgical waste + carbon footprint vs. new instruments (a real selling point to hospital sustainability initiatives).
- **Unite's role specifically:** authorized regional distributor/representative — single point of contact for hospitals to get onboarded, place orders, manage collection logistics, and realize the savings. (Internally Unite uses the Restore distributor portal for orders/tracking/payments.)

**Contact / conversion paths needed:**
- **For hospitals:** "Request a Savings Analysis" + "Schedule a Consultation" (or similar) CTAs → capture lead (facility, contact, da Vinci system model, instrument volume).
- **For new sub-distributors:** a path for interested distributors to contact Unite about repping the program under Unite.
- Route these leads into the CRM (HubSpot) like other Unite inquiries.

**Why / context:** This program is a **significant and growing share of Unite's annual revenue**, but the website says nothing about it — a major gap between what Unite actually does and what the site represents. Unite is a **representative/distributor for the Restore Robotics program**, and we want new hospitals and potential sub-distributors to find this capability on the Unite site and reach out. The Rocuvex site shows a sub-distributor already marketing it well; Unite (higher in the chain) should have an equally strong or stronger presence. This also reinforces Unite's broader positioning (cost-reduction partner, resiliency, sustainability) to the hospital audience we're trying to win (ties to the A1 Hospitals segment + A4 resiliency asks).

*(Implementation notes for Alex: new Services sub-area + nav entry; lead-capture forms → HubSpot; likely its own page route(s) under /services. Keep all claims tied to verified program facts (FDA 510(k), 20%/25% savings, manufacturer-of-record warranty) — same truthfulness standard as the rest of the site. Source material: the Restore Robotics program briefing in Damon's Unite_Medical/Restore_Robotics library.)*

---

## SITE-WIDE CONSISTENCY CLEANUP (existing copy that today's decisions contradict)

> This section tracks **existing copy that must change** because of decisions made in the 2026-06-29 review — separate from the forward-looking feature asks above. As Damon reviews, new contradictions get added here. **Note:** "landed cost" language is CORRECT and should stay in the sourcing/quoting flow (Quote, QuoteNew, PortalQuote, ShortageMatch, Services source-card, and all backend WMS/quoting internals) — it is only wrong when applied to stocked/wholesale goods. Don't strip it from the sourcing path.
>
> **WORKING STANDARD (decided 2026-06-29):** For every page Damon reviews, the agent does two things: (1) log Damon's explicit flags, AND (2) proactively scan that page's copy for contradictions with the running decisions below and add them here. Don't wait for Damon to spot each one. Recurring decision checklist to scan against: single Georgia warehouse (no Nevada/Las Vegas/Reno/two-warehouse/both-coasts); no "own/warehouse everything / zero middlemen / no brokered / no third-party" absolutes; wholesaler positioning (no landed-cost on stocked goods); "no minimums" scoped to stocked items only; segments include Hospitals/Retailers/Brand Owners; Diagnostics broken out; Restore Robotics program present; stocked-&-ready core = bracing, diagnostics, American-made PPE, syringes, supplements.

### C1. Homepage "OWNED INVENTORY" fact band — contradicts multiple decisions (`Homepage.jsx` ~382–444)

The whole `OwnedInventory` band is built on the old "we own & warehouse everything, zero middlemen" story and conflicts with today's positioning:

- **Line 427 — FACTUAL ERROR (highest priority):** `'2', 'Warehouses', 'Lithia Springs, GA and Las Vegas, NV — coverage on both coasts.'` → Unite has ONE warehouse (Lithia Springs, GA). This was missed in the 2026-06-29 Nevada→Georgia sweep (commit d74325b). Fix to a single Georgia warehouse; drop "both coasts" / "Las Vegas, NV". **Las Vegas, NV is a new variant of the Nevada error — confirms the sweep needs to be exhaustive.**
- **Line 426 — `'0', 'Middlemen', 'Inventory owned and shipped from Unite-operated distribution centers.'`** → contradicts the reality that Unite sometimes sources & sells without ever stocking, and is a distributor within multi-tier chains (e.g. Restore Robotics). "0 middlemen / all owned" overclaims.
- **Line 440 — headline `'Most supplies cross four distributors before they reach you. Ours cross zero.'`** → the "zero distributors / zero middlemen" claim conflicts with the global-sourcing + quoting model and with Unite being a distributor/rep in programs like Restore. Reframe.
- **Lines 443–444 — `'We buy direct from manufacturers, hold the stock in our own buildings, and ship it ourselves. No brokered inventory, no surprise substitutions, no third-party markups.'`** → "hold the stock in our own buildings" + "no brokered inventory" contradicts source-and-never-stock and the wholesale/global-supply-chain repositioning.

**Direction:** rework this band so it celebrates Unite's genuine strengths (direct relationships, owned stock on core categories, fast domestic re-source, transparency) WITHOUT claiming it owns/warehouses everything or has zero middlemen. Keep it truthful to the two-model reality (stock + source).

### C2. Homepage hero — "source, stock, and ship" + "Landed cost" on stocked goods (`Homepage.jsx` ~75–77)

`'We source, stock, and ship Class 1 and Class 2 medical devices… warehouse everything we sell. No minimum orders on stocked items. Landed cost, transparent.'` → already flagged in Homepage-copy decisions: "warehouse everything we sell" is false; "Landed cost" must not describe stocked/wholesale goods (Unite is a wholesaler by design, not selling stock at landed cost). Replace with the new wholesale/global-supply-chain hero blurb.

### C3. Shortage-list matching — overclaims real-time stock matching Unite can't actually do (3 places)

**The problem:** The "Backordered somewhere else? Paste your shortage list" section claims Unite **matches every line against stocked inventory in real time and surfaces in-stock equivalents**. That overstates current capability and frames it as "Unite (or a 3rd party) has it in stock right now." Reality today: a customer uploads their shortage list and **Unite comes back with a QUOTE** — we do **not** have live APIs into other companies' sellable stock. Damon does not want to claim real-time stock matching we can't deliver.

**Appears in 3 places (all need the same reframe):**
- `src/pages/Homepage.jsx` ~496–503 — "Backordered somewhere else? / Paste your shortage list." + "We match every line against stocked inventory in real time, surface in-stock equivalents, and route the rest to our sourcing network."
- `src/pages/ShortageMatch.jsx` ~98 + ~168–170 — same "match against stocked inventory in real time / in-stock equivalents" copy (meta description + hero sub).
- `src/pages/SupplyRisk.jsx` ~154 — "Paste your shortage list. We'll match it against live stock."

**Reframe direction:** Lead with **"upload/paste your shortage list → Unite returns a quote."** Position it as the resiliency play (the partner you turn to when your usual channel is backordered) and our sourcing network — NOT as a real-time in-stock lookup across third parties. Keep it honest: we source and quote, we don't (yet) show live third-party stock. (Unite's OWN stock can legitimately be matched in real time via the WMS — fine to say we check our own inventory and quote/source the rest. The overclaim is specifically "real-time in-stock equivalents" implying broad live availability.)

**NOTE / QUESTION FOR ALEX (capability research):** Is there a supply-chain data source/API that exposes **other companies' real-time sellable stock** (e.g. distributor availability feeds, marketplace inventory APIs) that we could port into Unite? **Reference the Cato site** — figure out how they appear to match/quote against broad inventory. If we CAN get real-time availability via API, great — then this copy could truthfully claim real-time matching. Until then, copy must stay at "upload → we quote." Don't claim it before we can do it. (Ties directly to the Cato-style open RFQ ask above — same underlying data question.)

### C4. Segment/services gaps (existing pages don't reflect new scope)

- Services + segments do not surface **Hospitals, Retailers, Brand Owners** (see A1), **Diagnostic tests as a category** (see M4), or the **Restore Robotics program** (see Restore section) — all now core. Existing Services/Segments copy will need expansion, not just new pages.

### C5. Sweep still to do (Damon will keep flagging; Alex/agent to do exhaustive pass)

Recurring themes to grep the WHOLE site for before launch, since today's review keeps surfacing stragglers one screenshot at a time:
- Any remaining **"Nevada / Las Vegas / Reno / two warehouses / both coasts / west warehouse"** in customer-facing copy.
- Any **"own/warehouse everything / zero middlemen / no brokered / no third-party"** absolute claims.
- Any **"source, stock, and ship"** or **landed-cost** language applied to stocked/wholesale goods (vs. the sourcing flow, where it's correct).
- Any **"no minimums"** stated globally rather than scoped to stocked items (sourcing/quoting has MOQs).

---

## Homepage copy (related decision)

- New hero blurb positions Unite as a **global supply chain company, specialty in medical**, and explicitly as a **wholesale distributor** — separating the two models: **stocked catalog (fast reorder)** vs. **sourced-to-spec (quoting engine, minimums apply)**. Avoids implying we stock everything we sell.
- **Pricing language correction:** We do **not** sell stocked inventory at landed cost — we are a **wholesaler by design** (wholesale margin). "Landed cost" language should appear **only** in the sourcing/quoting flow (imported/sourced goods), never as a blanket homepage or stocked-catalog claim.
- Note: the quoting/sourcing path **does** carry minimum order quantities — homepage messaging should stay global and not promise "no minimums" across the board (no-minimums applies to stocked items only).

---

*More additions to come — Damon is continuing this list.*
