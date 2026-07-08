# Unite Medical — Brand & Voice Guidelines

**System name:** Precision · **Version:** 1.0 · **Date:** July 7, 2026
**Source of truth:** `src/tokens.js`, `src/components/shared/Logo.jsx`, `scripts/phase_check.py` (copy rules)

Everything in this sheet is enforced in code. The design tokens live in `src/tokens.js`; the copy rules are machine-checked on every build by `scripts/phase_check.py`. If this document and the code ever disagree, the code is right — then fix this document.

---

## 1. The brand idea

Unite Medical sells to people who buy for institutions: materials managers, pharmacy buyers, VA contracting officers, EMS chiefs, regional distributors. These buyers are professionally skeptical. They read **precision** as trust and **gloss** as risk.

So the brand is built like a technical document, not a landing page:

- Bone paper, green-black ink, one deep surgical-green accent.
- Hairline rules instead of drop shadows.
- A heavy monospace "data layer" — registration numbers, SKUs, HTS codes, lead times — presented as chrome, because for this audience the data *is* the decoration.
- **No** decorative gradients, no glassmorphism, no floating orbs, no shimmer. Those read "AI-generated startup," which is the opposite of what a hospital buyer wants to see.

One line to remember: **institutional procurement reads precision, not gloss.**

---

## 2. Logo

### 2.1 The mark

A "UM" monogram — a "U" ligature with an "M" — drawn in bone strokes on a solid surgical-green field with slightly rounded corners (radius = 14% of the mark's size).

- Field: `#1d5c4d` (surgical green)
- Strokes: `#f3f2eb` (bone), round caps and joins
- Master SVG: `public/favicon.svg`
- React component: `UMLogoMark` in `src/components/shared/Logo.jsx`
- Raster source: `public/images/source/um-logo-mark.png`

The flat single-color mark is deliberate: it prints, embroiders, and engraves cleanly. The old orange-to-magenta gradient chip is **retired — never use it.**

### 2.2 The lockup

Mark + wordmark, set in Archivo:

> **Unite** Medical — "Unite" at weight 600 in full ink; "Medical" one weight lighter at 62% opacity.

Component: `UMLogo` in `src/components/shared/Logo.jsx`. Use the component; don't rebuild the lockup by hand.

### 2.3 Produced assets

| Asset | Path |
|---|---|
| Master SVG | `public/favicon.svg` |
| Favicons (16/32/96/180/192/512 + .ico) | `public/favicon-*.png`, `public/favicon.ico` |
| Apple touch icon | `public/apple-touch-icon.png` |
| Regeneration script | `scripts/render_favicons.py` |

### 2.4 Rules

- Minimum size: 16 px (the mark survives it; the lockup needs ≥ 20 px height).
- Clear space: half the mark's height on all sides.
- On dark grounds, the mark is unchanged (its field carries contrast); the wordmark flips to bone.
- Never: recolor the field, add a gradient, add a shadow, outline it, rotate it, or place it on a photo without a solid backing.

---

## 3. Color

All colors live in `src/tokens.js` as the `D` object. Legacy key names (`plum`, `terra`) were kept so 49 pages could retheme without a rename sweep — **the key says plum, the value is green.** Always reference tokens, never paste hex into components.

### 3.1 Palette

| Token | Hex | Name | Role |
|---|---|---|---|
| `D.paper` | `#f3f2eb` | Bone | Primary background |
| `D.paperAlt` | `#e9e7dc` | Deep bone | Alternating bands, table stripes |
| `D.card` | `#fcfbf6` | Raised bone | Cards and raised surfaces |
| `D.ink` | `#16201a` | Green-black | Primary text |
| `D.inkDeep` | `#0e1713` | Evergreen black | Dark bands, footer, hero plates |
| `D.ink2` | `#57635a` | Slate green | Secondary text |
| `D.ink3` | `#8b968d` | Fog green | Tertiary/meta text, table headers |
| `D.line` | `#dbd9cc` | Hairline | 1 px rules and borders |
| `D.plum` | `#1d5c4d` | **Surgical green** | THE accent: links, eyebrows, emphasis, logo field, primary buttons |
| `D.plumSoft` | `#9dbcae` | Sage | Accent on dark grounds only |
| `D.terra` | `#b3592b` | Clay | Signal/warning accent — sparingly (near-expiry, alerts, pending states) |
| `D.terraSoft` | `#dcc0a8` | Soft clay | Muted warning surfaces |
| `D.grad` | green 135° gradient | — | Functional depth on dark plates ONLY, never decoration |

### 3.2 Rules

- One accent. Surgical green does all the emphasis work. If everything is green, nothing is — keep accent coverage under roughly 10% of any view.
- Clay (`terra`) means "pay attention": warnings, near-dated stock, pending confirmations. It is never decorative.
- Dark sections use `inkDeep` grounds with bone text and sage accents.
- Contrast: ink on paper ≈ 13.5:1, surgical green on paper ≈ 6.9:1 — both pass WCAG AA. Fog green (`ink3`) is for meta text ≥ 11 px only.

---

## 4. Typography

Three families, three jobs. Loaded from Google Fonts (see `index.html`):

`Instrument Serif (400, italic) · Archivo (400–700 variable, italic) · IBM Plex Mono (400, 500)`

| Token | Family | Job |
|---|---|---|
| `D.display` | **Instrument Serif** | Headlines and display only. Weight 400 always — size does the work, not weight. Tight letter-spacing (−1 px and beyond at large sizes). |
| `D.sans` | **Archivo** | Everything readable: body, UI, buttons, forms. 400 body / 600 emphasis and buttons. |
| `D.mono` | **IBM Plex Mono** | The data layer: SKUs, registration numbers, prices, table headers, eyebrows, timestamps. Uppercase + letter-spacing 1–2 px for labels. |

### 4.1 Signature moves

- **Italic serif emphasis** — emphasis inside a headline is italic Instrument Serif in surgical green (the `Grad` component in `src/components/shared/Grad.jsx`). Quiet, editorial, print-like. This replaced the old gradient-shimmer text, which is banned.
- **The eyebrow** — sections open with a short 28 px rule + mono caps label in green (the `Eyebrow` component). It reads like a figure label in a technical document. Realtime contexts may swap the rule for a pulsing dot.
- **Data as chrome** — the nav utility strip sets FDA, MSPV BPA, and CAGE numbers in 10.5 px mono. Credentials are part of the interface, not buried in a footer.

Headline scale is fluid: `clamp(34px, 5.6vw, 56px)` for page titles, up to `clamp(34px, 6vw, 60px)` for heroes, line-height ~1.02.

---

## 5. Graphic language

- **Hairlines, not shadows.** Structure comes from 1 px `D.line` rules. Border radii are 0–4 px on structural elements (sharp = institutional); 12 px only on large cards.
- **Photography** is documentary: real warehouse, real product, natural light, framed by a hairline with a mono data strip beneath — like a plate in a report. No stock-photo handshakes, no lens flares.
- **Tables and grids everywhere.** Mono uppercase column headers in fog green on deep-bone strips. Data is a first-class visual citizen.
- **Motion** is minimal: fade-ups on scroll (`um-fade-up`), a 2.6 s pulse for live indicators. Nothing loops for decoration.
- Banned outright: glassmorphism, decorative gradients, orbs/blobs, shimmer, emoji in UI copy, drop shadows as decoration.

---

## 6. Voice

### 6.1 Principles

1. **Precise beats impressive.** "Ships same-day on orders before 2pm EST" — never "lightning-fast shipping."
2. **Honest to a fault.** No fake team pages, no invented headcount, no inflated SKU counts, no phantom warehouses. Where we're small, we say so plainly. (The Blog is empty rather than filled with filler; Careers is an honest contact page.)
3. **Talk like a counterparty, not a vendor.** The reader manages procurement for a living. Skip the wind-up, lead with the term sheet: price, lead time, compliance status, minimums.
4. **The data carries the emotion.** A real FDA registration number is more persuasive than any adjective.
5. **Lowercase confidence.** Understatement over exclamation. One exclamation point per site, ideally zero.

### 6.2 Style mechanics

- Sentence case for headlines and buttons ("Source & quote", not "SOURCE & QUOTE!"). ALL-CAPS is reserved for the mono data layer.
- Numerals over words for anything a buyer might compare: "500M+ units", "before 2pm EST".
- Em dashes and middots (·) are house punctuation for data strings: `FDA 3015727296 · CAGE 8MK70`.
- Times are EST. Dates are unambiguous (Jul 7, 2026).
- "Distributors," never "dealers."

### 6.3 Hard copy rules (machine-enforced)

`scripts/phase_check.py` fails the build if customer-facing copy contains any of these:

| Never say | Because / say instead |
|---|---|
| BPA `36F79725D0203` | Retired. **MSPV BPA 36C24123A0077** (confirmed by Damon, Jun 29, 2026) |
| VOSB / SDVOSB as a self-claim | Unite doesn't hold these. Only "via authorized SDVOSB partner" (external attribution) is allowed |
| "48-hour shipping", "4 DCs", "3 coasts", Reno/Dallas warehouses, "12,400 SKUs" | Fiction. One warehouse: **Lithia Springs, GA** — "same-day on orders before 2pm EST to all 50 states" |
| Flexport, ShipStation, QuickBooks/QBO, Cin7, PunchOut/cXML/OCI | Vendor internals never appear in customer-facing copy — describe the capability, not the tool |
| "22 years", "U.S. Army", "Army logistics officer" | Unverified founder-bio claims |
| "EST. 2018" | Wrong founding year |
| Any `@unitemedical.com` address | Domain is **`@unitemedical.net`** |
| "HCPC" | It's **HCPCS** |
| "Big 3" digs | We don't punch at competitors by name |

### 6.4 Canonical facts (the only approved versions)

| Fact | Value |
|---|---|
| Legal name | Unite Medical Supply |
| Address | 1487 Trae Lane, Lithia Springs, GA 30122 |
| Phone | 833.868.6483 (accounting/billing: ext. 3) |
| Email domain | `@unitemedical.net` (support@, accounting@) |
| FDA establishment registration | 3015727296 |
| MSPV BPA | 36C24123A0077 (label it "MSPV BPA") |
| CAGE | 8MK70 |
| DUNS | 117553945 |
| Footprint | One warehouse: Lithia Springs, GA — ships to all 50 states + territories |
| Shipping claim | Same-day on orders placed before 2pm EST, Mon–Fri |
| Scale claim | 500M+ units distributed |
| Ownership claim | Veteran-owned (no VOSB/SDVOSB certification claims) |

### 6.5 Voice by context

- **Marketing pages:** editorial and spare. Serif headline, one italic-green emphasis, short declarative subhead, then let the data grid talk.
- **Product/quote/portal UI:** terse and mono-forward. Labels over sentences. "HTS PENDING · CONFIRM AT DESK" beats a paragraph.
- **Vendor-facing (manufacturers):** plain instructional English, short sentences, no idioms — most readers are ESL. Say exactly what to put in each field and what happens next.
- **Government/compliance:** formal, citation-heavy, zero superlatives. Contract numbers up front.
- **Errors and empty states:** honest and useful. Say what happened and the one next action. Never chirpy ("Oops!").

---

## 7. Quick reference card

```
BACKGROUND  #f3f2eb bone          TEXT     #16201a green-black
SURFACE     #fcfbf6 card          ACCENT   #1d5c4d surgical green
DARK BAND   #0e1713 evergreen     WARNING  #b3592b clay
HAIRLINE    #dbd9cc

DISPLAY  Instrument Serif 400 (italic = emphasis, always in green)
BODY/UI  Archivo 400/600
DATA     IBM Plex Mono 400/500, caps + tracking for labels

VOICE    precise · honest · counterparty-to-counterparty · data-first
NEVER    gradients-as-decoration · glass · orbs · vendor names in copy ·
         self-claimed certifications · invented numbers · @unitemedical.com
```
