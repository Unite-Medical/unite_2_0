# Unite implementation handoff — September 9, 2026

Changes are local in `unite_launch_review`, branch `review/launch-simplification`. They have not been deployed or accepted on authenticated staging. The original recovered worktree is untouched.

Damon’s designated approver account is **damon@unitemedical.net**, supplied by Alex. The code requires that exact email on an active, server-authenticated administrator session. This does not create the account, grant it administrator access, enroll its authenticator, or send an invitation.

## Implemented in this pass

- Simplified navigation, customer dashboard, login, checkout and order list; launch preparation keeps Shopify file checks, activation and legacy-order review in three steps.
- An operations desk combines approvals, payment, overdue invoices, sourcing, backorders, pickup, delivery, returns, document, account, supplier and integration exceptions. Owners, deadlines, next actions and notes are saved with revision checks. Direct Damon assignments and escalations appear in “Needs Damon.” An order timeline brings linked records into the order detail.
- New orders over $10,000 require a recorded Damon decision. Commercial changes invalidate approval. The gate protects payment setup, inventory release, labels, handoff and sending linked supplier POs, including retry. Approved held orders have a payment-resume action. The separate threshold scope for refunds/write-offs remains undecided.
- Privileged sign-in requires authenticator MFA, with encrypted secrets, replay protection, bounded attempts and single-use recovery codes. Staff role grants are audited, revoke old sessions and support switching among explicitly granted roles. A scoped staff task view does not expose internal price/cost records.
- Checkout requires a current server-bound shipping/tax estimate. Approved exact-quantity carton data powers ShipStation rates; preserved exemptions remain intact, otherwise Stripe Tax requires product tax codes. The recorded origin is reused for labels. No guessed weight, default $42 freight or automatic zero-tax order submission. Missing package/provider evidence produces an administrative checkout review. Manual reviewed estimates expire after 24 hours.
- Quotes require reviewed destination, carton, freight and tax before secure issue/acceptance. Review binds the individual line prices/quantities, invalidates earlier acceptance links and requires reissue. Unreviewed quick quotes remain merchandise estimates. Payment invoices explicitly include merchandise, freight and tax, exclude unrelated pending items, and are not sent if the provider total differs.
- Private certificate upload is idempotent and preserves previous versions. Scan/extraction, clean-file download, reviewer decisions, expiration flags and audit evidence have admin controls. Review never automatically changes the preserved account exemption. A separate ClamAV adapter is included; a functioning scanner must be deployed/configured before scans can succeed.
- Duplicate company suggestions require explicit review, compatible commercial/tax policies, a preview fingerprint and typed destination. Merge locks/checks the reviewed reference set, retains before-images, preserves original private-document ownership and revokes moved users’ sessions. Distributor ownership merges are blocked for specialist review.
- Three-year minimum retention and legal holds are represented. Generic sync cannot delete protected operational classes; active global/record holds also prevent generic deletion. No automatic purge has been enabled.
- Observed missed-reorder cadence creates owner follow-up tasks. An hourly job refreshes exceptions and can enqueue idempotent owner/Damon digests through the existing Customer.io outbox when configured. Sending a digest does not resolve the underlying exception.
- Intent/category navigation and an anonymous quote funnel record selected actions. Reports show intent, source, category, stage and last observed stage. Counts are browser-reported and abandonment is inferred; they are not a definitive accounting conversion report.
- Snapshot exports reject stuck cursors and detected nested truncation. They do not silently import partial data. Very large nested Shopify connections still require a paginated export procedure.
- Local Vite now defaults to a local API target instead of production. A staging target must be explicitly configured.

## Configuration needed before staging acceptance

| Control | Required configuration / data |
|---|---|
| Durable server and auth | `DATABASE_URL`, `SESSION_SECRET`, existing service credentials; active profiles and correct role grants. Never use sample accounts as staging evidence. |
| MFA | `MFA_ENCRYPTION_KEY`: a securely generated 32-byte key encoded as 64 hexadecimal characters. Store/back up in the secret manager. Key loss prevents decrypting enrolled secrets. First password login enrolls an authenticator; save the recovery codes privately. The server creates two dedicated MFA tables if absent. Test enrollment, replay, recovery and revocation on staging. |
| Shipping | `SHIPSTATION_API_KEY`, `SHIPSTATION_API_SECRET`; `UNITE_SHIP_FROM_STREET`, `UNITE_SHIP_FROM_CITY`, `UNITE_SHIP_FROM_STATE`, `UNITE_SHIP_FROM_ZIP`; optional country and `UNITE_RATE_CARRIERS`. Approved exact-quantity `shipping_packages` records contain carton dimensions in inches and weight in pounds. Handling defaults to the recorded $15 policy, with an organization-specific override. |
| Tax/payment | `STRIPE_SECRET_KEY`, webhook secret, product `stripe_tax_code` data, verified exemption flags and approved payment grants. Reconcile tax reporting/transactions with QBO before operational acceptance. Card payments stay unavailable pending the fee-policy decision. |
| Documents | Private `BLOB_READ_WRITE_TOKEN`; HTTPS `DOCUMENT_SCAN_URL` and matching `DOCUMENT_SCAN_TOKEN`; `ANTHROPIC_API_KEY` and an explicitly selected `DOCUMENT_EXTRACTION_MODEL`. Source bytes leave private storage only for the configured processing services. Confirm service/account approvals before staging upload. |
| Scanner adapter | `node scripts/document-scanner.mjs`, behind an HTTPS reverse proxy on the scanning host. Install ClamAV and maintain signatures with freshclam; optional `CLAMSCAN_BIN` and `SCANNER_PORT`. Adapter listens on loopback, accepts authenticated POST `/scan`, bounds files/time/concurrency, rejects stale signatures and errors, and does not log document content. This adapter has mocked boundary tests, not a real-engine acceptance run on this Mac. |
| Follow-up tasks/digests | `CRON_SECRET`, `OPERATIONS_DIGEST_TEMPLATE_ID`, existing Customer.io credentials/template and correct account-owner email data. A deployment activates the added hourly cron, which may enqueue messages; no cron or customer messages were run here. |

Configuration presence is displayed on Integrations, but is not evidence of a successful provider call.

## What still prevents an “everything is live” claim

1. **Launch data:** reconcile tonight’s original products, customers, orders and all-location inventory exports. The recovered checkpoint has 556 pricing-held accounts, 449 provisional Unite pools, zero CATO opening stock and Ohio excluded. Confirm physical owner/bin/lot/expiry counts, commitments and incoming inventory. Do not treat old figures as a fresh count.
2. **Legacy decisions:** recovered disposition is 14 transfer / 4 archive / 1 cancel / 2 hold / 6 undecided. Recheck remaining quantities directly before staging transfer; resolve customer email and price evidence. Local CSV review does not import or certify freshness.
3. **Shipping and payments:** the new automated booking path supports one verified parcel. Multi-carton and LTL end-to-end booking/label/handoff, mixed sourced-order delivery promises, tax transaction/reporting reconciliation and card-fee policy require completion and acceptance. Manual carton review is not certification of those workflows.
4. **Roles and workflows:** composable authorization and the scoped task view are implemented; the entire sales/customer-service/sourcing workflow still needs walkthrough testing in each role. Existing browser-only actions in older modules must not be counted as durable API success merely because they change a local view.
5. **Recall and policy decisions:** inspect/simulate Damon’s current recall system with Jacoby before replacing routing/disposition. Decide the additional payment/refund/write-off approval thresholds. Question 16 remains an operational scenario exercise, not a checkbox inferred from tests. Barcode completeness/MegaPre duplicate SKU remain explicitly post-launch work from the recovered handoff.
6. **Funnel completeness:** several named milestones are emitted and reports exist; certificate validation attribution, voluntary identity linkage, complete server-reconciled conversion attribution and all drop-off reasons are not yet certified end to end. Do not infer consent or customer identity from anonymous browsing.
7. **Staging and release:** exercise real representative stocked, sourced, terms/prepaid, partial receipt/backorder, FEFO, handoff, return/refund, distributor/blind pickup, outage/retry and recall scenarios. Confirm notification recipients/templates, QBO reconciliation, backup/rollback ownership and Damon’s go/no-go decision. No production deployment or live financial/data mutation was performed here.

## Verification

- `npm run lint`: passed.
- `npm test`: 308 tests passed at the latest recorded full run.
- `npm run build`: passed; 122 routes prerendered. Existing large-bundle warnings remain.
- `node scripts/verify_orchestration.mjs`: 117 passed, 0 failed. The original failure came from a stocked-product fixture that no longer had sellable stock and an expired FEFO fixture. Fixtures now isolate stock and use future relative expirations; fulfillment policy was not weakened to pass.
- Browser: local launch, exception desk, document review and quote list checked; checkout review at 390px had no horizontal overflow, and the desktop viewport was restored. API-dependent screens correctly showed unavailable service states with the local API disconnected. No real MFA enrollment, scanner run, database transaction or provider delivery was exercised.
- The tests cover pure decisions, mocks and orchestration; they do not certify new SQL transactions against a live Postgres instance or external service behavior.

Primary implementation references: [ShipStation rates](https://www.shipstation.com/docs/api/shipments/get-rates/), [Stripe Tax calculations](https://docs.stripe.com/api/tax/calculations/create), [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238), [ClamAV scanning](https://docs.clamav.net/manual/Usage/Scanning.html), [ClamAV return codes](https://github.com/Cisco-Talos/clamav/blob/main/docs/man/clamscan.1.in).
