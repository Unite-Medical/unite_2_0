# Handback — PRD-28 & PRD-29 (Website Review Batches 1 & 2)

**From:** Alex (CTO)
**To:** Damon Reed (CEO)
**Date:** 2026-07-01
**Status:** Both PRDs implemented and verified. Open items and questions listed at the bottom.

Every item below was checked against the live code after implementation. Full production build passes, all four automated check scripts pass (`phase_check`, `prd_check`, `consignment_check`, `ordering_check`, `wms_check`), 122 routes prerender cleanly with updated SEO meta, and the sitemap was regenerated (130 URLs, redirects removed, new pages added).

---

## PRD-28 — What's done

### Global standards (§1)
- **Veteran status rule** — no VOSB/SDVOSB self-claims anywhere; "via authorized SDVOSB partner" phrasing kept. The automated checker now enforces this on every future change.
- **Email standardization** — no `info@` or `sales@` anywhere in site copy; `support@` is the default, `accounting@` kept.
- **RegeniCool™** — all occurrences carry the ™ (About, Compliance, FAQs, PDAC page + everywhere new).
- **IP-protection rule** — no mechanism detail (USITC, freight comparison, landed-cost recipe, etc.) in any customer-facing copy; capability/outcome language only.
- **Landed cost** — kept in the sourcing/quoting flow, absent from stocked/wholesale copy.
- **Single Georgia warehouse** — enforced site-wide, including SEO meta and prerendered titles.

### Critical bugs (§2) — all fixed
- Placeholder FDA number on quotes/invoices → **FDA 3015727296** everywhere.
- Homepage "Las Vegas, NV / both coasts" → single GA warehouse.
- Product rail → prev/next arrow buttons (scrolls one card, works on plain mouse).
- "IN STOCK" badge → wired to the real WMS availability projection (on-hand − reserved); only shows when actually in stock.
- Contact segment tagging → matches "distributor" (was matching "dealer" and mis-tagging every distributor lead as ASC).

### Page copy (§3) — applied verbatim
- **About** — approved hero sub, new founder letter, "Unite family of companies" block (Unite Pharma + Clyne Health), initials-only bios. Leadership grid sized dynamically so Jackie can be removed with one array edit if Kaiser pushes back.
- **Services** — Georgia-warehouse distribution card, approved quoting-card copy, new Restore Robotics + Diagnostics cards (6 total). PDAC band rebuilt with the 3 approved stats; fabricated audit-SLA content removed.
- **PDAC consulting page** — fresh approved copy, "DME and orthotics" scope (no DMEPOS), no-reimbursement-guarantee disclaimer.
- **Procurement** — premise inverted per your direction: Unite is the supplier *behind* diverse resellers, zero diversity-status claims for Unite itself. Diversity classifications listed lower on the page as partner classifications. MSPV BPA tile added.
- **Compliance** — ISO 13485 "IN PROGRESS" badge, corrected MDR scope (own products only), DEA/"second cup of coffee" band replaced with a factual statement, PDAC tile scoped to "All Unite Medical orthotics + RegeniCool™ Pro."
- **Contact** — collapsed to 2 contact lines (Accounting ext. 3 / all other inquiries), fake rep removed (owner = "Unassigned"), notifications to support@, reasons dropdown aligned with the quote-router paths.
- **Locations** — "One warehouse. Every zip code.", "Over 10,000 sq ft," SKU count removed, "SHIPPING · ALL 50 STATES" label.

### Portfolio rebuild (§4)
- All 6 fabricated case studies (Medline, McKesson, VA Medical Center, Cobb County EMS) removed. No competitor names anywhere.
- **Flagship 1 — TJS**: +43% revenue growth with the approved blurb and safe mini-stats. Excluded items stayed excluded (no order counts, no reorder rate, no margin).
- **Flagship 2 — Restore Robotics**: static "$900K+ saved to date" (no fake live counter).
- **Medava stat**: 7 SKUs on the national MSPV contract.
- Remaining cards anonymized to generic descriptors. Header softened ("Proven outcomes" framing, no "real" over anonymized content).
- **TJS case-study page** rebuilt as a prospect-facing capability story: full end-to-end capability list (store build, private-label manufacturing, Force Therapeutics integration, direct-to-patient fulfillment), real growth numbers, "Could this be your store?" block + CTA.

### New builds (§5)
- **Catalog 3-supply-state model** — In Stock / We Source It / Available to Quote, driven by real WMS availability. Hero reworked ("CATALOG · STOCKED + SOURCED"), fake "updated 04 min ago" removed, category filters wired to the M6 taxonomy, compliance filter checkboxes functional (and deep-linkable, e.g. `?filter=pdac`).
- **Diagnostics page** (`/diagnostics`) — brand-neutral, SEO-focused, "Don't see your brand? Just ask.", wholesale/retail-EDI/private-label/POC+OTC capabilities. Structure supports featuring a Unite-branded line later; no Unite-branded products published (per your hold).
- **Restore Robotics** (`/robotics`) — flagship build with the verified program facts only (510(k) remanufactured Xi & DV5, Restore = manufacturer of record, Encore = master distributor, Unite = authorized distributor, ~20–25% savings, collection loop, sustainability). Conversion paths: savings analysis + consultation for hospitals, sub-distributor contact path.
- **Quote router** — "Start a quote" now opens a 3-path chooser (source a product / custom made-to-spec / shortage list), each with only relevant fields and its own lead tag.
- **Hub-and-spoke map** — real SVG US map, GA origin, spokes to all 50 states.
- **M6 taxonomy** — 6 categories (Bracing & Orthotics, Diagnostic Tests, American-Made PPE, Syringes, Supplements, Other / Medava), classification pass over the catalog done, category required on new product upload.

### Consistency cleanup (§6)
- Homepage "owned inventory" band reworked off zero-middlemen/own-everything absolutes; hero no longer claims "warehouse everything we sell"; quote CTA reworded to the approved instant-quote copy; testimonial reworded to "Berry compliant products"; footer credential line carries the MSPV BPA; full-site grep sweep done (Nevada, dealer, absolutes, fill rate, etc. — all clean).

### Deliverables (§8)
- Government page "Download capability statement" CTA is wired to `/documents/Unite_Group_Capability_Statement_2026.pdf` — **the PDF file itself still needs to be dropped into the site** (see open items).

---

## PRD-29 — What's done

### Services sub-pages (§2)
- **Distribution** — all 6 items: SEO title, "One warehouse. Every dock." hero, approved one-warehouse sub, single-shipment-fill step, **99%+ fill rate** (also fixed a straggler 98.6% on the login page), flexible-terms wording (no fixed Net-30).
- **PDAC** — DME-and-orthotics scope, ™ fixes, step-3 overclaim fixed with your approved "coding decisions rest with PDAC" copy. CTAs wired to the braces category (PDAC-filtered) and to the **new RegeniCool™ Pro listing** (see below).
- **Distributor Program** — approved Custom Sourcing copy (mechanism leak removed), cards 01/02 rewritten so catalog exposure is clearly opt-in both directions, new "Run your business like you own the warehouse" dashboard band with demo + portal-login CTAs.
- **Private Label** — manufacturing claim corrected to "network of vetted domestic and overseas manufacturers."
- **Dealer → distributor sweep** — zero "dealer" left in customer copy, prerender meta, or the sitemap; redirects for old URLs kept; internal files (margin policy, analytics, pricing) aligned too.

### RegeniCool™ Pro listing (created — unblocked the PDAC CTA)
New quote-only product listing built from **verified FDA registration data** (21 CFR 890.5720, product code ILO, establishment #3015727296): no public price ("Quote on request" → routes to the quote flow), no fabricated reviews, PDAC-approved flag, honest highlights. Lives in a hand-maintained data file that survives future catalog re-imports. It's in the sitemap and prerenders with valid schema (no fake price in the JSON-LD).

### Segments (§3)
ASC hero sub applied verbatim (same-day scoped to stocked items); Pharmacy diagnostics tags link to the new `/diagnostics` page; EMS and Distributors confirmed clean.

### Shortage matcher + Supply Risk (§4)
- Matches against **all 3 supply states** — real available inventory (on-hand − reserved), the vetted-manufacturer/quoting-engine lines, and open RFQ. "IN STOCK" only shows on real availability.
- **Cross-reference SKU database built** — every uploaded shortage list captures customer-item ↔ Unite-equivalent pairs into a new `cross_references` table; customer-validated pairs rank highest in future matches. The vendor-sheet data model also accepts a `cross_reference_skus` column (your "missing piece of the manufacturer product sheet").
- **Medical-safety guardrail** — new "acceptable substitutes" step: we only propose equivalents the customer has pre-approved; their approvals feed the cross-ref DB.
- Copy tightened to the approved "full supply chain" language (no "live stock" overclaims).
- **Supply Risk** — conversion band uses your approved copy; recall matches now surface alternates from all 3 supply sources (stocked → product page, sourced → quote). openFDA source confirmed (device enforcement endpoint, in-session cache, honest "SAMPLE FEED · OPENFDA UNREACHABLE" fallback).

### Surplus pivot (§5) — rebuilt as the broker model
- **Sell side** — "list it, set your target price, we find the buyer." CSV upload with a downloadable template + manual entry. No more "we buy it / Net-30."
- **Buy side** — "listings Unite is brokering, direct from the seller." Buyers declare a channel (medical / veterinary / research / non-medical / overseas).
- **The bridge** — buyer offer + acceptance = binding → fee invoice issued → **fee collected up front → only then is the connection released** (identities masked until the fee clears). Admin desk manages the whole flow: publish listings, accept/decline offers, "fee paid → release connection."
- **Fees (your approved tiers)** — 12.5% easy in-date lots, 25% hard-to-place, $350 per-transaction floor. Fee shown transparently to both sides with your "we don't want to stand in the way" framing.
- **Compliance guardrail built into the system** — expired lots cannot be offered through the medical channel (enforced in code, not just terms).
- **Direct-buy option kept** — the AI valuation + direct offer tools remain in admin as the optional path for lots worth owning; broker is the default.

### Content pages (§6)
- **Careers** — fake roles, headcount, "three coasts," and benefit promises all removed; honest short contact page.
- **Blog** — friendly "Field notes coming soon." empty state.
- **Resources — built real, not patched.** Wired to the actual **CMS HCPCS Level II dataset (July 2026 quarterly file, 8,725 codes)** with a repeatable import script for future quarterly updates. Functional search across every code and description, real family counts, working family filters, SKU cross-links with true counts (expandable to the actual product pages), a **working "Download PDF"** that generates a real PDF of whatever's filtered, and a dynamic CMS-update date read from the dataset. `/resources/coding` held to the same standard — official CMS descriptions, PDAC flags from product data, every SKU links to its product page. Two legacy fabrications removed (an ankle brace listed under the walking-boot code; a surgical gown listed under a mask code).
- **Support/FAQ** — approved net-30 answer (no Net-90 anywhere), PDAC-letter download wired into the answer and product pages, real FAQs written for every category, and the category filters actually filter now.

### Legal (§7) — interim copy fixes applied
- **Privacy** — "Online, Stripe" bug → "QuickBooks Online and Stripe"; SOC 2 worded as "hosted in SOC 2 Type II data centers" (hosting provider, not a Unite claim) pending your confirmation.
- **Terms** — venue → Fulton County; no Net-90.
- **Returns** — rewritten to actual policy: no returns except manufacturer defect; unopened items within 30 days of the original PO.
- **Shipping** — all prices removed (no free-over-$500, no $38/$95 tiers), no transit-time claims, no Atlanta-metro same-day; the only commitment is same-day **processing** on orders before 2pm EST, GA warehouse, all 50 states + territories.
- HQ address (1487 Trae Lane, Lithia Springs, GA 30122) consistent across legal pages, Locations, and printed documents.

---

## Open items & questions for Damon

### Assets I need from you (everything is wired and waiting for the files)
1. **Capability statement PDF** — the Government page CTA links to `/documents/Unite_Group_Capability_Statement_2026.pdf`. Send me the PDF from `Desktop/Unite Medical/Capabilities Statement/Unite Team/` and I'll drop it in. Also: verify NAICS/SIC codes against the current SAM.gov registration before it goes external (flagged in PRD-28 §8.1).
2. **PDAC determination letters** — product pages and the FAQ link to per-SKU letters at `/documents/pdac/<SKU>.pdf` (e.g. `REGENICOOL-PRO.pdf`). Send me the letters from the old site and they'll be live immediately — no code changes needed.
3. **TJS store photo** — the Portfolio flagship currently pulls the TJS storefront's own preview image. A real store/location photo would be stronger (PRD-28 asked for no placeholder).

### Confirmations owed (from the PRDs)
4. **⚠️ BPA number conflict — needs your call.** The site currently shows **two different BPA numbers**: `36F79725D0203` (Nav bar, Government page, Compliance, About, printed quotes/invoices — from the original site spec) and `36C24123A0077` (Footer + Procurement — which PRD-28 called "already correct"). One of these is wrong. Tell me which contract number is current and I'll make it consistent everywhere in one pass.
5. **SOC 2 / AES-256** — I worded Privacy as "hosted in SOC 2 Type II data centers" (true of the hosting provider). Confirm that's the final wording, or provide Unite's own attestation if one exists.
6. **Email inboxes** — three non-standard addresses appear in customer-facing copy: `privacy@` (privacy policy), `billing@` (invoice footer), `surplus@` (surplus marketplace). Confirm these inboxes exist (or I'll route them to `support@`/`accounting@`).
7. **RegeniCool™ Pro commercial details** — the listing is live as quote-only with verified FDA facts. When you're ready: confirm pricing posture (stay quote-only vs. public price), and send the PDAC letter so the HCPCS code can go on the listing.
8. **openFDA** — confirmed as the recall source (FDA device-enforcement endpoint, honest fallback when unreachable). Optional: a free openFDA API key raises the rate limit substantially — want me to register one?

### Legal (gating — flagged, not done)
9. **Legal-doc migration + compliance review (PRD-29 §7.1)** — NOT done; this needs the old site's documents and counsel. My copy fixes (returns, shipping, venue, privacy) are interim per the PRD; the migrated, legally-reviewed docs are authoritative. Send me the old-site docs and I'll stage them.
10. **Surplus broker terms** — the system guardrails are built (expired-lot channel blocking, fee-before-connection, compliance-on-buyer/seller language on both pages), but the actual broker terms & conditions and the expired/regulated-goods compliance review need legal before launch (PRD-29 §5.4.2).

### Business decisions / next-phase work
11. **Brad at Restore** — I'm ready to talk to Brad about the live savings-counter data bridge whenever you set it up. Until then the Portfolio shows static "$900K+ to date" (no fake live number).
12. **Cross-reference dataset licensing (PRD-29 §4.1.5)** — the in-house capture pipeline is live (every shortage list feeds the DB), but I haven't yet researched purchasable cross-ref/equivalency datasets (GUDID-based, distributor files) to seed it. Want me to scope that next?
13. **Real-time third-party availability (Cato question, PRD-28 §6.3)** — no data source identified yet, so all copy stays at "upload → we quote." If we find distributor-availability feeds worth licensing, the copy can truthfully upgrade.
14. **Diagnostics private-label line** — the page structure is ready to feature a Unite-branded line next to brand-neutral sourcing; nothing published until you confirm the line is live.
15. **M6 category list** — implemented as: Bracing & Orthotics, Diagnostic Tests, American-Made PPE, Syringes, Supplements, Other / Medava. Confirm this is final (it's now the catalog filter set and the required field on product upload).
16. **Supply-risk execution problem (PRD-29 §4.2.4)** — per your "don't build blindly yet": the data capture that feeds it is built (cross-ref DB, shortage-list demand, quote requests). The demand-dossier / allocation-rolodex tooling on top is designed but not built — ready to spec when you want to pick an execution model.
17. **Jackie contingency** — leadership section is built so removing her is a one-line change with no layout break. No action needed unless Kaiser pushes back.
18. **Surplus stickiness roadmap (PRD-29 §5.4.1)** — v1 ships the core moat (identity masking until fee, on-platform compliance guardrails, buyer network, freight/compliance framing). Ratings/history, saved templates, and recurring-listing tools are the natural next increments if the marketplace gets traction.
