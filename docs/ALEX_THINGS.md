# Alex things

> Stuff the rebuild can't ship cleanly without you. Each item has a one-line
> ask, where it lives in the code (`file:line`), the current placeholder
> behavior, the PRD reference, and a definition-of-done.

Last updated: 2026-05-13 · synced with `docs/PRD.md` + the CTO spec.

---

## 1. Real Shopify SKU count

**Ask:** Wire the homepage live-inventory widget, catalog header, and
locations card to the real product count from Shopify Admin API.

| Where | What |
|---|---|
| `src/pages/Homepage.jsx:78-83` | Hero "LIVE INVENTORY" card currently shows `Stocked & warehoused / Georgia & Nevada` (no number) |
| `src/pages/Locations.jsx:8-12` | Both warehouse cards show `SKUs: —` |
| `src/pages/Catalog.jsx:82` | Catalog header shows `CATALOG · STOCKED & SHIPPING SAME DAY` (no count) |

**Suggested fetch (per spec §10.2):**

```
GET /admin/api/2024-01/products/count.json
Header: X-Shopify-Access-Token: <admin-token>
```

**DoD:**
- Real count displayed; falls back gracefully to "Stocked catalog" if the
  API call fails.
- Token stored as a server-side env var (do **not** ship to client). A
  Vercel serverless function under `api/shopify-count.js` is the obvious
  pattern; cache the response for ~15 min.
- `scripts/phase_check.py` keeps passing.

---

## 2. Real warehouse square footage

**Ask:** Confirm the actual sqft for both warehouse locations.

| Where | Placeholder |
|---|---|
| `src/pages/Locations.jsx:8-12` | `sqft: '—'` for both Lithia Springs, GA and Nevada |

**DoD:**
- Drop the real numbers into the `hubs` array.
- Confirm the "Nevada" city label — should it be city-level (e.g. Reno) or
  stay state-level per spec §4k? (Spec says state-level.)

---

## 3. `/services/education` redirect target — confirm

**Ask:** Was the old `/services/education` page intended to house **blog
content**, or did it have its own content type?

**Current state:** Redirects to `/blog` in both `vercel.json` and
`src/App.jsx` (defaulted per spec §10.1).

**DoD:**
- If blog is correct → no change.
- If it should go to `/resources` (or anywhere else) → update the redirect
  destination in `vercel.json` AND in `src/App.jsx` (`<Route path="/services/education">` line in the App router) AND in the
  `REQUIRED_REDIRECTS` table in `scripts/phase_check.py`.

---

## 4. Quoting engine — backend maturity check

**Ask:** Confirm what level the quoting-engine backend is actually at. Damon
believes we may be further along than the frontend reflects.

**Current state:** `/quote` has been *sanitized* (Flexport, Claude,
OpenFDA, margin %, FOB prices, Shanghai factory name, "CORE IP" label,
"AI cover letter" label all removed from customer-facing copy) but
internal step names still drive the engine — see
`src/pages/Quote.jsx:13-20` for `STEP_ICONS` mapping.

**DoD:** Either
- Confirm "sanitized current page is fine for launch", or
- Tell me what real capability set to expose, and we replace the demo
  with the real product per `Unite_Quoting_Engine_Spec.md`.

---

## 5. Quoting page — full rebuild?

**Ask:** Is the rebuild per `Unite_Quoting_Engine_Spec.md` queued for now,
or post-launch?

**Current state:** Page is safe to ship (no proprietary leakage), but it's
still the old demo flow. Spec §4p says "must be completely rebuilt before
launch".

**DoD:**
- If pre-launch: schedule the rebuild and we'll wire the new page in
  behind the same `/quote` route.
- If post-launch: file a follow-up ticket, leave the current sanitized
  page in place.

---

## 6. Blog content — confirm with Jill

**Ask:** Coordinate with Jill on real article content.

**Current state:** All four placeholder articles removed from
`src/lib/seed.js`. The blog page (`/blog`) renders with category filters
and proper JSON-LD; it just shows an empty state until real posts land.

**DoD:**
- Real posts added back into `SAMPLE_BLOG_POSTS` (`src/lib/seed.js:123`) — there's a
  commented-out template above the empty array showing the expected
  shape.
- Re-run `python3 scripts/phase_check.py` to confirm none of the new
  titles match the forbidden-string list (we forbid the four placeholder
  titles by name).

---

## 7. Document REQUEST buttons — do they work?

**Ask:** On the Compliance page document library, do the existing per-doc
REQUEST buttons actually fire anything, or are they mockups?

**Current state:** They call `gmail.send({ to: 'info@unitemedical.net', … })`
via the in-browser fake service (`src/lib/services.js`). On the *real*
backend you'd want this to hit a real send endpoint and create a
`doc_requests` row in your actual DB.

**Where:** `src/pages/Compliance.jsx:40-46` (`request(doc)` function).

**DoD:**
- Either replace the call site with a real fetch to your backend, or
- Confirm "mock is fine for now" and we leave it.
- Spec §4l also calls for a single Documents CTA (`/contact?reason=Document%20request`)
  as the primary path — that part is **done**; the per-doc buttons stay
  as a convenience.

---

## 8. Partner logos — sourcing

**Ask:** Source SVG (or high-res PNG) for the 8 new partners listed in
spec §9.1.

| # | Company |
|---|---|
| 1 | Ardent Health |
| 2 | Restore Robotics |
| 3 | Amazon Fresh |
| 4 | WellLink |
| 5 | The Resource Group |
| 6 | Orlando Health |
| 7 | UF Health |
| 8 | Total Joint Specialists |

**Where they land:** `public/logos/` (existing partner SVGs live under that
folder). The marquee component is `src/components/shared/PartnerMarquee.jsx` — point
new entries at it.

**DoD:**
- 11 logos total visible in the homepage logo bar (3 kept + 8 new).
- Removed from the bar (per spec §4a): CVS Health, Walgreens, Amazon,
  Kaiser Permanente, HCA Healthcare, ASCOA, Surgery Partners.

---

## 9. Coverage map — redraw

**Ask:** Replace the 4-dot CONUS map with a 2-dot version (Georgia +
Nevada only).

**Where:** `src/pages/Locations.jsx:35-50` — the inline SVG + absolutely-
positioned dots are driven by the `hubs` array, which is now down to two
entries. Visually it'll work; if you have a designed asset, drop it in
and replace the inline SVG block.

**DoD:**
- Two dots only.
- No Dallas, TX dot.
- No separate Atlanta dot (Lithia Springs is the same metro).

---

## 10. Compliance shield/badge graphic

**Ask:** Per spec §9.3, design a 4-category compliance badge for the
quoting engine compliance verification display.

| Category | Purpose |
|---|---|
| FDA Status | Registration verification |
| Quality System | ISO / QMS status |
| Product Testing | Testing standards compliance |
| Certifications | PDAC, Berry, TAA, etc. |

**Where it lands:** Currently absent. Add when we rebuild the quoting
engine (see item #5 above).

**DoD:** Asset committed under `public/images/` and referenced from the
quoting-engine compliance section.

---

## 11. TJS site fix — separate repo

**Ask:** Implement server-side 301 from `tjs.unitemedical.net/` →
`tjs.unitemedical.net/store` (spec §8). The blank-page-then-JS-redirect bug
on the root URL needs to die at the edge.

**Where:** That's a different repository (`tjs.unitemedical.net`), not
this one. We'd typically drop into `next.config.js`:

```js
async redirects() {
  return [{ source: '/', destination: '/store', permanent: true }];
}
```

…or the equivalent `vercel.json` `redirects` entry.

**DoD:** Curl `https://tjs.unitemedical.net/` and verify a `301
Location: /store` response with no client-side JS in the redirect path.

---

## 12. Lot-level tracking — backend implementation

**Ask:** Stand up the `lot_tracking` table on the real database and wire
the WMS pick-and-pack flow to write a row per shipped item.

**Where:** Schema is canonical at `docs/schema/lot_tracking.sql` (DDL +
the recall query from spec §7.3).

**DoD:**
- Table created with both indexes (`idx_lot_tracking_lot`,
  `idx_lot_tracking_product_lot`).
- Every shipped line item produces exactly one `lot_tracking` row, with
  `scanned_by` populated.
- A recall lookup for a given `lot_number` returns the affected
  customer list in under a second.
- SLA promise on the `/compliance` page ("within one business day") is
  now backed by real data.

---

## 13. Account-approval — backend wiring

**Ask:** Hook `evaluateAccount(application)` from
`src/lib/accountApproval.js` into the signup endpoint.

**Where:** The function is pure JS, no deps — ready to call from a
serverless handler or directly from `src/pages/Register.jsx`. Returns
`{ decision: 'AUTO_APPROVE' | 'MANUAL_REVIEW', score, reasons }`.

**DoD:**
- AUTO_APPROVE path provisions the account and emails the credit-card
  checkout flow per spec §6.4 (new accounts start CC-only; net-30 via
  separate credit application).
- MANUAL_REVIEW path sends the one-click email to sales per the template
  in spec §6.3.

---

## Quick-reference index

When working on any of these, search the codebase for the spec section
to find context:

```
rg "spec §10"     # PRD/spec cross-refs
rg "TODO\(alex\)" # in-code call-outs
```

And verify nothing regressed:

```
python3 scripts/phase_check.py
npm run lint
npm run build
```
