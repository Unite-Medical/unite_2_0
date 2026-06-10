# PRD-06 — HubSpot CRM + 1099 Rep System

**Source:** CTO Brief §5 (Priority #5)
**Owner:** Alex (CTO) + VP Sales as product partner
**Status:** draft
**Depends on:** PRD-01 (Platform), PRD-02 (QBO customers mirror)
**Blocks:** PRD-05 (Fathom action items push here), PRD-08 (Quoting engine creates HubSpot deals)

> "Scale reps nationally with full visibility from home office." — Brief §2

---

## 1. North star

Every customer is a HubSpot contact/company with full order history,
tier, rep assignment, and account status. Every order is a deal in a
custom pipeline. Every 1099 rep has their own pipeline view, activity
feed, and task queue. From his home office, the VP Sales sees every
rep's live activity, pipeline, and conversion rate without asking.

---

## 2. Current state

- HubSpot is connected to Shopify via a free plugin (shallow sync only)
- VP Sales uses HubSpot for pipeline management, manually
- 1099 reps: no structured system; activity tracking is manual
- Some reps work from spreadsheets and personal Gmail

---

## 3. Scope

### In scope

- Replace Shopify plugin with direct HubSpot CRM API integration
- Custom objects + pipeline tailored to Unite Medical:
  - Companies enriched with `segment` (ASC / Pharmacy / EMS /
    Distributor / Government), `tier` (A/B/C), `terms` (net30 /
    net60 / card / ACH), `assigned_rep`
  - Deals using a custom pipeline: `Lead` → `Qualified` → `Quoted` →
    `Negotiation` → `Won` / `Lost`
  - Tasks auto-generated from Fathom calls (PRD-05) and from quoting
    activity (PRD-08)
- 1099 rep onboarding: each rep gets a HubSpot user account and a
  pipeline view scoped to their accounts
- Manager dashboard: aggregate view across all reps
- Workflows: automated follow-up sequences for stalled deals
- Lead enrichment: openFDA + ImportGenius contacts (PRD-07, PRD-08)
  auto-pipe into HubSpot

### Out of scope

- HubSpot Service Hub (we use it only for CRM + Marketing for now)
- Marketing-automation campaigns beyond transactional sequences —
  defer to a follow-up PRD when marketing leadership is in place
- Replacing HubSpot — pure integration scope
- Rep commission payouts (defer to Stripe Connect — PRD-09 Phase 5)

---

## 4. Custom data model in HubSpot

### Companies

Custom properties added:

- `segment` (enum: asc, pharmacy, ems, gov, distributors, retail)
- `unite_tier` (enum: A, B, C)
- `terms` (enum: net30, net60, card, ach, mspv)
- `credit_limit` (number)
- `total_spend_ytd` (number, auto-computed from QBO)
- `account_rep` (HubSpot user ID)
- `last_order_at` (date)
- `dea_number` (string, encrypted)
- `tax_exempt_status` (enum: yes, no, pending)

### Contacts

Custom properties:

- `role` (enum: buyer, ops, clinician, finance, exec)
- `decision_authority` (enum: economic, technical, user, gatekeeper)
- `last_call_at` (date)
- `last_call_summary` (text — populated by Fathom integration)

### Deals — custom pipeline `B2B Wholesale`

Stages:

1. **Lead** — inbound or rep-sourced; not yet qualified
2. **Qualified** — fit confirmed; rep owns
3. **Quoted** — quote sent (links to our `quotes.id`)
4. **Negotiation** — last-mile haggling
5. **Won** — converted to order (links to our `orders.id`)
6. **Lost** — with reason code

---

## 5. Phases

### Phase 1 — Disconnect old plugin, OAuth in new

- Remove Shopify-HubSpot plugin (legacy free integration)
- HubSpot API app registered (private app for production, OAuth for
  reps)
- Custom properties added per §4
- Pipeline created
- `services.js` `hubspot` stub body replaced with real client

**Exit:** HubSpot admin shows the new pipeline + properties; an
existing test customer has the new fields populated.

### Phase 2 — Bidirectional sync (Companies + Contacts + Deals)

- Background sync (every 15 min) of companies + contacts
- On order placement (PRD-02 trigger), create a HubSpot Deal in
  `Won` stage; link to our `orders.id` via a custom property
- On invoice paid (PRD-02 webhook): update Deal amount + close date
- On new customer signup (PRD-14): create Contact + Company

**Exit:** Creating a customer in our portal results in a fully populated
HubSpot company+contact pair within 15 minutes. Closing a Deal in
HubSpot doesn't break our DB.

### Phase 3 — Rep onboarding + role-based visibility

- Each 1099 rep gets a HubSpot user seat (HubSpot's user model
  matches; we use HubSpot Owners, not ours)
- Custom views per rep: "My accounts", "My open deals", "My tasks
  today"
- Manager view: "All reps", "Pipeline by rep", "Conversion by rep"
- Rep assignment policy: territory + segment-based, configured in
  `/admin/settings/rep-assignment`

**Exit:** A new rep signed up in HubSpot can see only their assigned
accounts + tasks. VP Sales sees all reps' activity in one view.

### Phase 4 — Automated workflows

- Stalled deal in `Quoted` > 7 days → auto-task to rep + email reminder
- Customer hasn't ordered in 90 days → auto-task to assigned rep
- New high-value lead (qualified + segment in {gov, distributors,
  retail}) → Slack alert to VP Sales
- Won deal → thank-you email auto-sent via Resend (template per
  segment)

**Exit:** All 4 workflows fire on synthetic test data. VP Sales
confirms the cadence is right.

### Phase 5 — Lead enrichment from external sources

- Open FDA (PRD-07): foreign manufacturer discovered → Lead in HubSpot
  with `lead_source = openFDA`, segment `vendor_prospect` (separate
  pipeline)
- ImportGenius (PRD-08): hospital importing their own supplies → Lead
  in HubSpot with `lead_source = importgenius`, segment populated
- Lead-enrichment service runs Claude pass to fill in firmographics
  (size, geography, segment) before pushing to HubSpot

**Exit:** Both enrichment pipelines run daily, producing leads with
all required fields populated. VP Sales confirms quality is high
enough to feed reps.

### Phase 6 — Reporting + commission tracking

- "Rep scorecard" in `/admin/crm/reps` shows:
  - This-month bookings vs. quota
  - Pipeline value
  - Activity (calls per week from PRD-05, emails sent, meetings booked)
  - Conversion rate (Quoted → Won)
- Commission calculation runs nightly: `commission = won_amount × rep_pct`
  per rep
- Pay file generated monthly; Stripe Connect payout (PRD-09 Phase 5)
  or manual bank push depending on rep preference

**Exit:** First commission run reconciles 100% with VP Sales's manual
calc.

---

## 6. Verifier

`scripts/hubspot_check.py` (nightly):

- Random-sample 30 deals in `Quoted+` stages; assert each links to a
  valid `quotes.id` or `orders.id` in our DB
- Assert no orphaned deals (lacking a contact AND company)
- Assert custom properties populated on all active accounts
- Alert on any drift

---

## 7. Open questions

1. **ZoomInfo** (brief §5): keep, replace, or run 90-day parallel test
   vs. openFDA + ImportGenius? Recommend the parallel test starting
   when PRD-08 ships. Track results in `docs/zoominfo-eval.md`.
2. **Marketing email** consolidation: Brief §3 wants to kill Omnisend
   and Orderly Emails in favor of HubSpot. Confirm timing — likely
   bundled with PRD-04 Phase 5 (Shopify app decommission).
3. **Rep commission structure**: flat % or tiered by segment/product?
   Default to flat % per rep, configurable in admin.
4. **Account-rep reassignment policy**: what happens to the previous
   rep's deals when an account changes hands? Default: existing open
   deals stay with the previous rep; new deals go to the new rep.

---

## 8. Out-of-band

- HubSpot Sales Hub Professional or Enterprise (depending on workflow
  + custom properties needs)
- Per-rep seat licensing — confirm seat budget with VP Sales
- New env vars: `HUBSPOT_PRIVATE_APP_TOKEN`, `HUBSPOT_PORTAL_ID`,
  `HUBSPOT_WEBHOOK_SECRET`

---

## 9. Definition of done

- All Companies/Contacts/Deals sync bidirectionally; no manual entry
  required for normal day-to-day
- Every 1099 rep has a personal view, manager has the rollup view
- Workflows fire on schedule with zero false positives in 30 days
- Lead enrichment from openFDA + ImportGenius is producing usable
  leads
- Commission calculation reconciles with VP Sales
- Shopify plugin uninstalled, ~$0 (it's free) but the data drift
  problem is eliminated
