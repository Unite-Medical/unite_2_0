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

**Every stocked SKU must be assigned its availability tier (decided 2026-06-29):** Unite's current stock needs to be grouped into one of these tiers — it's a required attribute per SKU, distinct from product category (M6). The always-Stocked-&-Ready core — **bracing, diagnostic tests, American-made PPE, syringes, supplements** — maps to the **"In Stock — Ships Today"** tier. Other lower-level / occasionally-out items map to **Quick-Ship**, and catalog items Unite doesn't physically carry map to **Available to Source / Quote**. So every SKU carries TWO classifications: (1) product category [M6] + (2) availability tier [this]. The tier drives the badge shown on the site (must read real inventory per B2).

**Why / context:** Lets Unite list a broad catalog (credibility + SEO) while only tying up cash in proven movers. Standard distributor "long tail, shallow shelf" model — quoting engine + vendor network powers the tail.

### M3. Demand-driven stocking (use the site as the signal)

**The ask:** Track which items get **requested / quoted often** and surface that as data. When an un-stocked (or low-stocked) item is repeatedly requested, that's the data-backed trigger to bring it into stock (or deepen it). Use quote requests + "source this" clicks + reorder patterns as the demand signal (ties to existing PRD-12 run-rate replenishment / forecasting).

**Why / context:** As a smaller company Damon wants to grow the stocked range on **proven demand, not guesses** — capital-efficient. The site becomes the instrument that tells Unite what to deep-stock next, with real data behind every stocking decision.

### M4. Dedicated Diagnostic Tests page (brand-neutral, SEO-focused) — HIGH PRIORITY

**The ask:** Build a **standalone page dedicated to Diagnostic Tests** (separate from the general catalog), positioned around Unite being **brand-neutral** on diagnostics. Key elements:
- **Brand-neutral messaging:** "Don't see your brand? Just ask" — Unite can source across brands, not locked to one.
- **Highlight all test categories covered:** COVID, flu, HIV, strep, etc. (full menu of what we can supply).
- **Highlight supply capabilities:** wholesale; **retail (EDI, bulk orders, bulk discounts)**; **private label**; POC + OTC.
- **Unite's OWN private-label diagnostics line (IN PROGRESS — new 2026-06-30):** Unite is in the process of developing its own private-label diagnostic tests. The page should be built to feature a Unite-branded diagnostics line alongside the brand-neutral sourcing — i.e. "we supply every major brand AND our own line." (Don't over-claim until the line is live; build the structure so it's ready to feature when it launches. Confirm launch status with Damon before publishing specific Unite-branded products.)
- **SEO-optimized** so **retail buyers** searching for diagnostic tests find Unite and come to us.

**Why / context:** Diagnostics is Unite's #2 mover and a major growth lane, especially into **retail**. A dedicated, brand-neutral, SEO-strong page targets retail buyers looking for test supply (bulk, EDI, private label) — a different and larger audience than the medical-provider segments. "Don't see your brand, just ask" reinforces the sourcing/resiliency model specifically for diagnostics. Damon explicitly wants to rank in search here to pull in new retail buyers. Unite's forthcoming **own private-label diagnostics line** adds a second pillar: not just sourcing others' brands, but offering Unite-branded tests (higher margin, deeper differentiation).

### M5. Lead with category strength (Bracing + Diagnostics as hero "Stocked & Ready")

**The ask:** Merchandise **Bracing/Orthotics** and **Diagnostics (POC + OTC)** as the hero "Stocked & Ready — ships today" categories. Consider category tiles (e.g. "Bracing — deep stock," "Diagnostics — POC & OTC," "PPE / supplements — quick-ship," "Need something else? We'll source it") instead of relying only on a small "in stock" product rail to carry credibility.

**Why / context:** Owning two categories deeply reads as **focused and expert**, not thin. Category breadth + sourcing capability should carry the homepage's credibility, not a 4-card stock list (this also addresses why the current featured rail makes Unite look thin).

---

## A5. "Start a quote" → multi-path quote router (APPROVED by Damon)

**The ask:** Today a single "Start a quote" button sends every visitor into one generic form, but Unite has ~3 distinct quote types for ~3 customer types. Replace the single destination with a **chooser/router**: the first question is "What do you need?" with clear paths, then each path asks only its relevant fields and tags the lead by type in HubSpot. Keep the button label "Start a quote."

**The 3 paths (starting point — refine as needed):**
1. **Source a specific product / brand** (provider/customer RFQ — the Cato-style "find me this item") 
2. **Custom quote** — source a product to spec, the customer's label (private label) OR a Unite label (distributor / brand owner — quoting engine, FOB, MOQs). NOTE: avoid the bare term "private label" as the path name — the real service is custom sourcing + quoting where the product can carry the customer's brand OR Unite's; "Custom quote" captures that, "private label" is too narrow.
3. **I have a shortage list** (resiliency buyer — shortage-list upload → quote)

**Why / context:** One generic form makes every buyer answer irrelevant questions and hands the team an untyped lead. Routing up front = higher completion, cleaner CRM segmentation, and each customer feels the page was built for them. Ties to the Cato-style open RFQ, Quick Quote (A3), and the shortage matcher (C3). Sell capability/outcome on each path; never expose the engine's mechanism (IP rule).

*(Implementation for Alex: interstitial chooser or dropdown on the /quote entry; per-path field sets; lead-type tag → HubSpot. Damon approved the chooser approach 2026-06-29.)*

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

**STRATEGIC DIRECTION (Damon, confirmed — this is NOT an afterthought, build real structural pages):** The Restore Robotics program is a **one-of-a-kind "trojan horse"** to get Unite Medical into large hospital systems. The hardest part of Unite's business is getting added as an approved vendor (A4 resiliency). The robotics program is a high-value, low-friction way in: **earn the system's trust by saving them money on robotic instruments first, then expand into supplying them with Unite's full range of capabilities (bracing, diagnostics, PPE, sourcing/quoting, private label, 3PL, etc.) over time.** The site must be the VEHICLE for this land-and-expand play. So:
- Build **dedicated structural page(s)** for the program — a real, standalone marketing destination (not a single buried page). Treat it with the same weight as a flagship service.
- **Reference site for Alex:** https://rocuvexmed.com/ (a Unite sub-distributor's program site). Share with Alex and get his thoughts on how Unite can properly build a site of this caliber/structure — and BETTER — that drives interested hospitals to engage. Unite sits ABOVE Rocuvex in the chain, so Unite's presence should be stronger.
- Optimize to **drive new hospitals into the program** (savings-analysis / consultation lead capture → HubSpot), positioned as the entry point to a broader Unite relationship.
- Keep the long game explicit internally: robotics is the door-opener; the goal is to become these systems' broader medical supply partner. (Public copy sells the robotics value honestly; the land-and-expand intent is strategy, not a public claim.)

*(Implementation notes for Alex: new Services sub-area + nav entry; lead-capture forms → HubSpot; likely its own page route(s) under /services or a dedicated /robotics path. Keep all claims tied to verified program facts (FDA 510(k), 20%/25% savings, manufacturer-of-record warranty) — same truthfulness standard as the rest of the site. Source material: the Restore Robotics program briefing in Damon's Unite_Medical/Restore_Robotics library. Damon confirmed 20%/25% savings + "manufacturer of record / only 510(k)" OK to publish.)*

---

## CONTENT UPGRADE: TJS Case Study page — sell the capability, not just report it (`/case-studies/tjs`)

**The ask:** Rework the Total Joint Specialists case study (`src/pages/CaseStudyTJS.jsx`) to do two jobs much better: (1) **showcase Unite's full capability** to stand up a branded store end-to-end, and (2) **sell the solution to NEW potential customers** who could want the same thing. Current page is thin — just 3 short paragraphs (challenge / solution / result) + two buttons. It documents what happened but doesn't market the capability or help a prospect picture "Unite could do this for me."

**What to add / improve:**
- **Lead with the capability story, framed for prospects:** Unite turns an idea into a live, branded, fulfilled e-commerce store with no internal supply-chain/fulfillment team required by the partner. Make TJS the proof, not just the subject.
- **Spell out the end-to-end capabilities demonstrated** (this is the selling part) — e.g.: store build/design, **private-label manufacturing** (bracing + recovery products under the partner's brand), catalog + pricing, **Force Therapeutics** integration into the patient pathway, **direct-to-patient fulfillment** from the GA warehouse, same-day processing, inventory/WMS, branded-everything (surgeon's brand on every touchpoint), ongoing reorders/analytics.
- **Quantify results where real data exists** — orders, processing time, conversion, units, reorder rate (Damon has TJS analytics from prior reporting; use real numbers, do not fabricate). Stats sell.
- **Add a "Could this be your store?" / who-it's-for block** — explicitly invite other orthopedic groups, physician practices, brand owners, retailers who want a turnkey branded recovery/e-commerce store. Clear CTA to contact Unite to build theirs.
- **Tie to the broader positioning:** this is a flagship example of Unite as a turnkey supply-chain + private-label + fulfillment partner (supports the Brand Owners / Retailers segments in A1 and the private-label service).
- Keep the existing CTAs (visit TJS store, private-label/manufacturing) but add a primary **"Build my store / talk to us"** lead-capture CTA → HubSpot.

**Why / context:** Damon wants this page to actively **bring the TJS store to market AND sell the solution to new customers**. Right now it under-sells what is actually a powerful, differentiated capability (idea → manufactured-under-your-brand → live store → direct-to-patient fulfillment, all by Unite). A prospect should leave this page understanding the full scope and wanting the same for their brand.

**Consistency check (passed):** page correctly says single "Georgia warehouse," private-label framing is accurate, no Nevada/own-everything/landed-cost-on-stock contradictions. Claims CONFIRMED true by Damon (OK to lean on / expand): Unite manufactures the bracing/recovery products, Force Therapeutics integration, same-day processing.

---

## CONTENT: Compliance page — corrections (Damon-approved) (`src/pages/Compliance.jsx`)

All Damon-confirmed during 2026-06-30 review.

1. **ISO 13485 — add an "IN PROGRESS" status button/badge.** Damon wants ISO 13485 listed with a small pill/badge that says **"IN PROGRESS"** — styled like the product "IN STOCK" badge (rounded pill, brand colors). Currently it's only mentioned in the Policies text ("Pursuing ISO 13485 certification"). Surface it visibly as a credential-style item with the in-progress badge. (ISO pursuit CONFIRMED active by Damon.) ALEX: reuse the in-stock pill component/pattern for a generic status badge.

2. **"Veteran-Owned · DD214 Verified · ID.me verified" tile (line 24) — KEEP, accurate.** Damon confirmed via ID.me wallet: Military status VERIFIED 12/14/2020. (Note: keep as "veteran-owned" descriptor — NOT a VOSB cert claim.)

3. **PDAC tile (line 27) — fix scope + trademark:** "All orthotics + RegeniCool Pro" → **"All Unite Medical orthotics + RegeniCool™ Pro"** (scope to Unite Medical line; add ™ per C9).

4. **"MDR-eligible reports filed to FDA on the customer's behalf when requested" (line 35) — CORRECT THE CLAIM.** Damon: Unite files MDRs **on behalf of Unite and its OWN products — NOT on behalf of customers and their products.** Reword to: "Lot-level traceability for recall management. As the manufacturer/distributor of record, we file MDR-eligible reports to the FDA for our own products." Remove "on the customer's behalf."

5. **"Audit-ready. Inspector-friendly... State board, DEA, FDA, JCAHO... before they finish their second cup of coffee" (lines 172–176) — CHEESY + INACCURATE, edit or drop.** Damon: drop the cheesy "cup of coffee" bravado. Also DEA reference is questionable (Unite doesn't handle controlled substances) — drop DEA. Reframe to a straight, factual statement about supplier-qualification documentation being available to regulators/health-system auditors. (Note: this is Unite Medical's site; Unite Pharma is unrelated to it — don't pull pharma/DEA framing in here.)

6. **ISO 13485 "Pursuing" in Policies (line 33) — KEEP** (confirmed actively pursuing) — and tie to the new IN PROGRESS badge from #1.

7. **BAA / HIPAA (doc library, line 58) — KEEP.** Damon confirmed: Unite has a BAA on file, available if needed.

8. **Email routing — standardize to support@unitemedical.net.** Doc-request handler currently sends to `info@unitemedical.net` (line 46). Damon: use **support@** in ALL email instances site-wide unless there's an industry-standard reason otherwise (info@ is real but no reason to use it). ALEX: sweep site for any `info@` / other addresses → standardize to support@unitemedical.net. (Site-wide, not just this page.)

9. **Consistency scan:** FDA/BPA/CAGE/DUNS numbers correct; "via authorized SDVOSB partner" accurate; ISO honestly "pursuing." No warehouse/own-everything/landed-cost issues.

---

## CONTENT: Catalog page — corrections (Damon-approved) (`src/pages/Catalog.jsx`)

1. **Hero "Everything in stock" + eyebrow "STOCKED & SHIPPING SAME DAY" (lines 87, 90) — reword.** Don't claim everything is in stock (contradicts M1/M2 — catalog should show items across availability states, including OOS). Damon: "go with wording that makes the most sense." Recommended hero → **"The Unite catalog"** (or "Everything we carry"); eyebrow → **"CATALOG · STOCKED + SOURCED"**. Agent to finalize wording that fits the 3-supply-state model below.

2. **"updated 04 min ago" (line 92) — REMOVE.** Hardcoded fake freshness string. Damon confirmed: drop it (keep the results count, drop the "· updated 04 min ago").

3. **🔴 BIG ONE — replace the binary IN STOCK/LOW badge with the 3 REAL supply states (TAG ALEX: structure + confirm capabilities, model after Cato's site cato.com).** Damon confirmed there are **3 genuinely different supply situations** — NOT a vague "quick-ship" middle. Reframe the middle tier around the **Cato sourcing model** ("Cato finds out-of-stock, backordered, and on-allocation medical supplies"). The 3 states:
   - **(1) In Stock** — Unite stocks it deeply, ships today (core: bracing, diagnostics, American-made PPE, syringes, supplements).
   - **(2) Source / Resiliency (the Cato model)** — items that are out-of-stock / backordered / on-allocation in the broader market that Unite can **find and source** for the customer. This REPLACES the fuzzy "quick-ship" label. It's the supply-gap-solver / resiliency play (ties to A4 resiliency, C3 shortage-list, Cato-style RFQ).
   - **(3) Available to Quote** — open RFQ on items not in Unite's catalog (the broadest "source anything" path).
   **ALEX:** Damon wants your help on the STRUCTURE of this (how the 3 states are modeled/displayed) and to CONFIRM what's technically/operationally capable — especially the Cato-style "find disrupted supply" data. Reference Cato's site (https://cato.com or the screenshot: "What Supply Gap Can We Help You Solve Today?" + "Disrupted Medical Supplies Recently Sourced" live catalog). This overlaps the earlier Cato-style open-RFQ + real-time-stock-API question (C3) — same underlying capability question. Per M1, out-of-stock items should still SHOW (not vanish) with a path to source/quote.

4. **Category filters (line 24, auto-derived from product data) — wire to the M6 product taxonomy** (Bracing, Diagnostics, American-made PPE, Syringes, Supplements, etc.) so filters are clean/canonical, not arbitrary data strings.

5. **Compliance filter checkboxes (lines 131–133, 148–150) — non-functional.** "PDAC-approved / Berry compliant / TAA compliant / MSPV listed" have no onChange/state — decorative only. ALEX: wire them up to actually filter, or remove. (Filtering by these is genuinely useful for procurement buyers — recommend wiring, not removing.)

6. **"no minimums on stocked items" SEO copy (lines 61–62) — KEEP, correctly scoped** to stocked items (matches the earlier no-minimums decision).

7. **Consistency scan:** real stock gating (available-to-promise, not raw on-hand) is GOOD; no warehouse/own-everything/landed-cost issues. The IN STOCK/LOW badge ties to bug B2 (must read real inventory — it does here, good) and now expands to the 3-state model above.

---

## CONTENT: Contact page — corrections (Damon-approved) (`src/pages/Contact.jsx`)

1. **Phone/email blocks — collapse the 4 redundant same-number blocks to 2 clean lines** (lines 128–141). Currently Sales/Support/General/Accounting all show the SAME number 833.868.6483 (redundant). Damon's structure:
   - **Accounting & Billing** → `accounting@unitemedical.net` · **833.868.6483 ext. 3**
   - **All other inquiries** (sales, support, general) → `support@unitemedical.net` · **833.868.6483** (general line, no extension)
   Drop the separate `sales@` and `info@` blocks from this page. Two lines total.

2. **Remove fake rep "Aidan Park"** (line 60 `owner: 'Aidan Park'`). There is NO Aidan Park rep — remove the fabricated name. ALEX: set lead owner to a real default/unassigned, or your actual routing owner.

3. **Lead notification email (line 76)** currently goes to `sales@unitemedical.net` → change to **support@unitemedical.net** (per the standardize-to-support rule + dropping sales@ from the page). (Unless Alex has a real sales-inbox routing reason — confirm.)

4. **SEO description (line 34)** "Sales, support, government, and billing all on 833.868.6483" — update to match the new 2-line structure (general line + accounting ext. 3).

5. **Segment-tagging BUG (line 57):** logic checks `form.reason.toLowerCase().includes('dealer')` but the reason option is "Distributor program" (no "dealer"). Distributor leads fall through to 'asc' segment instead of 'distributors'. ALEX FIX: match on 'distributor', not 'dealer'.

6. **Reason dropdown — align with the A5 quote-router + 3 supply states.** Current "Quote · stocked item" / "Quote · non-stocked / sourcing" should map to the same paths as A5 (source-a-brand / custom-quote / shortage-list) and the Catalog 3-state model, so leads tag consistently in HubSpot. ALEX/agent to reconcile the reason list with A5 once that's built.

7. **Consistency scan:** real HubSpot + lead DB integration is good; "every inbound goes to a real person" fine; no warehouse/own-everything/landed-cost/veteran issues. Phone 833.868.6483 confirmed correct earlier.

---

## CONTENT: Locations page — corrections (Damon-approved) (`src/pages/Locations.jsx`)

Consistency scan: ✅ CLEAN on the warehouse footprint — already correctly single Lithia Springs, GA (no Nevada/two-warehouse remnants). Fixes are content + one build item:

1. **Hero/eyebrow/map-label — REWRITE for accuracy (Option A, Damon-approved).** Current "Close to every dock" + "COVERAGE · CONUS" implies distributed locations. Replace:
   - **Eyebrow:** `GEORGIA WAREHOUSE · WE SHIP NATIONWIDE`
   - **Headline:** "One warehouse. *Every* zip code."
   - **Sub:** "Our Lithia Springs, Georgia warehouse ships to all 50 states and territories — same-day on orders placed before 2pm EST."
   - **Map label** (line 37): "COVERAGE · CONUS" → **"SHIPPING · ALL 50 STATES"**

2. **Remove the SKU count entirely** (lines 13, 60). Damon: remove SKUs stat. Drop "SKUs: {h.skus}" from the card and the `skus` field.

3. **Square footage = "Over 10,000 sq ft"** (Damon confirmed). Replace the "—" sqft placeholder with **"Over 10,000 sq ft."** So the card stat line shows just the sqft (SKU count removed).

4. **🔴 BUILD ITEM (Alex) — real hub-and-spoke US map.** The current "map" (lines 32–45) is a stylized CSS placeholder (a dot at hardcoded lat/lng percentages, coverage glow). Damon wants a **REAL US map** with the **Georgia warehouse as the origin point and lines radiating outward across the country** (to coasts/corners) — visually telling the "one location, nationwide reach" story (hub-and-spoke / distribution map). Static or subtly animated spoke lines from the GA pin to the 50 states. This accurately conveys *one origin → broad reach* (better than the vague coverage glow, and honest to the single-warehouse reality).

5. **Consistency:** "same-day before 2pm EST · ships to all 50 states + territories" matches other pages — keep. SEO already correct (single GA warehouse).

---

## CONTENT: Portfolio page — REBUILD (all 6 current cases are FABRICATED) (`src/pages/Portfolio.jsx`)

**🔴 SUBSTANTIATION:** All 6 current case studies are FAKE (Damon confirmed) yet presented as "Receipts. Real ones." / "Real numbers from real customers" — and they name real third parties (Medline, McKesson, a specific VA Medical Center, Cobb County EMS). Must fix. Damon LIKES the page structure/layout — KEEP the structure, replace the content. Plan = Option 2+3: real flagship cases + anonymized fabricated ones (NO names).

**Header copy fix:** "Receipts. Real ones." + "Real numbers from real customers" overclaims once content is partly illustrative/anonymized. Soften so we don't assert "real" over anonymized/illustrative items (e.g., "Proven outcomes." / "The work, in plain numbers." — keep the vibe, drop the literal "real customers" assertion). Agent to finalize.

### REAL flagship case #1 — TJS (Total Joint Specialists) — DATA PULLED + COPY APPROVED
Real data from the live TJS store DB (launched Apr 1 2026; pulled Jun 30 2026; source: `Damon_Test_2/TJS_Reports_2026-06-30/TJS_First90Days_Growth_CaseStudy.docx`). DECISION: lead with REVENUE GROWTH, not totals (totals are modest; store is only 90 days old). **ALEX: pull a real TJS store/location photo** (not a placeholder).

**Approved card copy:**
- Segment label: "Physician Group · Patient Recovery Store"
- Customer: Total Joint Specialists
- Headline stat: **+43%** · "revenue growth, launch month to month three"
- Blurb: "Unite built Total Joint Specialists a complete, branded patient-recovery store from scratch — a 49-product catalog, private-label bracing we manufacture, and direct-to-patient fulfillment from our Georgia warehouse. In its first 90 days, revenue grew every single month — up 43% from launch to month three ($5,278 → $7,547), on a rising average order value. The surgeon's brand stays on every touchpoint; we run everything behind it."
- Optional mini-stats (safe): "$19.3K revenue, first 90 days" · "49-product catalog, live at launch" · "Revenue up every month."

**DO NOT PUBLISH (per data-pack flags — keep off the page):** monthly ORDER count (June dipped 35→31 — lead with revenue), reorder/repeat rate (tiny 6-customer sample), margin/gross-profit % (incomplete COGS). Frame catalog as "launched with 49 products" NOT "added SKUs over time" (latter is false). If asked why June revenue rose while orders dipped: AOV rose +31% — honest answer ready.

### REAL flagship case #2 — Restore Robotics savings (NEW)
- **Stat: "$900K+"** · label "saved for hospital systems to date" (Restore Robotics remanufactured da Vinci program — real, current total savings Unite has delivered to hospitals using the program).
- **Blurb:** total savings Unite Medical has generated for hospital systems utilizing the Restore Robotics program — over **$900,000 to date** (20–25% per-instrument savings, FDA 510(k) remanufactured da Vinci instruments).
- **Image + program content:** ✅ Damon CONFIRMED — OK to scrape the Rocuvex site (rocuvexmed.com) for images AND program content; that's the reference Alex should use to build out the Restore Robotics program pages on Unite's site (structure, how-it-works, images, savings framing). (Earlier "don't scrape competitor" caution withdrawn per Damon — he wants Rocuvex used as the build template.)
- **🔴 ALEX BUILD — LIVE SAVINGS CALCULATOR:** wire this $900K+ figure to a **live savings counter that keeps increasing from real data**. The data currently lives in the **Restore portal**. **ALEX: tell Damon when you're ready to speak with Brad at Restore so Brad can build the data bridge you need.** (Until wired, show the static "$900K+ to date" — do not fabricate a fake-live number.)

### Real stat — Medava on MSPV (CONFIRMED)
- Stat: **"7"** · label "Medava SKUs on the national MSPV contract" (Damon confirmed: 7 SKUs currently on MSPV). Use as a gov-credibility proof point (card or stat).

### Remaining cases — anonymized fabrications OK (NO NAMES)
Damon OK with a few illustrative/fabricated cases AS LONG AS no real names. Rewrite the other 4 cards to remove ALL identifying names (no Medline, McKesson, named VA center, Cobb County, named ASCs/pharmacies/distributors). Use generic descriptors: "A 4-OR ambulatory surgery center," "An independent GA pharmacy," "A regional distributor," "A county EMS agency." Keep the stat/structure feel; frame as representative outcomes, not named-customer receipts. Don't name competitors at all.

**Consistency scan:** the page otherwise reuses standard components; no warehouse/own-everything/landed-cost/veteran issues. The ONLY problem was fabricated-as-real content + named third parties.

---

## M6. Classify all current stock into product categories (taxonomy)

**The ask:** Group **every SKU in Unite's current catalog** into one of Unite's core product categories. Working category set:
- **Bracing / Orthotics**
- **Diagnostic Tests** (POC + OTC; sub-categories by test type — COVID, flu, HIV, strep, etc.)
- **American-made PPE**
- **Syringes**
- **Supplements**
- (plus a catch-all / "Other" for anything that doesn't fit, and room to add categories — Medava, etc.)

Two parts:
1. **One-time classification pass** over the existing catalog — assign each current SKU to a category.
2. **Required field going forward** — category is a mandatory attribute when adding/uploading a new product, so the catalog stays organized (ties to A2 auto-generated product pages: capture category at upload).

**Note — two separate classifications per SKU:** (1) this **product category** [what it is], AND (2) the **availability tier** from M2 [how it's available — In Stock / Quick-Ship / Available-to-Source]. They are independent fields. The always-stocked core (bracing, diagnostics, American-made PPE, syringes, supplements) is the "In Stock" tier in M2; that is a different attribute from the product family here.

**Why / context:** These are Unite's real product families and the "Stocked & Ready" core (bracing, diagnostics, American-made PPE, syringes, supplements). Categorizing all stock enables: category-based browsing/merchandising (M5 hero category tiles), the dedicated Diagnostics page (M4), clean filtering in the catalog, and category-level SEO. Right now stock isn't reliably grouped — every item needs to live in a category so the site can present breadth by family rather than a flat list.

*(Implementation notes for Alex: product taxonomy field on the product model; backfill existing catalog; expose as catalog filter + drives category landing pages. Diagnostics needs test-type sub-categories. Confirm final category list with Damon before backfilling.)*

---

## CONTENT: Services page — corrections + new copy (Damon-approved) (`src/pages/Services.jsx` + `src/pages/ServicePDAC.jsx`)

All copy below is **Damon-approved** during the 2026-06-29/30 review.

**1. Distribution card — fix warehouse count (Nevada bug again).** Line 18 currently "Same-day shipping · 2 US warehouses · Ships to all 50 states + territories" →
→ **"Same-day shipping · Georgia warehouse · Ships to all 50 states + territories"**

**2. Quoting & Sourcing card — remove mechanism leak + "real-time" overclaim.** Line 31 →
→ **"Tell us what you need and get an instant, fully landed, compliance-checked quote — sourced from our vetted manufacturer network."**
(Do NOT call the quoting system "private label." Unite DOES offer private-label manufacturing as a separate real capability — keep that in the hero sub; just don't label the QUOTING engine private label.)

**3. Hero sub — KEEP as-is** (private-label manufacturing is a real capability): "Distribution, PDAC consulting, private-label manufacturing, and a sourcing platform. Built because our customers kept asking us to do more."

**4. NEW 5th service card — Restore Robotics.** Add a card for the Restore Robotics program → links to a dedicated **`/robotics` landing page** that gets the full multi-page build-out (see the Restore Robotics service section above; trojan-horse strategy). Damon confirmed: card → dedicated landing page with additional pages built out like the reference site.

**6. NEW 6th service card — Diagnostics (Damon approved).** Add a Diagnostics card → links to the dedicated Diagnostics page (M4) once built. Rationale: diagnostics is Unite's #2 mover; leaving it off the Services page undersells a core capability.

### PDAC value band (dark "PDAC & REIMBURSEMENT" section) — REWORKED (removes fabricated claims)

**Problem:** The old band fabricated a Medicare audit-response SLA ("documentation checklist," "same-day audit response / verification letter same day") that Unite never offered, and claimed "100% of our orthopedic line" when PDAC approval only applies to the **Unite Medical** branded line (Unite private-labels ortho for some retail-only brands that are NOT taken through PDAC).

**Headline — KEEP:** "Most braces stall at Medicare review. *Ours arrive billable.*"

**Body — REPLACE with:** "Every product in our Unite Medical orthopedic line is PDAC-approved and carries verified HCPCS L-coding. The code travels with the SKU — on the listing and on your invoice — so your bracing claims are ready to bill."

**Three stats — REPLACE with:**
1. **100%** · *PDAC-approved Unite Medical bracing line* — "Every Unite Medical orthosis is PDAC-approved." (Scoped to the Unite Medical line — NOT retail brands Unite private-labels without PDAC.)
2. **L-codes** · *On the listing and the invoice* — "Verified HCPCS L-code carried per Unite Medical bracing SKU and passed through to your invoice." **ALEX BUILD NOTE:** build the L-code into the product listings for Unite Medical bracing SKUs so it transfers onto the invoice via QuickBooks Online when invoiced. (Capability we can do; needs to be wired.)
3. **Per SKU** · *PDAC approval letter on file* — "Download the current PDAC approval letter from any Unite Medical bracing product page." (Replaces the fabricated same-day audit SLA; ties to the existing per-product letter download.)

**REMOVE entirely:** "documentation checklist," "same-day audit response," "verification letter same day" — fabricated, Unite does not offer these.

### PDAC Consulting page (`/services/pdac`) — fresh copy (NOT verbatim from old site; old text was reference only)

**Scope correction:** Unite consults on **durable medical equipment (DME) and orthotics ONLY** — NOT supplies, NOT prosthetics. (Do not use the full "DMEPOS" expansion implying all four.)

**Approved copy:**
> **PDAC Consulting — get your DME and orthotics coded right.**
> Unite Medical helps manufacturers and suppliers identify the correct HCPCS code for their durable medical equipment (DME) and orthotics before billing Medicare. Many of these items require a coding verification review by the PDAC contractor — and claims are denied when products aren't on the PDAC Product Classification List. We guide you through verification so your products are coded correctly and audit-ready.
> *Unite Medical makes no guarantee of reimbursement; medical necessity and payer documentation requirements remain the customer's responsibility.*

**Important distinction (keep clear on the site):** PDAC **consulting** (helping OTHER companies code their DME/orthotics) is a SEPARATE offering from the fact that Unite's OWN Unite Medical bracing line carries PDAC approval. Don't conflate the two.

---

## CONTENT: Government page — corrections (Damon-approved) (`src/pages/Government.jsx`)

**🔴 CRITICAL — veteran-status accuracy (Damon's actual situation):** Damon served honorably in the **Alabama Army National Guard (honorable discharge, DD214 on file)** but does **NOT hold VOSB or SDVOSB certification** — the VA determined he didn't meet the active-duty service requirement. RULE (strict, non-negotiable, government-facing): Unite may say **"veteran-owned" / "founded and led by a U.S. Army National Guard veteran"** — but must **NEVER claim VOSB or SDVOSB certification**, nor imply Unite holds a federal veteran set-aside. Claiming an uncertified set-aside on a gov page risks suspension/debarment.

**The accurate model (Damon confirmed):** Unite/Medava partnered with an **authorized SDVOSB** for the MSPV award. The **SDVOSB partner holds the certification/set-aside; Unite is the brand/product supplier behind them.** (This is the same "brand behind the partner" model as the Procurement page.)

**Fixes:**
1. **Hero headline "Veteran-owned. On contract."** — KEEP. It's accurate: Unite is veteran-owned, and Medava products ARE on contract (MSPV BPA) through the SDVOSB partner. No change needed (earlier softening suggestion withdrawn).
2. **Set-Asides section** (lines ~108–111) — ALL ACCURATE, KEEP AS-IS. "Medava products are available through SDVOSB contract channels via authorized partner. Unite Medical is a veteran-owned small business (CAGE 8MK70, SAM registered)." is correct: the SDVOSB partner holds the cert + set-asides (Unite/Medava sells through them), AND Unite genuinely IS a veteran-owned small business (self-claimable status that many health systems accept and that benefits Unite in supplier-diversity/bid contexts). The ONLY hard line: don't claim the formal VOSB/SDVOSB *certification* or a Unite-HELD federal set-aside (Damon doesn't hold that cert). "Veteran-owned small business" as a self-claimed descriptor is fine and SHOULD remain. (Corrected 2026-06-30 per Damon — earlier note wrongly flagged this for softening.)
3. **Credentials tile "MSPV BPA · via authorized SDVOSB partner"** (line 13) — KEEP (accurate); ensure it reads that the SDVOSB is the PARTNER, not Unite.
4. **MSPV-NG mechanism** (line 23, "via SDVOSB partner contract") — KEEP (accurate).
5. **GSA Advantage mechanism** — Damon-provided link: https://www.gsaadvantage.gov/advantage/ws/search/advantage_search?q=0:8MEDAVA&db=0&searchType=0 — ✅ DAMON CONFIRMED link loads Medava products. Keep/use it.
6. **"Request capability statements" CTA** (gov sales desk) — wire to the NEW 2026 cap statement (`Unite_Group_Capability_Statement_2026.pdf`) once hosted, instead of a generic doc request.

**Consistency scan:** otherwise clean — MSPV BPA number correct, Berry/Medava correct, no warehouse/own-everything issues. The ONLY substantive problem was the VOSB/SDVOSB overclaim, now corrected.

**SITE-WIDE veteran-status sweep (found via grep — apply the CORRECT rule):**
- RULE: "veteran-owned" and "veteran-owned small business" are BOTH FINE (true + self-claimable + beneficial). ONLY forbidden: claiming the formal VOSB/SDVOSB *certification* or a Unite-HELD federal set-aside.
- `src/pages/Government.jsx` ~110 — "veteran-owned small business" → KEEP (accurate, beneficial). No change needed.
- `src/lib/documents.js` ~27 — quote/invoice FOOTER_TEXT "Veteran-owned (SDVOSB partner)" — fine as-is (reads as veteran-owned + SDVOSB is partner). BUT this footer has a STALE/placeholder FDA number "#3012345678" → must be FDA 3015727296. FLAG for Alex (real error on customer docs).
- `src/pages/Procurement.jsx` ~28/38/60 — covered by the Procurement rewrite (Unite = supplier behind diverse/SDVOSB resellers).
- `src/pages/About.jsx` ~31 + `src/pages/Compliance.jsx` ~21 — "MSPV BPA · Via authorized SDVOSB partner" accurate — keep.
- Net: the ONLY actual code change from this sweep is the documents.js STALE FDA NUMBER fix. The veteran-owned-small-business language stays everywhere.

---

## CONTENT: Procurement page — REWRITE (premise was backwards) (`src/pages/Procurement.jsx`)

**CRITICAL correction:** The live page implies **Unite itself is veteran-owned / SDVOSB with "certified diverse suppliers behind our catalog."** This is WRONG. **Unite is NOT SDVOSB and has never claimed to be.** Damon's actual intent is the INVERSE: Unite is the **product/supply-chain partner BEHIND diverse businesses** — Unite supplies the products + logistics, and **certified diverse resellers/distributors (MBE/WBE/VOSB/etc.) buy from Unite and supply the end customer**, so THEY meet their customers' supplier-diversity requirements. Unite makes ZERO diversity-status claims about itself.

**Approved hero:**
> **Headline:** A supply partner for diverse businesses.
> **Sub:** Unite Medical helps certified diverse suppliers win and fulfill healthcare contracts. We supply the products and the supply-chain muscle; you carry the relationship and the diversity certification your customers require.

(Keep hero clean — do NOT crowd it with the acronym list. Put the full category list lower on the page per below.)

**Approved body section:**
> **Headline:** Behind your diversity certification.
> **Body:** Health systems, GPOs, and government buyers increasingly require supplier-diversity spend. Unite Medical sits behind diverse distributors as a reliable, FDA-registered product and fulfillment partner — domestic manufacturing, agile sourcing, and same-day shipping — so you can confidently bid, win, and deliver. Your certification, your customer relationship; our catalog, compliance, and logistics doing the heavy lifting.

**Diverse-supplier categories (list LOWER on the page, not in hero) — common ones Damon approved:**
- Women-Owned (WBE / WOSB)
- Minority-Owned (MBE)
- Veteran-Owned (VOSB)
- Service-Disabled Veteran-Owned (SDVOSB)
- LGBTQ+-Owned (LGBTBE)
- Disability-Owned (DOBE)
- HUBZone
- 8(a) / Small Disadvantaged Business
(Phrase as "We support distributors across the diversity classifications your customers track — including…" so it's inclusive without implying Unite holds these certs.)

**Credentials grid:** ADD a 5th tile **MSPV BPA · 36C24123A0077** (confirmed in cap statement). Existing tiles (Veteran-Owned/DD214, CAGE, DUNS, FDA) — NOTE: the "Veteran-Owned · DD214 Verified" tile refers to DAMON being a veteran (true), NOT to Unite holding an SDVOSB set-aside cert. Keep wording careful so it doesn't read as a federal SDVOSB certification claim.

**NOTE FOR ALEX (contingency — woman-owned):** If Jackie is listed as an owner and Unite pursues WBE certification, this page can later flip to ALSO position **Unite itself as a (certified, once obtained) woman-owned business**. Until certified, claim nothing. Tied to the same Kaiser-Permanente pushback caveat as the About page (Jackie's listing may need removal entirely).

---

## DELIVERABLE: Updated Unite Group Capability Statement (refresh of the April-2025 PDF)

Source PDF: `Desktop/Unite Medical/Capabilities Statement/Unite Team/Unite Group Capability Statement_Damon.pdf` (last saved 2025-04, now dated). Damon approved a refresh. Updated content below — ready for design layout (keep to a clean 1–2 page gov/procurement leave-behind; do not bloat).

**✅ GENERATED DELIVERABLE (2026-06-30, Damon-approved):** A brand-matched 2-page PDF was generated and approved.
- PDF: `Desktop/Unite Medical/Capabilities Statement/Unite Team/Unite_Group_Capability_Statement_2026.pdf`
- Editable source: same folder, `Unite_Group_Capability_Statement_2026.html`
- Built to the site brand system (tokens.js + Logo.jsx): plum #5e2963, terra #b8502c, gradient #f64f00→#c23b6a→#5e2963; Fraunces/Inter/IBM Plex Mono; UM gradient logo mark. Page 1: header + hero "The supply chain behind healthcare." + 3 company cards + dark differentiators band. Page 2: registrations (FDA/CAGE/MSPV BPA/DUNS) + NAICS/SIC + contact + HQ/Unite Pharma Suite 1 addresses.
- Reflects all edits: ortho = manufacturer-direct (not domestic), AI tech-forward framing, Clyne removed, Unite Pharma broadened (no controlled substances / no cold-chain claim).
- REMAINING before external use: verify NAICS/SIC vs current SAM.gov registration.

**Unite Group overview (updated):** Unite Group is a veteran-owned alliance of healthcare companies — **Unite Medical®, Unite Pharma, and Medava®** — delivering full-spectrum medical support to hospitals, retailers, pharmacies, and government healthcare providers. Based in Georgia, we combine domestic manufacturing, agile sourcing, advanced technology, and personalized service to meet the urgent and ongoing needs of the healthcare community.

**Companies + what each does:**
- **Unite Medical®** — FDA-registered medical supply + global supply-chain partner. Manufacturer-direct orthopedic bracing (standard + custom, Unite Medical line is PDAC-approved), diagnostics (POC + OTC, brand-neutral sourcing + forthcoming Unite private-label line), American-made PPE, syringes, supplements. Sourcing/quoting engine for virtually any hospital-use item; private and white-label flexibility; **authorized distributor of the Restore Robotics FDA 510(k) remanufactured da Vinci instrument program (20–25% hospital savings).**
- **Unite Pharma** — A multi-state licensed wholesale pharmacy and FDA-registered third-party logistics (3PL) provider. Sources and distributes a broad portfolio of prescription and OTC medications, IV solutions (saline, dextrose), and injectables to pharmacies, hospitals, clinics, and government providers; provides FDA-registered warehousing and DSCSA-compliant fulfillment/logistics on behalf of manufacturers. Responsive sourcing for routine, hard-to-find, and backordered items, multi-state delivery. (NO controlled substances at this time. Cold-chain capacity intentionally NOT claimed — scalable on demand; do not state on the doc.)
- **Medava®** — American-made PPE line (nitrile gloves, 3-ply masks, N95 respirators, etc.); Berry-compliant; consistent domestic supply chain for state/local/federal/hospital procurement. (Named for Damon's daughter Ava.)

**Clyne Health — REMOVED from this cap statement (Damon decision 2026-06-30).** It's a B2C-leaning telehealth brand and doesn't fit a wholesale/product-supply gov-procurement leave-behind. See the separate "Clyne — future B2G opportunity" note below.

**Key differentiators (updated):**
- Veteran-owned & Georgia-based
- Full-spectrum medical, pharmaceutical, diagnostics, and PPE supply under one point of contact
- Manufacturer-direct orthopedic bracing (PDAC-approved Unite Medical line) — NOTE: ortho is manufacturer-DIRECT, NOT domestically sourced; don't claim domestic manufacturing for the ortho line
- Restore Robotics remanufactured da Vinci instrument program — FDA 510(k), 20–25% savings (hospital cost-reduction door-opener)
- Diagnostics: brand-neutral sourcing + forthcoming Unite private-label line
- Emergency sourcing with rapid fulfillment; private/white-label flexibility
- A tech-forward supply chain company integrating AI across every part of the business
- Trusted by hospitals, pharmacies, schools, clinics, big-box retail, and government nationwide

**Codes / contracts (verify still current):** Primary NAICS 423450 / 424210 / 339113; Secondary 339113, 325413, 325412, 325411, 315240; SIC 5047, 3842, 5122; FDA 3015727296; CAGE 8MK70; DUNS 117553945; **MSPV BPA 36C24123A0077.**

**Diagnostics NAICS note (Damon Q 2026-06-30):** No diagnostics-SPECIFIC code was added — and one isn't needed for distribution: **423450** (primary) already covers distributing/selling diagnostic tests (COVID/flu/strep/RSV kits). **325413 (In-Vitro Diagnostic Substance Mfg)** is already in the secondary list but is a MANUFACTURING code — only lead with it once Unite's OWN private-label diagnostics line is actually being made. Optional future add: 334516 (Analytical Lab Instrument Mfg) only if Unite makes test instruments (unlikely). Action: leave codes as-is now; elevate 325413 when private-label diagnostics launches.

**Contact:** Damon Reed · 404-502-5317 · damon@unitemedical.net · www.unitemedical.net · Medava USA www.medavausa.com
**HQ:** 1487 Trae Lane, Lithia Springs, GA 30122
**Unite Pharma address:** 1487 Trae Lane, Suite 1, Lithia Springs, GA 30122

**Open verifications for Damon before publishing the cap statement:** (a) NAICS/SIC codes still accurate (confirm against current SAM.gov registration). (b) Medava Berry-compliant wording — CONFIRMED OK by Damon. (c) Clyne — CONFIRMED REMOVED from this doc.

**Field #5 (vendor data) — CONFIRMED by Damon:** quoting engine captures per vendor item: Incoterm/FOB port, certifications (ISO 13485 / CE / 510(k) / ASTM) per item, and HTS/origin per alternate factory. "That is our intent with each manufacturer." Keep all three in the onboarding spec.

**Clyne — codes (for Clyne's OWN records, NOT Unite's gov cap statement):** Telehealth/virtual-care classifications — NAICS **621999** (All Other Misc Ambulatory Health Care Services — explicitly includes telemedicine; primary fit), secondary **621111** (Offices of Physicians); SIC **8011** / **8099**. VERIFY against Clyne's actual SBA/SAM registration before treating as official — a registered entity may already have codes on file.

**Clyne — FUTURE B2G OPPORTUNITY (logged per Damon, 2026-06-30 — not for the current cap statement):** Possible scenario where Clyne provides **direct-to-patient telehealth + medication fulfillment** to government employees / beneficiaries (e.g., federal-employee health benefit, VA, or government health-plan populations) — a legitimate B2G2C play that ties to the "land-and-expand" strategy. Decision: keep OFF the current wholesale/product-supply cap statement (would muddy the procurement message + raise licensure/payer questions not yet answered). Revisit as its OWN Clyne-specific gov capability one-pager once the model (multi-state licensure, payer contracts) is defined.

---

## CONTENT UPGRADE: About page — Damon not in love with it; do better (`src/pages/About.jsx`)

**The ask:** Rework the About page — Damon isn't happy with it. Plus specific fixes:

**1. People / Leadership section — explain Unite Pharma and Clyne Health.** Damon's bio mentions he "also operates Unite Pharma and Clyne Health" but the page never says what those ARE. Add a short, clear description of each (Damon-confirmed wording, kept brief to highlight his supply-chain + healthcare expertise):
- **Unite Pharma:** A multi-state licensed wholesale pharmacy and FDA-registered third-party logistics (3PL) provider.
- **Clyne Health:** An AI-powered concierge medicine platform that unifies a patient's care team, labs, and treatment into one personalized health system.
Consider a small "Unite family of companies" / portfolio block so a visitor understands the related ventures, not just a passing name-drop in the founder bio. Goal: reinforce Damon's expertise across supply chain + healthcare — keep it brief.

**2. RegeniCool™ — always add the trademark symbol** after the word "RegeniCool" everywhere it appears on the site. On About: credentials grid "All orthotics + RegeniCool Pro" → "All orthotics + RegeniCool™ Pro". (Site-wide rule — see consistency C9.)

**3. Confirm all paperwork/credentials details are current.** Audited About credentials grid against Damon's screenshot — all correct in code EXCEPT the BPA, which is ALREADY fixed to MSPV BPA 36C24123A0077 (screenshot was pre-deploy/cached). Fields verified: FDA 3015727296, CAGE 8MK70, DUNS 117553945, DD214 Verified, TAA Prioritized, Berry/Medava PPE, PDAC (orthotics + RegeniCool™ Pro). No other changes needed beyond the ™.

**4. Hero + leadership (Damon-reviewed, decisions locked):**
- **Hero headline** — KEEP as-is: "Built on discipline. Driven by demand."
- **Hero sub** — REPLACE current with: **"Built by a veteran supply-chain operator and a practicing physician — the medical supply partner the industry was missing."** (Damon disliked the original; this is approved.)
- **Leadership bios** — keep INITIALS (Damon R. / Jackie S.), not full names.
- **Jackie's bio** — copy is fine as-is. **NOTE FOR ALEX (contingency):** Jackie's bio / co-founder listing may need to be REMOVED entirely. Her current employer is Kaiser Permanente; if they push back on her being listed as Unite co-owner/co-founder, we pull it. Build the leadership section so a single leader (Jackie) can be cleanly removed without breaking the layout, and don't hard-bake "co-founder" anywhere that's painful to undo.
- **Revenue figures** ($34K→$39M, $1.4M) — KEEP OFF all public pages (confirmed). 500M units is OK to keep.
- **Overall direction:** refresh page tone to today's positioning (global supply chain co. w/ medical specialty, wholesale + sourcing/quoting two-model, new segments, diagnostics, Restore Robotics) — but the hero, letter (C10), people descriptions, and credentials above are the concrete approved changes.

**Why / context:** About is a key trust page; Damon wants it to actually represent the business as it is now (multiple ventures, two-model supply chain, real credentials) and read better. Unite Pharma + Clyne Health are real related companies that currently appear as unexplained names.

---

## SITE-WIDE CONSISTENCY CLEANUP (existing copy that today's decisions contradict)

> This section tracks **existing copy that must change** because of decisions made in the 2026-06-29 review — separate from the forward-looking feature asks above. As Damon reviews, new contradictions get added here. **Note:** "landed cost" language is CORRECT and should stay in the sourcing/quoting flow (Quote, QuoteNew, PortalQuote, ShortageMatch, Services source-card, and all backend WMS/quoting internals) — it is only wrong when applied to stocked/wholesale goods. Don't strip it from the sourcing path.
>
> **WORKING STANDARD (decided 2026-06-29):** For every page Damon reviews, the agent does two things: (1) log Damon's explicit flags, AND (2) proactively scan that page's copy for contradictions with the running decisions below and add them here. Don't wait for Damon to spot each one. Recurring decision checklist to scan against: single Georgia warehouse (no Nevada/Las Vegas/Reno/two-warehouse/both-coasts); no "own/warehouse everything / zero middlemen / no brokered / no third-party" absolutes; wholesaler positioning (no landed-cost on stocked goods); "no minimums" scoped to stocked items only; segments include Hospitals/Retailers/Brand Owners; Diagnostics broken out; Restore Robotics program present; stocked-&-ready core = bracing, diagnostics, American-made PPE, syringes, supplements; **IP protection — sell capability/outcome, never expose the quoting engine's mechanism/recipe (no FDA-code/USITC-duty/LCL-vs-FCL/6-component-landed-cost/Claude-letter specifics) on customer-facing copy.** **VETERAN STATUS — Unite is 'veteran-owned' AND 'veteran-owned small business' (both TRUE, self-claimable, beneficial — KEEP). Damon = Army National Guard, honorable discharge, DD214. ONLY forbidden: claiming the formal VOSB/SDVOSB CERTIFICATION or a Unite-held federal set-aside (Damon doesn't hold that cert). The SDVOSB is a PARTNER (holds the MSPV set-aside); Unite is the brand behind them.**

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

### C9. RegeniCool™ trademark symbol — site-wide rule

**The rule (decided 2026-06-29):** Always render **RegeniCool™** with the trademark symbol everywhere "RegeniCool" appears in copy (e.g. "RegeniCool™ Pro"). Apply going forward to any new copy too. Current occurrences to fix (4): `src/pages/About.jsx` ~37, `src/pages/Compliance.jsx` ~27, `src/data/faqs.js` ~32, `src/pages/ServicePDAC.jsx` ~67 — all read "RegeniCool Pro" → "RegeniCool™ Pro".

### C10. About founder letter — REWRITTEN (replace existing letter `src/pages/About.jsx` ~95–121)

**Status: corrected copy ready for Alex to implement.** Replaces the old founder letter (which used the "we own every unit we sell" framing that contradicts source-and-never-stock). Professional, less-personal tone (origin autobiography intentionally omitted — kept the credibility spine + conviction). The 500M-units figure is CONFIRMED accurate by Damon (keep it).

**New letter copy:**

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

**Open for Damon's final call:** (a) keep the specific 500M-units / pandemic claims (confirmed accurate); (b) tune length/warmth as desired.

### C6. Testimonial reword — "Berry compliant products" (`src/data/testimonials.js` ~22)

**The ask:** Reword the "D. V. · Procurement Lead · Regional Health System" testimonial to center **Berry compliant products** instead of "Berry compliance documentation."
- FROM: "Berry compliance documentation ready on day one, same-day shipping, and a rep who knows our procurement process. Unite came in as a secondary source and earned a primary spot inside 90 days."
- TO: "Berry compliant products in stock when we needed them, same-day shipping, and a rep who knows our procurement process. Unite came in as a secondary source and earned a primary spot inside 90 days."

**Note:** Damon confirmed the other testimonials (fabricated) are OK to keep as-is; only this one needs the reword. Everything else in this entry (name, title, org) stays.

### C8. Footer credentials line missing MSPV BPA (`src/components/layout/Footer.jsx` ~103)

**The ask:** The footer brand block shows "FDA 3015727296 · CAGE 8MK70 · DUNS 117553945" but omits the **MSPV BPA** number, even though it was added site-wide elsewhere (nav, About, Government, Compliance, invoice/quote footers). Add it for consistency: "FDA 3015727296 · CAGE 8MK70 · MSPV BPA 36C24123A0077 · DUNS 117553945" (or whatever order reads cleanly).

**Why / context:** Consistency — the credential set should be uniform wherever it appears. (Confirmed by Damon during footer review.)

### C7. Homepage "Enter data once. Sync everything." CTA — copy mismatched to the "Start a quote" button (`src/pages/Homepage.jsx` ~650–658)

**The problem:** This section's CTA button is **"Start a quote"** (→ `/quote`), but the supporting copy describes the **order-fulfillment** pipeline ("Order placed → inventory updates → invoice auto-creates → label prints → tracking returns to your portal. Zero manual touchpoints."). The text should describe the **quoting** flow to match the button.

**Reword direction (keep the headline "Enter data once. / Sync everything."; keep "Start a quote" button):** Sell the OUTCOME + SPEED, not the method. **Highlight that the quote is INSTANT.** Do NOT name the internal pipeline steps/tools on customer-facing copy (see IP rule below). Recommended: "Request a quote → get an instant, fully landed, compliance-checked price you can trust. Accept online and it becomes an order. No guesswork, no waiting, no back-and-forth." (Alts: speed-forward, or "quotes that used to take days, in seconds" contrast hook.)

**HONESTY NUANCE on "instant":** "Instant" is true for quotes the engine prices automatically (items already in the vendor database with known FOB/duty/freight). It is NOT instant for the open-RFQ / brand-name / "source-anything" path, where Unite must manually source + price. Keep "instant" tied to the engine-priced path; don't let it imply instant turnaround on items that require manual sourcing (same discipline as the real-time-stock claim in C3).

**Consistency note:** "landed cost / fully landed" is CORRECT here (sourcing/quoting flow).

> **IP-PROTECTION RULE (decided 2026-06-29 — applies site-wide):** Customer-facing copy must sell the **capability and outcome**, NOT the **mechanism**. Do NOT expose the quoting engine's recipe on the public site — e.g. "validate FDA codes, pull live USITC duty rates, compare LCL vs FCL freight, 6-component landed cost, Claude letter." Those specifics are a roadmap a capable competitor could copy. Use umbrella/benefit language ("compliance-checked," "all-in landed price," "we handle the sourcing, compliance, and freight behind the scenes"). The detailed pipeline stays in internal/CTO docs only. Apply this anywhere the site currently describes HOW the engine works (check QuoteNew.jsx, Quote.jsx, ShortageMatch.jsx, Services source-card, which currently expose method details like "map columns, translate, validate FDA codes, pull live duty rates, compare freight, 6-component landed cost").

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

---

## BATCH 2 — Services sub-pages, Segment pages, sourcing/resiliency, content & legal

### CONTENT: Distribution service page — corrections (Damon-approved) (`src/pages/ServiceDistribution.jsx`)

🔴 Nevada/two-warehouse bug is live in 4 spots here — fix all (single Lithia Springs, GA warehouse):
1. **SEO title (~31):** "Distribution — 2 US warehouses, same-day shipping, nationwide coverage" → **"Distribution — Georgia warehouse, same-day shipping, nationwide coverage."**
2. **Hero title (~41):** "Your *forward* warehouse." ("forward warehouse" implies distributed network) → reword, e.g. **"One warehouse. Every dock."** (match Locations voice) — agent to finalize.
3. **Hero sub (~42):** "Two US warehouses, one routing engine. We stock to your rolling 30-day run rate, not last year's forecast." → **"One Georgia warehouse, tuned to your rolling 30-day run rate — not last year's forecast."** (drops two-warehouse + the now-nonsensical routing-engine line)
4. **STEPS (~21):** "Routing engine picks nearest warehouse with full fill" → **"Order routed and allocated for a complete, single-shipment fill."** (no "nearest warehouse" with one location)

**Fill-rate stat (~15):** "98.6% FILL RATE" is fabricated but Damon confirms Unite fills at a genuinely very high rate — OK to keep a strong fill-rate claim. Recommend rounding to **"99%+ FILL RATE"** (avoids false-precision of a decimal that implies a measured metric). [Damon to pick 99%+ vs keep 98.6%.]

**Terms (~24):** "Invoice auto-creates, Net-30 with approved credit" → Damon offers terms pending credit approval, and sometimes 60- or 90-day terms to certain clients. Reword to make it about **credit availability, not a fixed 30**: **"Invoice auto-creates; flexible terms available with approved credit."** (Drop the hard "Net-30.")

**Confirmed OK / clean:** "Same-day orders by 2pm EST," "100% US + territories," "0 MOQ · stocked items" (correctly scoped), two-way CTA (browse in-stock / quote non-stock). Net terms offered = confirmed (credit-approval based). **Fill rate: use "99%+ FILL RATE" (Damon confirmed).**

### CONTENT: PDAC Consulting page — corrections (Damon-approved) (`src/pages/ServicePDAC.jsx`)

1. **Scope: "DMEPOS" → "DME and orthotics" everywhere** (SEO title ~38, description ~40, hero sub ~49). Unite consults on DME + orthotics ONLY — NOT prosthetics or supplies. "DMEPOS" overstates scope. (Same scope decision as the Services PDAC copy.)
2. **RegeniCool™ trademark (~67):** "RegeniCool Pro" → **"RegeniCool™ Pro"** (C9).
3. **"All Unite Medical orthotics and our RegeniCool™ Pro product line are PDAC credentialed" (~67-69)** — KEEP (correctly scoped to Unite Medical line); just add ™.
4. **"95%+ success rate on targeted code submissions" (~84)** — KEEP (Damon OK). Confident claim on submissions Unite chooses to target.
5. **Hero sub "difference between getting paid and eating the cost"** — KEEP (Damon OK).
6. **Service = full submission management** (prepare + submit + resubmit) — CONFIRMED accurate.
7. **🔴 FIX overclaim — STEP 3 "Decision & Resubmission" (~28-31):** current copy "If PDAC requests additional documentation or assigns an alternate code, we handle the revision and resubmit until you have your code." OVERSTATES — Unite does NOT control PDAC or the code PDAC assigns. Reword to reflect that Unite manages the revision/resubmission process but the decision/code is PDAC's. Approved rewrite: **"If PDAC requests additional documentation, we handle the revision and resubmit. Coding decisions rest with PDAC — we manage the process to give your product its best shot at the right code."** (agent to finalize tone; the key fix: don't promise "until you have your code" / don't imply we control the assigned code).
8. **CTA wiring (~90-92):** "Browse PDAC-approved products →" currently → `/catalog?filter=pdac`. Damon: drive the client to **Unite's braces + the RegeniCool™ Pro listing** specifically. NOTE: the **RegeniCool™ Pro listing does NOT exist yet** — ALEX must create the RegeniCool™ Pro product listing, then point this CTA at the braces category + that listing. (Ties to Services PDAC band stat #3 "PDAC approval letter downloadable per product page" and the L-code-on-listing build.)

**Consistency:** old unverifiable volume/pricing/rebate claims already removed (per file header) — good. Unite Medical PDAC scoping correct.

### CONTENT: Distributor Program page — corrections (Damon-approved) (`src/pages/ServiceDistributors.jsx`)

1. **🔴 Custom Sourcing card (~42) — remove mechanism leak + "real-time" overclaim** (IP rule + C3). "Real-time pricing, landed cost, compliance verified." → **"Need products we don't stock? Use our quoting engine to source from our vetted manufacturer network — get an all-in landed price with compliance handled."**

2. **Reciprocal catalog exposure = OPTION, not requirement (Damon flag).** Both directions of catalog sharing must read as optional: (a) listing the distributor's products in Unite's catalog, and (b) offering Unite's products to the distributor's customers. Reword cards 01 & 02 so this is clearly opt-in / distributor-controlled.
   - **Card 01 · 3PL & Warehousing — REPLACE:** "We stock and ship your products from our facilities — your inventory lives in our warehouse and ships on your schedule, like it's your own. Optionally, list your products in our catalog to reach new buyers. Manage it all from your own distributor dashboard: stock levels, orders, shipments, and reporting, as if you owned the warehouse."
   - **Card 02 · Drop-Ship Integration — REPLACE:** "Integrate our catalog into your site and we fulfill on your behalf — blind-shipped, discreetly, under your brand. Your customers never see us. Offering our catalog to your customers is optional — you control what you list and what stays private. Track every order from your distributor dashboard in real time."

3. **🆕 Showcase the custom Distributor Dashboard (Damon ask — highlight as a differentiator).** Add a dedicated card (recommend a 5th card or a highlighted band) selling the dashboard: distributors manage their business "as if they owned the warehouse." Approved copy:
   > **Run your business like you own the warehouse.** Every distributor gets a custom dashboard to manage inventory, place and track orders, handle drop-ship and blind-ship fulfillment, pull reporting, and control exactly which products you list — and which of ours you offer your customers. Full visibility, full control, zero warehouse overhead.
   (ALEX: this maps to the existing DistributorPortal — `/distributor` + sub-routes. Link the card CTA to a "See the distributor dashboard" demo/contact or the portal login as appropriate.)

4. **Wholesale card "No minimums on stocked items" (~34)** — KEEP (correctly scoped).
5. **Hero "Your catalog. Our import desk." + "logistics partner, not a competitor"** — KEEP (strong).
6. **Consistency:** no warehouse/Nevada issues on this page.

**🔴 SITE-WIDE "dealer" → "distributor" cleanup (Damon flagged — the page was renamed but "dealer" survived in the SEO/prerender + misc layers).** The customer-facing program is "Distributor Program," but stale "dealer" language is still live in these spots:
- **`scripts/prerender.mjs` ~67-68** — the prerendered `<title>` is literally **"Dealer & distributor program"** (this is the title Damon saw) + description "regional medical supply dealers and distributors." → retitle to **"Distributor Program · Unite Medical"** + update description to drop "dealer."
- **`scripts/prerender.mjs` ~56** — services description "Wholesale distribution, PDAC consulting, dealer programs, and private labeling…" → "…distributor programs…"
- **`src/pages/legal/Legal.jsx` ~128-129** — "For dealers and pharmacies, we drop-ship…" and "Talk to our dealer team about white-label…" → "distributors," "distributor team."
- **`src/pages/SurplusMarket.jsx` ~5** — "Buyers (clinics, dealers, exporters)" → "distributors."
- **Admin/pricing internals** (`AdminAnalytics.jsx` "Regional dealers", `AdminMarginPolicy.jsx` "regional dealers", `marginPolicy.js`, `pricing.js` comments, `QuoteNew.jsx` "Mid ASC / Dealer") — INTERNAL, lower priority, but recommend aligning to "distributor" for consistency. Not customer-facing, so optional.
- Note: `SegmentDealers.jsx` component NAME can stay (internal), but its content already uses "distributors" correctly. The `/services/dealer` and `/pages/dealer-program` → `/services/distributors` redirects (vercel.json) are fine to keep for old-link SEO.
- ALEX: after edits, re-run the prerender so the static title/meta regenerate.

### CONTENT: Private Label & Manufacturing page — corrections (Damon-approved) (`src/pages/ServicePrivateLabel.jsx`)

1. **🔴 Manufacturing-claim accuracy (~14).** Card 01 says "We manufacture domestically and overseas across vetted facilities" — implies Unite OWNS manufacturing plants. Reality (per cap-statement standard): Unite is **manufacturer-DIRECT / works with vetted manufacturers**, does not own factories. REPLACE with: **"Diagnostics, PPE, orthotics — produced under your brand through our network of vetted domestic and overseas manufacturers, with the QA paperwork to back it up."**
2. **"Request samples" CTA (~57)** — KEEP (Damon default; provides samples for private-label inquiries).
3. **Diagnostics private-label** (card 01 lists Diagnostics) — fine; ties to the forthcoming Unite private-label diagnostics line (M4).
4. **Hero "Your brand. Our supply chain." + TJS as proof** — KEEP (strong, ties to Portfolio TJS flagship).
5. **White-label storefront card (~19)** — accurate to the TJS playbook. KEEP.
6. **Consistency:** no warehouse/Nevada/veteran/mechanism issues on the page body.

**🔴 PRERENDER/SEO meta fixes (scripts/prerender.mjs) — same manufacturing overclaim + dealer language in the SEO layer:**
- **~108 `/portfolio` description:** "The brands and product lines Unite Medical **manufactures**, imports, and distributes." → drop/soften "manufactures" (Unite doesn't own manufacturing) → e.g. "The brands and product lines Unite Medical produces (via vetted manufacturers), imports, and distributes." or simpler "…Unite Medical brings to market."
- **~56 `/services` description:** "…dealer programs…" → "…distributor programs…" (part of the dealer→distributor cleanup).
- **~70-72 `/services/private-label`:** title "Private labeling" + desc are OK; ensure any "manufactures" phrasing site-wide reflects manufacturer-direct, not owned factories.
- **GENERAL (new scan rule):** the prerender.mjs meta layer must be reviewed alongside each page — it carries the customer-facing `<title>`/description search engines + social show. Sweep it for the same standards (warehouse, manufacturing-ownership, dealer, mechanism, veteran).

### CONTENT: ASC segment page — corrections (Damon-approved) (`src/pages/segments/SegmentASC.jsx`)

Page is mostly CLEAN — already rebuilt to remove prior fake-stat/fake-testimonial content. Only item:
1. **Hero sub (~36) "sourced, stocked, and shipped — same day"** — light reword so "same day" doesn't imply same-day on SOURCED items (sourcing takes longer than stocked). e.g. **"Procedure-specific products — stocked and shipped same-day, with sourcing for everything else. We supply ASCs of any size, with no minimum orders on stocked items."** Low priority; the "no minimums on stocked items" clause already keeps it mostly honest.
2. **Prerender meta (~75-76)** — CLEAN ("Case-cart-ready supply programs… same-day shipping"). No change.
3. **Consistency:** no warehouse/Nevada/veteran/mechanism/dealer issues; no fake stats. Good shape.

### CONTENT: Pharmacy segment page — corrections (Damon-approved) (`src/pages/segments/SegmentPharmacy.jsx`)

CLEAN — well-built, no fake stats/testimonials, no warehouse/Nevada/veteran/mechanism/dealer issues. "PDAC-approved orthotics" tag consistent (Unite Medical line). "Same-day" accurate (tags are stocked core). Only optional enhancement:
1. **(Optional) Link the diagnostics tags** ("OTC rapid tests," "Point-of-care diagnostics") to the future dedicated Diagnostics page (M4) once built — strong tie-in for the pharmacy/front-of-store audience and Unite's #2 mover. Low priority.
2. **Prerender meta** — review for the standard sweep (assumed clean; confirm during Alex's meta pass).

### CONTENT: EMS segment page — corrections (`src/pages/segments/SegmentEMS.jsx`)

CLEAN — no fake stats/testimonials, no warehouse/Nevada/veteran/mechanism/dealer issues. "If you need it in the field, we can source it" is on-brand (sourcing/resiliency). Tags appropriate for EMS. No changes needed.

### CONTENT + BUILD: Shortage-list matcher — corrections + major feature expansion (Damon-approved) (`src/pages/ShortageMatch.jsx`, `src/lib/matching.js`)

**Page model is honest** (matches against Unite's OWN catalog + routes rest to sourcing — NOT a fake third-party live-stock view). But Damon wants a significant expansion + integrity fixes:

1. **🔴 Match against ALL 3 supply-chain options, not just in-stock (Damon — core requirement).** Today the matcher checks stocked inventory. It must check all three of Unite's supply states (ties to the Catalog 3-state model §5.1): (1) **In Stock** (real available inventory — on-hand − reserved, per B2), (2) **Source/Resiliency** — Unite's product lists from **vetted manufacturers in the custom quoting engine**, and (3) **Available to Quote** (open RFQ). Do NOT limit to in-stock. A line should match if Unite can supply it via ANY of the three paths.

2. **🔴 "IN STOCK" badge must read REAL available inventory** (not mere catalog presence) — same fix as bug B2. Only show "IN STOCK" when genuinely in stock; otherwise show the correct supply-state badge (Source / Quote).

3. **🆕 STRATEGIC — build a cross-reference SKU database from uploaded shortage lists (Damon, high-value).** When clients upload shortage lists, Unite should capture and build a **cross-reference SKU database** (customer's item ↔ Unite's stocked/manufacturer equivalent). Damon: "this is a great way for Unite to build a database of cross-reference SKUs — that's been a MISSING PIECE to our manufacturer product sheet." Every uploaded list becomes training data that makes the matcher smarter and enriches the manufacturer product data. **→ NOTE FOR LATER (Damon flagged, don't lose):** add a cross-reference-SKU field/table to the manufacturer product sheet / vendor data model (ties to the quoting-engine vendor fields + vendor portal). This is a durable data-moat asset.

4. **🔴 Equivalents guardrails (medical safety — Damon).** "EQUIVALENTS" suggestions must NOT be loose keyword matches — wrong equivalents on a medical item are a real risk. Guardrails needed. Damon's approach: **ask/require the client to upload or provide their list of ACCEPTABLE cross-SKUs** — i.e. get the customer's up-front approval on which substitutes they'll accept. This (a) gives Unite approved, workable options, (b) removes the liability of Unite guessing an equivalent, and (c) feeds the cross-SKU database with customer-validated pairs. Add a field/step for the client to specify acceptable substitutes.

5. **→ NOTE FOR ALEX (research):** investigate whether there are **purchasable cross-reference SKU database lists in the medical space** (commercial cross-reference/equivalency data — e.g. GUDID-based, distributor cross-ref files, or third-party medical product equivalency datasets) that Unite could license to seed the cross-SKU database with real data rather than building entirely from scratch.

6. **Copy tightening (until 1–2 are wired, keep claims airtight):**
   - SEO title (~97) "Match your shortage list against live stock" → **"Match your shortage list against our full supply chain — instantly."** (reflects all 3 options, not just stock)
   - Hero sub (~170) + SEO desc (~98): reword from "match every line against stocked inventory in real time, surface in-stock equivalents" → **"We instantly check each line against our stock, our vetted manufacturer network, and our sourcing desk — then come back with what we can supply and a quote for the rest."** (honest across all 3 paths; only says "in stock" when real)

7. **Keep (strong/honest):** non-stocked → "WE SOURCE IT" → quoting; "landed-cost pricing from vetted manufacturer network" (correct in sourcing flow); professional-email capture; "list never shared"; the no-EDI/no-formatting UX is a genuinely strong resiliency play.

### CONTENT + STRATEGY: Supply Risk monitor — recall feed + the execution problem (Damon-approved) (`src/pages/SupplyRisk.jsx`)

**Damon LOVES this page + its intent.** It pulls LIVE FDA device enforcement/recall reports from openFDA (real, honest — has a "SAMPLE FEED · OPENFDA UNREACHABLE" fallback). Page mechanics are clean. The work is (a) small copy fix, (b) confirm the data source + wire it to all 3 supply sources / cross-ref SKUs, and (c) SOLVE THE EXECUTION PROBLEM.

**Copy fix:**
1. **Conversion band (~154):** "Paste your shortage list. We'll match it against live stock." → align with the shortage-matcher reword (match against all 3 supply paths, not just "live stock"): **"Paste your shortage list — we'll match it against our full supply chain."** (C3 consistency.)

**Confirm with Alex (data source + wiring):**
2. **Confirm where recall data is pulled from** — currently openFDA (`src/lib/external/openfda.js`, device enforcement, last 120 days). Damon wants to confirm the source and that it's real-time-ish/reliable. Recommend: it's openFDA (free, official) — good; confirm refresh cadence + the fallback behavior.
3. **Wire recall matches to all 3 supply sources + cross-ref SKUs** (same as shortage matcher §ShortageMatch): today `shelfCoverage()` only ranks against the STOCKED catalog (`rankCatalog`). Expand to also surface (2) vetted-manufacturer/quoting-engine items and (3) open-quote, using the cross-reference SKU database. So a recalled item can offer a stocked alternate, a sourced alternate, or a quote — not only "UNITE STOCKS THIS CATEGORY."

**🔴 THE EXECUTION PROBLEM (Damon's core strategic point — "all the data in the world does us no good if we can't execute a sale").** Matching a recall to a cross-SKU is easy; being able to actually BUY + deliver the alternate is the hard part. Differs by supply type:
- **Stocked items:** Unite already owns them — no problem.
- **Overseas sourced items:** manufacturer already confirmed to supply — mostly solved (still need client cross-SKU approval + hospital push-through).
- **OTG (on-the-ground / USA) items:** THE HARD ONE. Unite may know the item + cross-SKU (Cato-style) but has NO confirmed supplier to buy from. Brand owners typically do NOT allow their authorized distributors to sell to resellers like Unite. This is the recurring blocker during backorders/recalls.

**The 3 execution models Damon wants real solutions for (before we can sell OTG alternatives):**
- **Option 1 — Direct distribution from the brand (ideal, hardest).** Agent's proposed unlock: use the recall page + portal + quoting system as a DEMAND-AGGREGATION engine. Every recall/backorder matched to a brand Unite doesn't yet distribute = a documented, timestamped demand signal. Aggregate into a per-brand "demand dossier" (# facilities, # units, timeframe, during competitor's recall) and take REAL demand to the brand to earn authorization: "here's live demand we're capturing that you're not filling — authorize Unite and we convert it." Turns the platform into the leverage that wins direct lines.
- **Option 2 — 3rd-party resellers with allocation (tactical, speed-dependent).** Winnable edge = pre-built relationships + speed (window closes once market catches on). Build a STANDING "allocation network" BEFORE recalls hit: pre-vetted resellers/distributors per major brand who carry it, sometimes have excess allocation, and will sell to a reseller. Maintain as a quiet rolodex so a recall = calling known contacts within hours, not cold-searching. The recall feed tells you which brands recall often → which allocation networks to build depth around.
- **Option 3 — Overseas sourcing (slowest, needs pre-work).** Blocker isn't finding it — it's new-SKU + new-vendor approval velocity into hospitals (Class 1 & 2 don't push through fast). Unlock = do regulatory pre-work BEFORE the crisis: keep vetted overseas equivalents pre-documented (510(k)/registration/specs ready) + pre-negotiate client cross-SKU acceptance (ties to shortage-list "acceptable cross-SKU" step). When a recall hits, the item is already vetted + client-pre-approved → collapses the timeline.
- **Connective tissue:** recall page + shortage lists + quoting engine = a DEMAND-INTELLIGENCE system. Demand data justifies direct brand deals (Opt 1), reveals which allocation networks to pre-build (Opt 2), and which overseas equivalents to pre-document (Opt 3). The data is the AMMUNITION to solve execution — not the product itself. **ALEX + Damon to keep solving each model; nothing to build blindly yet, but design the data capture so it feeds these three plays.**

**Keep (strong/honest):** live openFDA feed + honest fallback; recall class colors; deep-link from a matched recall into the shortage matcher (great conversion pattern — Cato Risk Radar equivalent, on a free API). No fake data. Genuinely strong resiliency lead-gen.

### CONTENT + BUILD: Surplus — PIVOT from "Unite buys & stocks" to a BROKERED MARKETPLACE (Damon-approved) (`src/pages/Surplus.jsx`, `src/pages/SurplusMarket.jsx`, `src/lib/marketplace.js`, `/admin/surplus`)

**🔴 CORE MODEL PIVOT (Damon — this changes the whole feature intent).** The current pages are built on the WRONG model: Surplus.jsx = "Sell us your surplus, we respond with an offer, Net-30 on accepted lots" (Unite BUYS + stocks dead inventory on spec); SurplusMarket.jsx = Unite resells lots it "accepted," brokerage spread = margin. **Damon does NOT want to pay for and stock "dead items" on an 'if-come' basis.** He wants Unite to be the **transaction BRIDGE / broker** sitting in the middle with the technology, earning a transparent **technology-transfer fee** — NOT a speculative buyer.

**The correct model:**
- **Sell side:** vendors with excess/expired/random inventory upload their surplus (download Unite's required template — supports CSV upload, see below), listing what they have + their target/ask price. Unite does NOT buy it up front by default.
- **Buy side:** Unite markets that inventory to willing buyers across MULTIPLE target markets — not medical only. Medical is one channel; also **non-medical, veterinary, research, overseas clients, etc.** (Framing: these are ADDITIONAL target markets that widen the buyer pool, NOT a fallback for items hospitals "can't use." A good in-date lot might sell to a medical buyer OR an overseas clinic OR a research lab — Unite casts the wider net to move it. Expired/near-expiry items simply open even more of these non-medical channels.)
- **Unite in the middle (the bridge):** when a buyer makes an offer (qty + price) and the seller accepts (vs. their target), that agreement is **binding**, and **Unite collects its % technology-transfer fee UP FRONT before the two sides are connected** — i.e., "Mr. Supplier, here's a confirmed buyer, their offer + qty vs. your target; both accept → binding → Unite's fee is paid up front → then Unite connects the two." Safety gates: fee secured before contact info / connection is released.
- **Transparency:** be transparent about the tech-transfer fee. Framing: "Unite doesn't want to stand in the way of you moving your products — if we bridge you to a buyer, we earn a fee for the connection."
- **Track both sides for optional direct buy/sell:** Unite must track buyer + seller so Unite can, WHEN IT CHOOSES, **buy direct (stock SKUs it actually wants) or sell direct.** In some cases a supplier has SKUs Unite genuinely wants to own/stock — account for that path too. But the DEFAULT is broker, not speculative stock.

**Specific asks:**
1. **🆕 CSV upload on the sell-side intake** (Surplus.jsx) — in ADDITION to manual line entry. Provide a downloadable required template; let vendors upload it. (Currently manual line-by-line only; "email us a spreadsheet" is not enough.)
2. **🔴 Rewrite Surplus.jsx copy off the "we buy it" model.** Remove "Sell us your surplus... we respond with an offer... Net-30 payment on accepted lots" and the 4-step "You submit → We evaluate → You accept our offer → You get paid Net-30." Replace with the broker framing: "List your excess inventory → we find a buyer (medical, non-medical, vet, research, export) → you set your target price → when a buyer agrees, we bridge the deal for a transparent fee." Keep AI line-normalization (useful for listing/matching).
3. **🔴 Rewrite SurplusMarket.jsx** from "lots Unite accepted & resells (brokerage spread)" to "listings Unite is brokering between seller and buyer." Buyer places offer → on mutual acceptance it's binding → Unite's % fee collected up front → connection/fulfillment released. (Keep the offer UI; change the model + copy.)
4. **🔴 Binding-offer + fee-escrow flow (marketplace.js + /admin/surplus).** Build the agreement + up-front-fee gate: buyer offer + seller target → both accept → binding → Unite fee paid before the parties are connected. Track buyer & seller records for optional Unite direct-buy/direct-sell.
5. **Buyer channels:** expand marketing beyond medical buyers — support non-medical (expired), veterinary, research, overseas buyer segments for lots hospitals can't use.
6. **Fix "dealers" (~5 comment / any UI)** → "distributors" per the site-wide dealer→distributor cleanup (already logged).

**Why (Damon):** Unite's value is the TECHNOLOGY + the network that connects excess supply to willing demand — not warehousing dead stock and hoping for a buyer. Broker model = capital-light, fee up front, no speculative inventory risk; with an explicit OPTION to buy/sell direct when a SKU is genuinely worth owning.

**FEE STRUCTURE (agent recommendation, Damon-approved) — tiered, not flat:**
- **10–15%** on straightforward in-date, easy-to-move lots (e.g. medical→medical where the buyer was easy to find — Unite mostly just connected).
- **20–30%** on hard-to-place inventory (expired, needs a non-medical / vet / research / export channel, or regulatory hoops) — here Unite isn't just connecting, it's CREATING the only viable exit for product the seller would otherwise pay to destroy, so the value created (and fee) is higher.
- **Minimum fee floor** (~$250–500/transaction) so small deals still cover the tech/effort.
- Principle: the fee scales with how much value Unite actually created (ease of finding the buyer + how much of a market Unite had to make). Benchmarks: pure brokerage/finder 5–15%; B2B liquidation 10–20%; secondary/surplus medical + hard-to-move goods 20–35%.

**GUARDRAILS (agent-flagged, Damon-approved — build/legal must address before launch):**
1. **Disintermediation on REPEAT business.** Up-front fee protects deal #1, but once buyer & seller know each other, deal #2 can route around Unite. Mitigations: keep identities masked until the fee clears (already the plan for deal #1), AND make the platform itself sticky (logistics, compliance docs, payment handling, the buyer network) so going around Unite is more hassle than value. The fee protects the transaction; the value-add protects the relationship. **🔴 DAMON DIRECTIVE: make the platform AS STICKY AS POSSIBLE using Unite's full feature/service set** — bake in logistics/freight, compliance & doc handling, escrow/payment processing, the quoting engine, the buyer network, ratings/history, saved templates, and recurring-listing tools so both sides get ongoing value from staying ON the platform (not just a one-time intro). Stickiness is the primary moat against disintermediation — Alex should design every surplus-flow touchpoint to increase switching cost / ongoing utility.
2. **Regulatory / liability on expired + regulated goods.** Brokering expired medical products into non-medical/vet/research/export channels has real rules (expired sterile devices must NOT re-enter patient care; some exports need clearance; "research use only" labeling). As a pure connector Unite's exposure is lower than a reseller's, but REQUIRE: (a) terms placing compliance responsibility on buyer + seller, (b) channel guardrails in the system (e.g. an expired lot cannot be purchased by a medical-use buyer), (c) legal review before launch. This is why the broker model (vs. taking title) is also the safer model.

### CONTENT: Careers page — SIMPLIFY to a contact page (Damon-approved) (`src/pages/Careers.jsx`)

**Damon: the current page is OVERKILL and full of fabricated content — simplify to a simple "interested in working with Unite? contact us" page.** Current page fabricates: "60-something people on three coasts" (false headcount + contradicts single-GA-location), 5 specific open roles that aren't real openings, and 4 specific benefit promises ($0 co-pay healthcare, day-one equity, 12-wk parental leave, unlimited PTO) that are unverified commitments.

**Rewrite (Damon-approved direction):**
- **REMOVE:** the 5 fabricated open roles (ROLES array), the 4 fabricated benefit stats, and "60-something people on three coasts" (also a single-location contradiction).
- **KEEP it simple:** a short, honest page — veteran-owned company that's growing, values-forward, and a single "Get in touch / send us your info" CTA → /contact (or a general application). No fake roles, no fake headcount, no fabricated benefits.
- **Headline "Help us run like a soldier."** — Damon didn't object; can keep the veteran-owned tone, but pair it with the simplified contact framing. Agent to write clean short copy: e.g. eyebrow "CAREERS," a brief "We're a veteran-owned medical supply + supply-chain company, always interested in great people — engineering, sales, ops, compliance. Don't see a posting? Reach out anyway," + one contact CTA.
- **SEO/prerender:** update the careers meta to drop "three coasts"/headcount implications; keep "veteran-owned, remote-friendly" if remote roles are genuinely offered (confirm), else just "veteran-owned."
- Ties to the broader truthfulness standard + single-Georgia-location rule.

### CONTENT: Blog / Field Notes page — mostly OK (`src/pages/Blog.jsx`, seed data)

- **Blog is intentionally EMPTY** — `SAMPLE_BLOG_POSTS` in `src/lib/seed.js` was deliberately cleared (placeholder articles removed; "real content being coordinated with Jill"). Page renders no posts, category filters + JSON-LD still work. This is the honest state — GOOD, no fabricated posts. No fix needed now.
- **When real posts land:** confirm authorship is real (the AdminCMS default author is literally "You" — real posts should have a real byline). Keep the same truthfulness standard (no fabricated stats/claims in articles).
- **Empty-state polish (optional):** with zero posts, the page shows only the hero + filters + nothing. Consider a friendly empty state ("Field notes coming soon — subscribe / check back") so it doesn't look broken. Low priority.
- **Consistency:** hero "written by people who do the work" / "from the warehouse floor" is fine. No warehouse-count/veteran/mechanism issues.

### CONTENT + BUILD: Resources (HCPCS reference) page — WIRE TO REAL DATA (Damon-approved: Option A) (`src/pages/Resources.jsx`)

**Problem:** the page is a half-built feature dressed as finished — it OVERPROMISES. Fake/non-functional elements live today:
- "Search 4,820 codes" (~39) is a static div, NOT a working search input.
- "Download PDF" button (~41) has no handler — downloads nothing.
- Family counts (~47: L 1240 / A 820 / E 380 / K 290 / V 180 / T 420) and "4,820 codes" appear FABRICATED — the table only has 8 hardcoded rows (~10-19).
- Per-code "SKUS" counts (e.g. L1832→48, A4649→340) appear invented; "VIEW SKUS →" (~69) and family filters are styled clickable but have NO handlers.
- "Current through the April 2026 CMS update" (~35) — date claim to verify/make dynamic.

**🔴 DECISION — Damon chose Option A: BUILD IT REAL (don't ship the current fake, don't cosmetically patch).** ALEX:
1. Wire to the **real public HCPCS Level II dataset** (CMS publishes it) — real codes + descriptions + families with TRUE counts.
2. Make **search actually work** (functional input filtering the dataset).
3. Cross-link each code to **real Unite catalog SKUs** with true per-code SKU counts; "VIEW SKUS →" navigates to filtered catalog results.
4. Make **family filters** functional.
5. Make **"Download PDF"** produce a real PDF (or remove the button until it does).
6. Make the **"current through … CMS update"** date real/dynamic (tie to the dataset version).
**Why (agent + Damon):** it's a genuine SEO magnet (procurement buyers search HCPCS codes) and a STICKY utility (working code→SKU reference gets bookmarked). But until wired, the fake search/download/counts must NOT ship as-is — worse than no page, since a buyer who clicks a dead "Download PDF" loses trust in the real claims too.
7. **`/resources/coding`** — review alongside (likely same pattern); apply the same real-data standard.
