# Alex → Damon — Launch Handoff

**From:** Alex · **Date:** July 10, 2026 · **Repo:** unite_2_0 / main
**TLDR:** Everything from your Jul 10 handoff is built and deployed. The full platform — including the GUDID/UDI compliance service you prioritized — is live on production hosting at **https://unite-2-0.vercel.app**, with your Flexport key active server-side. The public domain still points at the old site; that cutover is the last switch, and it's yours to call after your walkthrough. Walk the flow, give me the go, and I'll point the domain.

---

## 1. Your walkthrough link

**https://unite-2-0.vercel.app** — this is the real production deployment (not a preview). Suggested route, matching what you said you wanted to check:

1. **Quote flow** — Admin → Quotes → New quote. Upload a vendor sheet (the v2 template or any messy CSV). Watch the preview: HTS hints, stock-match badges, the Flexport classification export button.
2. **301 math on a China line** — include a China-origin line; the quote shows MFN + Section 301 duty components and flags unconfirmed HTS as pending.
3. **Side-by-side offers** — each quote line carries Unite Ready / Unite Custom variants with price breaks and amortized tooling.
4. **SKU-match buy-now** — upload a line that matches catalog stock; the in-stock badge and buy-now path appear on the quote.
5. **UDI / GUDID desk** — Admin → UDI / GUDID: prefix capacity board, the gate queue, Model C acknowledgment, intake editor, label paths. Accept a quote with an import/private-label line and watch the gate open automatically.

## 2. GUDID / UDI — your spec, finished

Everything in `docs/ALEX-SPEC-gudid-udi-compliance.md` Phase 1 is built, tested, and live:

| Spec item | What's live |
|---|---|
| Prefix registry | All 5 prefixes seeded with medical flags. New Unite DIs draw from `0850089282`; the non-medical `0850052096` can never issue a device DI. |
| DI assignment + capacity | Sequential GTIN-13s with valid check digits; used-vs-remaining per prefix on the admin board; alert at ≤20 remaining. |
| Models A / B / C | A assigns our DI, B requires the customer's DI (they submit GUDID), C is **hard-blocked until the customer signs all four acknowledgment terms** — the gate you asked for, enforced in code. |
| Class 1 / 2 intake | In-app intake editor with live validation (Class 2 demands a real K-number; Class 1 takes "Exempt"), plus a downloadable intake workbook generated from the same field list — sheet and validator can't drift. |
| Both label paths | Path 1 generates the label spec from captured fields (Model C labels automatically carry "Distributed by Unite Medical"); path 2 compliance-checks uploaded artwork against the required-elements list. |
| Post-quote gate | Opens on order commit for import/private-label lines without a GTIN. Never blocks a quote or an acceptance. PI data (lot/expiry/mfg) stays at production, flags only at intake. |
| Portal submission | Records march draft → ready to label → ready for GUDID → submitted; you submit via the portal and mark it here. Model B records can't be marked — the customer submits those. |

16 dedicated tests cover the whole flow (48 total in the suite, all passing; all four compliance checkers green).

## 3. Flexport — wired, live, one answer for you

- **Your question: no OAuth needed.** The bearer API key is sufficient — don't generate the Client ID/Secret.
- The key is set in Vercel production env (`FLEXPORT_API_KEY`, encrypted, server-side only — never in the browser bundle, never in git). The live health check confirms: **Flexport = configured** in production.
- One housekeeping item: the one-pager you sent also contained the OAuth client secret in plaintext. We're not using it, but since it traveled by document, consider deleting/rotating that credential pair in Flexport admin. The API key itself is fine.

## 4. Your other two decisions — done

- **Inboxes:** `billing@` → `accounting@`, `privacy@` and `surplus@` → `support@`, everywhere they appeared (legal pages, invoices, surplus marketplace, finance notifications).
- **Priority order:** GUDID built first, as directed. Next in your order: vendor dashboard hook, then the quote-miss digest. Both ready to start on your go.

## 5. The one switch left — the domain

`www.unitemedical.net` still serves the old site. The new platform is fully deployed and waiting behind `unite-2-0.vercel.app`. When your walkthrough checks out, say go and I'll do the cutover (add the domain to the Vercel project + DNS update). Until then, nothing customer-facing has changed — exactly the hold you asked for.

## 6. State of the codebase

- 48/48 automated tests · 45/45 compliance checks · lint clean · production build prerendering 122 routes.
- Umendra and Pentastar shakedowns: the quote flow is ready for both. When Umendra's sheet arrives, it can go straight through the vendor upload; the Pentastar Lite template will parse through the same 53-column mapper (it tolerates trimmed sheets).
- Parked, per your note: UFLPA/forced-labor layer — logged in the spec docs, not built.
