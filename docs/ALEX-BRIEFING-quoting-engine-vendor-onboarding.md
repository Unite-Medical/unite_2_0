# Quoting Engine — Vendor Onboarding, Compliance-as-a-Service & Private-Label Platform
## Technical + Strategic Briefing for Alex (CTO)

**From:** Damon Reed (CEO)
**Re:** Get up to speed on the vendor-data → quoting-engine pipeline, run checks on your end, and help solve the #1 problem: getting foreign manufacturers to give us clean data.
**Attachment:** `Unite_Quoting_Engine_Vendor_Template_v2.xlsx` (the master vendor template)
**Pilot partner:** Pentastar Medical (Owen) — a broker/rep repping 500+ manufacturers.

---

## 0. TL;DR — what I need from you

1. **Read this doc + the v2 template.** Confirm the vendor fields map cleanly to `vendorSheet.js` canonical fields + what the landed-cost engine needs.
2. **Run checks on your end** (see §8) — especially: what does our **Flexport API actually pull today** vs. what's missing (freight? classification? full duty incl. Section 301?).
3. **Confirm the free-API validation layer** (§3) is wired as a pre-Flexport filter so we're not paying $20/entry to classify SKUs we haven't committed to.
4. **Give me your ideas** on the two hardest problems:
   - Getting foreign manufacturers to actually upload clean data (the **vendor dashboard "hook"** — §7).
   - Any gaps you see in the whole model.

---

## 1. The big picture — what the quoting engine really is

We're not building a distributor's price tool. We're building **the bridge between the US market and foreign manufacturers** — and secretly, a **demand-sensing system**. Every quote request tells us what US buyers actually want, which tells us what to stock, which SKUs to bring in-house, and which manufacturers to court.

The engine only works if the **manufacturer data feeding it is clean and complete**. That's the crux. Everything below is in service of getting good data in, validating it ourselves (not trusting the manufacturer's word), and turning it into fast, honest, defensible quotes.

---

## 2. The vendor data template (attached: v2)

**53 columns, 3 tabs** (Product Data / Instructions / Data Sources & Validation), grouped Product · Pricing · Classification · Compliance · Logistics. Color-coded headers:
- 🟥 **REQUIRED (36)** — we can't quote without them
- 🟧 **REQUESTED (14)** — fill if it applies (GTIN, alt-factory, FDA code, shelf life, etc.)
- 🟪 **UNITE-FILLS (3)** — US HTSUS, US Agent, GTIN/UPC — vendor leaves blank, we validate/issue

**Key design decisions:**
- **Foreign HS vs US HTSUS:** manufacturers give us THEIR country's HS code (`mfr_hs_code`). We validate/confirm the real US 10-digit HTSUS ourselves (USITC/Flexport). This matches real-world experience — they routinely give the wrong-country code.
- **Actual manufacturer name + address per SKU** — CRITICAL because Pentastar is a broker. Every SKU is made by a different real factory; our FDA/compliance data must attach to the *real* maker, not the exporter.
- **Tier A** = fields `vendorSheet.js` parses today. Headers use the **exact canonical keys** so the parser auto-maps with zero fuzzy-match risk. **Tier B** = fields the landed-cost/container math needs (dims, weights, container capacity, price breaks, tooling, Incoterm, etc.).

**Two versions:**
- **v2 (master)** — full 53-col spec above.
- **"Pentastar Lite" (coming)** — a trimmed required-only subset to get the pilot moving without overwhelming Owen's team. Land the data, then iterate up to full.

---

## 3. Free API validation layer (VERIFIED LIVE 2026-07-06)

**Principle:** cross-check the manufacturer's claims ourselves. Never rely on them to provide all the right info. Wire these as a **pre-Flexport filter** so we validate cheaply on all SKUs and only pay Flexport for the ones we're actively quoting.

| Data | API (free, verified) | Use |
|---|---|---|
| US HTSUS + duty | `hts.usitc.gov/reststop/exportList?from=<hts>&to=<hts>&format=JSON` and `/reststop/search?keyword=` | Confirm real US 10-digit code + MFN/general/other duty vs. the mfr's foreign HS code. (Verified 9021.10.00 → "Orthopedic appliances, General: Free".) |
| 510(k) → real maker | `api.fda.gov/device/510k.json?search=k_number:<K#>` | Expose the actual clearance holder behind a broker. (Verified K210381 → Bq Plus Medical, Shanghai.) |
| Device class / code | `api.fda.gov/device/classification.json?search=product_code:<CODE>` | Validate FDA product code → class + regulation #. |
| Establishment / US Agent | `api.fda.gov/device/registrationlisting.json` | Registration, establishment type, public contacts / US Agent. |
| UDI / GUDID | `api.fda.gov/device/udi.json` | Cross-check existing UDI records. |
| Recalls | `api.fda.gov/device/enforcement.json` | Recall history per device/firm. |
| FX | exchangerate-api (already in PRD-22) | Non-USD FOB → USD. |

**⚠️ Section 301 / AD-CVD has NO clean free API.** The USITC record exposes `additionalDuties` + Chapter 99 (9903.88.xx) references, but resolving "does this HTS + China origin trigger a 301 surcharge and at what %" is not a single free call. **This is exactly what Flexport's $20/entry classification resolves.** Architecture: free APIs pre-filter + catch obvious errors on ALL SKUs → Flexport confirms full duty (incl. 301) only on SKUs we're actively quoting. Do NOT pay $20 × 500.

**ALEX:** openFDA free tier is ~240 req/min, 1,000/day without a key; a free API key raises it. Register one.

---

## 4. Flexport integration (ALEX — confirm coverage)

- All freight/landed-cost logistics ride on **Unite's Flexport account + API**.
- **CONFIRM what the Flexport API pulls today vs. what's missing:** booking_quotes (LCL/FCL/air)? classification? full duty resolution incl. Section 301 / Chapter 99?
- The **Flexport Classification Template** requires: price, sku, title, description, product_type, link, image_link, condition, coo, hs_hint. **All of these are already captured in our v2 template.** → **Build an auto-exporter** that generates the Flexport classification upload directly from our vendor template. No re-keying. This is the cross-check loop, automated.

---

## 5. FDA listing model + compliance-as-a-service (CONFIRMED — no compliance issue)

**The model:**
- Unite is importer of record + FDA-registered (est. `3015727296`). Onboarding a new manufacturer's product = Unite logs into the FDA portal, adds the product code → **FDA assigns the device listing to Unite.** Listings are Unite's, which keeps the supplier relationship private at the commercial/listing layer.
- Pentastar lists 150+ products as "Foreign Exporter" for products it doesn't make. Clicking the 510(k) exposes the real maker (public, unavoidable). **Unite already does the same** — Unite's FDA page shows Unite as "Specification Developer" (braces) + "Complaint File Establishment" (Medava gloves/masks).
- **For Pentastar SKUs:** replicate exactly what Unite already does — add each product code under Unite's FDA listing, list Pentastar (or the real mfr) as the foreign exporter/contract mfr behind it. Device listing = Unite's.

**⚠️ Honesty caveat (not a blocker):** the underlying 510(k) clearance still belongs to the original maker and is PUBLIC. Supplier relationship stays private at the commercial layer, but the 510(k) origin is discoverable by anyone (true for every importer incl. Pentastar). We do NOT promise a customer the 510(k) origin is invisible — it isn't. Positioning holds at the commercial layer; don't overstate secrecy.

**Compliance-as-a-service (big value-add):** Unite holds GUDID/UDI access + a GS1 prefix.
- **Class 1 device** → often just a UPC (Unite issues via GS1).
- **Class 2 device** → full GUDID submission.
- The template captures **Device Class (1/2)** to route this. Not a quote blocker — it's a POST-quote / PRE-production gate.

**Build: GUDID requirement templates for Class 1 AND Class 2.** Customer either:
- (a) **"Use our standard label template"** → uploads the required info, or
- (b) **uploads their own approved label files** → Unite checks compliance.
UPC/label flow: order committed → Unite generates GS1 UPC from Unite's prefix OR customer uploads their own UPC image file → generate case + product label details. Automate as much as possible.

---

## 6. The two private-label paths (positioning inside the quoting engine)

**Every quoting-engine customer decides up front: Unite's brand, or their own.** That's the fork. Present as a transparent **side-by-side** — never a bait-and-switch.

| | **Unite Ready** (Unite brand) | **Unite Custom** (customer's brand / their GPO) |
|---|---|---|
| Brand | Unite's | Customer's |
| Speed | Faster — lower/no MOQ, turnkey | Slower — full import cycle (sample→tooling→production→ocean) |
| Unit price | Higher at low qty (speed/convenience premium) | Lower at volume (customer eats the import cycle) |
| Customer effort | Near-zero | High — files, label approval, compliance, lead time |
| Compliance | Unite (already listed/UDI'd) | Unite does it FOR them (the value-add) |

**Buy-It-Now (in-stock) — clarified:**
- Buy-now is **LIVE today for any quoted SKU that matches Unite's EXISTING stock/portfolio.** We already stock certain items — if a quote request hits one, offer instant purchase at the in-stock price, any quantity.
- We are **NOT** speculatively stocking non-common items or items outside the current portfolio just for this tool. That expansion **grows over time from demand signals** — quote data reveals what to bring in-house, and future identical requests then get the instant buy-now offer.

**The flywheel:** quote requests → SKU-match against Unite's stock + prior quotes → demand signals reveal what to stock → stock it → future requests convert to instant higher-margin sales. The quoting engine is a demand-sensing system that tells us what to stock.

**UX for the custom-quote path:**
1. Quote request comes in → engine runs a **SKU-match first** against Unite stock + prior quotes.
2. Results page shows ranked options with a transparent trade-off grid (price · MOQ · lead time · what you provide):
   - 🟢 **In stock now (Unite Ready)** — buy-now, any qty (only when we actually have it)
   - 🟡 **Import — Unite Ready** — lower MOQ, faster, mid price
   - 🔵 **Import — Unite Custom (your brand)** — best unit price at volume, longer lead, we handle compliance
3. **Side-by-side pricing is mandatory** (import price vs. in-stock price shown together) — the customer chooses convenience vs. cost with eyes open. This is a trust requirement, not just UX.

**"No quote returned" feedback loop (BUILD):** customers need a way to flag *"I didn't see / didn't receive a quote for a requested item."* That routes back to Unite to source it, pull a cross-reference from our database to add it, or find a supplier. Never silently drop a requested item — every miss is a demand signal we should capture and close.

---

## 7. THE HOOK — vendor dashboard to get manufacturers to upload data (Damon's idea — want your input)

The hardest problem isn't tech, it's **motivation**: why would a foreign manufacturer do the work to give us clean data? The answer: give them a **multilingual vendor dashboard** that makes uploading data obviously worth it — a window into the US market they can't see on their own.

**Requirements:**
- **Fully multilingual** — viewable in all languages (foreign manufacturers; leverages the PRD-18/22 translation stack).
- **Completion benchmarks** — gamified progress: "your catalog is 60% complete — add carton dims + certs to become quote-ready." The more complete, the more/faster they get quoted.

**Data to show them (the carrot):**
- **Import frequency** of the products they carry (US demand signal).
- **Where they rank vs. competitors** on the import chart (competitive pressure).
- **MOQ competitiveness** — how their MOQs compare to peers.
- **Pricing to Unite** — where they stand.
- **Product-mix comparison** within their categories vs. competitors — gaps they could fill.

**The thesis:** if we find the hook that makes foreign manufacturers *want* to upload their data to get easier access to US customers — and Unite makes that bridge seamless and easy — we have a genuinely powerful, defensible platform. Aggregated (anonymized) trade + demand intelligence is the incentive; clean data is what we get in return.

**ALEX — I want your ideas here:** what's the most compelling hook? What data can we source (ImportGenius/trade data per PRD-15?) to populate this dashboard credibly? How do we structure completion benchmarks so they actually drive uploads?

---

## 8. Checks I need you to run (ALEX)

1. **Field mapping:** does v2 map cleanly to `vendorSheet.js` canonical fields + landed-cost inputs? Flag anything the engine needs that's missing, or columns that won't map.
2. **Flexport API coverage:** what does it pull today (freight modes, classification, duty incl. 301)? What's missing?
3. **Free API layer:** wire USITC + openFDA as the pre-Flexport validation filter. Register a free openFDA key.
4. **Auto-export to Flexport template** from our vendor template — feasible? Build it.
5. **SKU-match engine:** how do we match a quote-request line against Unite stock + prior quotes (the cross-ref SKU database)? This powers both buy-now and demand signals.
6. **Private-label paths:** how do Unite Ready vs. Unite Custom live in the quote UI + data model? Side-by-side pricing.
7. **"No quote returned" feedback loop** — wire it.
8. **Vendor dashboard hook** (§7) — your ideas + what's buildable.

---

## 9. Cross-references (existing PRDs)

- **PRD-16** Quoting Engine v3 · **PRD-18** XLSX parsing (`vendorSheet.js`) · **PRD-22** multi-currency/translation · **PRD-07** vendor approval · **PRD-15** ImportGenius trade data (feeds the dashboard) · **PRD-17** PDF pipeline.
- Full running notes: `docs/DAMON-PLATFORM-ADDITIONS.md` (quoting-engine section).
