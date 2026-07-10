# GUDID / UDI + Compliance-as-a-Service — Full Spec for Alex
## Onboarding + labeling flow to wire into the quoting engine

**From:** Damon Reed (CEO)
**To:** Alex (CTO)
**Re:** GUDID/UDI onboarding, label templates (Class 1 / Class 2), DI assignment, and the labeler-ownership flow. This is the compliance-as-a-service piece — build it so we can finish the site and launch.
**Status:** Portal-based (Phase 1). No HL7 SPL/API automation required to launch.

---

## 0. TL;DR

- Unite and Medava are **separate labelers** (separate DUNS, separate GS1 prefixes, separate GUDID records).
- GUDID submission is **portal-based (manual/assisted) for Phase 1** — Damon has portal access + labeler data-entry role. Do NOT build HL7 SPL/API automation yet; build the data-capture + template generation that *prepares* GUDID-ready records.
- Two clean labeler models + one pending-regulatory model (below).
- 🔴 **Unite GS1 capacity is nearly exhausted (299/300 GTINs used)** and 🔴 **Unite prefixes expire 2026-08-31.** Both are launch-adjacent actions for Damon.

---

## 1. Labeler identities (both companies — Damon owns both)

| Labeler | DUNS | GS1 Prefix(es) | Used for |
|---|---|---|---|
| **Unite Medical, LLC** | `117553945` | `0850012035` (medical=YES), `0850063323` (medical=YES), `0850052096` (medical=NO) | Unite-branded devices |
| **medava, LLC** | `127447715` | `0850058304` (verify medical flag) | Medava-branded devices |

- FDA establishment reg (Unite): `3015727296`.
- Every DI issued for a **medical device** must come from a prefix flagged "Used for Medical Devices = YES" in GS1 Prefix Verification. For Unite that's `0850012035` and `0850063323` (NOT `...52096`).
- Alex: the system must know **which prefix maps to which labeler/brand**, and only draw medical-device DIs from medical-flagged prefixes.

---

## 2. Labeler-ownership flow (WHO owns the DI + GUDID record)

The GUDID **labeler** = the entity whose brand/responsible-party identity is on the device label. The labeler owns the DI and the GUDID submission.

| Model | Brand on label | DI source | GUDID submitter | Status |
|---|---|---|---|---|
| **A — Unite Ready** | Unite or Medava | Unite/Medava GS1 prefix | Unite/Medava (we're the labeler) | ✅ Clean — build |
| **B — Unite Custom (customer has GS1 + know-how)** | Customer's brand | Customer's DI / their GS1 prefix | Customer (they're the labeler) | ✅ Clean — build |
| **C — Unite Custom (customer lacks GS1/know-how)** | Customer's brand + "Distributed by Unite Medical" | Unite-owned prefix, assigned under customer brand name | Unite acts as labeler/agent | ⚠️ PENDING REGULATORY SIGN-OFF — build the plumbing but gate behind a "compliance review" flag; do NOT market as settled |

**Model C is the compliance-as-a-service upside** (small brands who can't do GUDID themselves) but is a regulatory gray area: "Distributed by Unite" only makes Unite the labeler if Unite is genuinely the responsible-party identity on the label. Damon is getting this blessed by regulatory/counsel. Build A + B as the launch paths; stage C behind a flag.

---

## 3. GUDID minimum required data elements (from FDA's live UDI field set)

### CORE MINIMUM — required for BOTH Class 1 & Class 2 (captured at onboarding, DI-level)
- Primary DI (from GS1 prefix)
- Labeler DUNS
- Brand Name
- Version/Model Number
- Company Name (labeler)
- Device Description
- Device Count in Base Package
- Commercial Distribution Status
- FDA Product Code (3-letter)
- GMDN Term
- MRI Safety (safe / conditional / unsafe / labeled)
- Sterile? (Y/N) + Sterilization Method
- Requires sterilization before use? (Y/N)
- Rx or OTC
- Single-Use? (Y/N)
- Kit? (Y/N) / Combination Product? (Y/N)
- Contains NRL / natural rubber latex? (Y/N)
- PI flags: has lot/batch #, has serial #, has manufacturing date, has expiration date

### CLASS 2 ADDS (on top of core)
- **510(k) / Premarket Submission Number** (the K-number) — Class 2's defining field
- Stricter completeness on sterilization / GMDN / MRI

### CLASS 1
- Same core fields; **510(k) field = "Exempt"** in most cases (most Class 1 are 510(k)-exempt)

### PI (Production Identifier) — captured at PRODUCTION, not onboarding
- Lot/Batch #, Serial #, Manufacturing Date, Expiration Date — flow in at the label/production stage per production run. Onboarding captures the DI + core record + the PI *flags* (which PIs apply); actual PI values come later.

---

## 4. The two label / intake templates to build

**Class 1 (minimum) intake template** — core fields + "510(k) Exempt", minimal sterilization detail. Often just needs a UPC/DI + core identity.

**Class 2 (full) intake template** — core fields + real 510(k) number + full sterilization/GMDN/MRI detail.

**Two customer paths for each (from Damon's note):**
1. **"Use our standard label template"** — customer uploads the required field values → Unite generates the label + GUDID-ready record.
2. **"Upload your own approved label files"** — customer uploads their finished label artwork → Unite runs a **compliance check** against the required-field list before accepting.

Alex builds: Class 1 / Class 2 intake forms, the field-validation, the label-template generator (path 1), the file-upload + compliance-check (path 2).

---

## 5. DI assignment + capacity management

- **DI assignment:** sequential from the appropriate medical-flagged prefix for the labeler/brand. System reserves + records each DI as assigned.
- 🔴 **CAPACITY ALERT:** Unite has used **299 of 300** GTIN capacity across its 3 prefixes. Effectively full. Before scaling Unite-branded onboarding, Damon must either (a) **retract** retired/duplicate GTINs to reclaim capacity, or (b) **buy another prefix batch.** Medava (`0850058304`) has fresh ~100 capacity.
- **BUILD: DI-capacity tracking per prefix** — show used vs. remaining per prefix, and **alert when a prefix nears its cap** (e.g., within 20). This is how we manage prefix batches as adoption grows instead of guessing. (GS1 only shows total capacity, not remaining — we track consumption on our side.)
- 🔴 **RENEWAL:** Unite's 3 prefixes expire **2026-08-31**; Medava's expires **2026-10-31**. Don't assign DIs from a prefix about to lapse — Damon to renew.

---

## 6. Where this sits in the quote flow

- GUDID/UDI is a **POST-quote / PRE-production gate**, NOT a quote blocker. A quote proceeds; once the order is committed, the labeling + GUDID step runs:
  1. Determine labeler model (A/B/C) + device class (1/2)
  2. Assign DI (models A/C) or capture customer DI (model B)
  3. Capture core GUDID fields via the class-appropriate template
  4. Generate label (path 1) or compliance-check uploaded label (path 2)
  5. GUDID record prepared → submitted via portal (Phase 1)
  6. PI data (lot/expiry/mfg) captured at production

---

## 7. Phase 1 vs later

- **Phase 1 (launch):** portal-based GUDID submission; models A + B; Class 1 + Class 2 templates; DI assignment + capacity tracking; label template generator + upload/compliance-check.
- **Later:** HL7 SPL / API automated GUDID submission (once volume justifies); Model C productized (after regulatory sign-off); multilingual (ties to vendor dashboard).

---

## 8. Actions Damon owes (tracked)

1. ✅ Unite DUNS `117553945`, Medava DUNS `127447715` — provided.
2. 🔴 Resolve Unite GS1 capacity (retract or buy batch) before scaling Unite onboarding.
3. 🔴 Renew Unite prefixes before 2026-08-31.
4. ⬜ Regulatory/counsel sign-off on Model C ("Distributed by Unite" labeler question).
5. ⬜ Confirm Medava prefix `0850058304` medical-device flag = YES in GS1 Prefix Verification.
