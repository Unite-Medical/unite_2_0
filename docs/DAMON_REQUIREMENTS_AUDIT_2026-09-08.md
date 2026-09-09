# Damon requirements audit — September 8, 2026

## Answer

Updated after the implementation pass: many previously missing controls now have code and tests. Not every transcript requirement is operationally complete. See [the current implementation handoff](IMPLEMENTATION_HANDOFF_2026-09-09.md) for exact configuration, limitations and acceptance work. This is a grouped code-evidence audit, not a sentence-by-sentence certification of every recording. The recovered decision log also includes later decisions not present in the seven available recordings. Deployment configuration and external service behavior have not been accepted on staging.

Sources: the recovered combined transcripts in `../Walkthrough transcripts/ALL_WALKTHROUGH_TRANSCRIPTS.md`, `docs/DAMON_WALKTHROUGH_DECISIONS.md`, the August launch handoff summarized in `../UNITE_RECOVERY_AND_GAPS.md`, and current source/tests in this checkout. Later written launch decisions supersede earlier conflicting policies, particularly certificate gating and barcode priority.

## Requirement-to-code evidence

“Code + tests” means implementation evidence exists; authenticated staging acceptance remains required. “Partial” identifies a known unfinished dependency or workflow. “Not found” means no matching implementation was identified in the inspected paths, not proof about an external service or separate repository.

| Requirement | Assessment | Evidence / remaining work |
|---|---|---|
| No prices/cart/orders for unapproved accounts; server identity and customer scope | Code + tests | `src/lib/accessPolicy.js`, `api/_lib/commerce.js`, `api/_lib/auth.js`; access, boundary and server commerce tests. Staging role/isolation checks needed. |
| Lightweight company verification and mixed stocked/sourced Quick Quote | Partial | `api/quotes/quick.js`, `api/sourcing/request.js`, server quick-quote/sourcing tests. Does not prove the full intent-led funnel, delivered price or conversion telemetry. |
| Intent/category funnel and named drop-off events/report | Implemented foundation; attribution acceptance remains | Intent/category controls, anonymous event API, source/category/stage reports. Browser-reported counts and incomplete milestone attribution are called out in the handoff. |
| Approved customer-specific/default pricing | Partial; launch data blocker | Authoritative price resolution exists in `api/_lib/commerce.js`. Recovered migration holds all 556 accounts pending pricing evidence. |
| Actual shipping options/package data/handling policy | Implemented for verified single parcels; broader shipping remains | Server-bound rates, configured origin, actual carton data, handling and audited checkout/quote delivery reviews. Multi-carton/LTL end-to-end workflow remains unaccepted. |
| Tax treatment | Server estimate and invoice checks implemented; reconciliation remains | Preserved exemption or Stripe Tax with product tax codes; no default zero-tax placement. Review taxable/exempt examples and tax reporting with QBO on staging. |
| New orders over $10,000 require Damon approval | Code + tests; account setup/staging remains | Exact designated account damon@unitemedical.net; commercial fingerprint, approval API/UI, payment resume, release/label/handoff/linked-PO gates. Further threshold scope remains an explicit open decision. |
| ACH/prepaid vs approved terms; payment before release | Code + tests; staging acceptance remains | 308 tests and 117 orchestration checks pass. Stripe invoice line association and total verification added. Card fee policy remains pending. |
| Supplier offer normalization, history, margin/privacy and reviewed PO sending | Code + tests | Sourcing workflow, commercial policy, vendor-sheet and vendor-PO tests. Verify the full external send/acknowledge sequence and low-confidence extraction hold on staging. |
| PO-only receiving and shortage/AP reconciliation | Code + tests | Receiving checkpoint, server WMS, vendor bills tests and receiving UI. Real partial-receipt/finance walkthrough remains. |
| Backorders, separate fulfillment batches/invoices and honest ETAs | Code + tests | `src/lib/orderBatches.js`, batch/receiving tests; full staged partial-order acceptance still required. |
| Lot/expiry/FEFO/quarantine and scan hard blocks | Code + tests | `src/lib/wms/lots.js`, picking/shipping, `api/_lib/pickScanning.js`, WMS tests. Physical opening stock and hardware acceptance are separate. |
| RMA quarantine, inspection and original-rail refund controls | Code + tests | `api/returns/action.js`, returns tests. Exercise actual staging sequence and payment evidence. |
| Distributor ownership, blind shipping, pickup and settlement | Code + tests | Server distributor allocation/order/pickup/settlement tests. Validate documents, real contacts, pickup alerts and paid settlement evidence. |
| One exception queue with owner, due time, next action and escalation | Code + tests; operational acceptance remains | AdminDesk / operations API combines workflow exceptions, assignments, due times, next actions, source revisions and Damon escalation. |
| Account-owner follow-ups and missed reorder detection | Code + tests; configuration and acceptance remain | Observed-cadence detection, hourly owner tasks and idempotent Customer.io digests. Account-owner data and notification template/configuration required. |
| MFA for admin/finance/managers and composable roles | Code + tests; enrollment/role walkthrough remains | TOTP, sealed secrets, replay/attempt controls, recovery codes, role-grant audit/revocation, active-role switching and scoped work view. No real accounts enrolled here. |
| Tax upload, OCR/vision extraction, expiry, review and evidence | Code + tests; scanner/extraction configuration remains | Private versioned uploads, ClamAV adapter, extraction with review flags, clean download, expiration and atomic review audit. Preserved exemptions are not revoked for missing paperwork. |
| Duplicate-organization suggestions and audited merge | Code + tests; database acceptance remains | Explicit preview and confirmation, policy/conflict checks, short write-lock transaction, reference/snapshot validation, before-images and profile revocation. Distributor merges blocked. |
| Retention and legal hold | Code + tests; policy acceptance remains | Three-year minimum, class/record/global legal holds, generic deletion protection and retained merge audits. No automatic purge. |
| Recall handling | Partial / decision open | Lot blocking and genealogy exist. They do not replace the required simulation of Damon's existing recall workflow and Jacoby ownership. |
| Integration retries, idempotency, failure visibility | Expanded; provider acceptance remains | Failed/unknown outbox and webhook work enters the desk; new configuration controls appear in Integrations. Existing adapters and live recovery still need staging scenarios. |
| Activation, history and legacy migration | Partial | New UI connects existing foundations; CSV review is local only. Data import/readback, pricing, six legacy decisions/two holds and live remaining-quantity checks remain. |
| Cutover and operating simulations | Open | Decision question 16 remains explicitly open. No staging/production certification in this pass. |

## Highest-value improvements for Damon

1. **One “Needs my decision” desk.** Show only approvals, overdue escalations and meaningful customer/cash risks. Each card: customer/order, amount or impact, reason blocked, owner, deadline, evidence, recommended next action. Specialists own ordinary work; Damon receives unowned/overdue/escalated work. Sending an email does not resolve it.
2. **One order workspace.** Customer promise, payment evidence, sourced lines, PO, receipts, lots, shipment, invoice and communications on one timeline. One appropriate next action, with a visible block reason; no hunting across modules or manual status imitation.
3. **Protect margin and cash.** Complete server-authoritative freight/tax/pricing, enforce the over-$10,000 gate, expose overdue cash and pending supplier acknowledgments, and surface below-policy exceptions before commitment.
4. **Catch customer silence.** Establish each account's reorder pattern, identify a missed expected reorder, assign the account owner a follow-up with context, and escalate overdue actions. Keep HubSpot as current sales workflow, consistent with recording 6; use existing Customer.io communications rather than creating another competing CRM.
5. **Make warehouse screens task-specific.** Receive → scan PO/items/lot/expiry → resolve discrepancy; pick → scan location/item/lot/quantity → handoff. Persist clear progress, explain blocks, and show customer impact of a shortage. Retain the policy that barcode completion is not a blanket launch blocker.

Measure improvement with time to resolve exceptions, overdue unowned work, quote response time, missed-reorder follow-up, order handling touches and reconciliation errors. Do not claim hours saved before measuring a baseline.

## This week’s release sequence

1. Reconcile tonight’s Shopify exports, approved customer prices and physical opening stock.
2. Configure the added controls on staging and exercise the end-to-end scenarios listed in the implementation handoff.
3. Resolve remaining shipping, accounting, recall and policy decisions; record owners and evidence.
4. Give Damon a go/no-go review with reconciliation counts, unresolved holds and rollback ownership. Do not infer production readiness from local tests.

Latest full verification: 308 unit tests passed, lint/build passed, and 117 orchestration checks passed. Local browser checks include unavailable-service behavior and a 390-pixel checkout-review layout without horizontal overflow. No deployment, live account enrollment, customer notification or production mutation was performed.
