# Unite Medical — Damon’s staging walkthrough

Staging: https://staging.unitemedical.net

Start: https://staging.unitemedical.net/admin/testing

Account: damon@unitemedical.net. Alex will provide the private activation link separately. Set your own password, sign in, and enroll an authenticator when prompted. Store the recovery codes privately. Do not put the activation link, password or authenticator key into ChatGPT or feedback notes.

## What to test

Use **Testing & feedback** in the admin navigation. Each workflow has a link, a short task and a feedback form. Feedback saves to staging so Alex can retrieve it later.

1. **Daily work:** Find the next action, assign an owner/deadline, add a note and refresh. Does the page make your priorities obvious?
2. **Customers:** Compare three familiar accounts with Shopify. Check name, contact, default address, exemption and pricing restrictions. Record anything missing. Do not activate real customers during testing.
3. **Historical orders:** Find a familiar order in Shopify history, then filter to open orders and transactions. Compare lines and amounts with Shopify. These are historical records; they do not automatically become new shipments or charges.
4. **Products and inventory:** Find familiar stocked and sourced products, variants and barcodes. Review stock by warehouse and missing SKU exceptions. Provisional stock is not a verified physical count.
5. **Quotes:** Use a clearly marked TEST customer and create a draft. Change quantity, check the price, review freight/tax and examine what is required before issuing it. Note where the flow feels too complicated.
6. **Approvals:** Walk through an order over $10,000 and the required Damon decision. A commercial change must invalidate an earlier approval. Record provider-dependent steps that cannot be exercised yet.
7. **Warehouse:** Walk through a TEST purchase order, partial receipt, lot/expiry entry, wrong barcode and pick. Check the owner/next action when something does not match.
8. **Returns/recall:** Review quarantine and traceability, then describe the real recall scenario you want to simulate with Jacoby.

For each workflow choose **Passed**, **Bug**, **Confusing**, or **Blocked**. Include what you tried, what you expected, what happened, the record reference and the change you want. A blocked integration is not a passed workflow.

## Data supplied for this review

- 187 products and 472 variants; 12 products need new launch decisions.
- 565 customers. 398 are eligible for later activation; 167 need email reconciliation. No customer invitations are sent by this import.
- 460 supplied default addresses. Additional address history and customer metafields were not supplied.
- 2,019 historical orders / 3,307 order rows.
- 29 open orders / 66 line-item rows, selected from the full export using Shopify’s Open view.
- 2,000 transactions, not yet reconciled against a financial control total.
- 1,416 inventory source rows from three locations. Existing launch policy keeps Ohio excluded, CATO opening at zero and Unite quantities provisional until physical reconciliation.

The final import/readback report determines whether these prepared counts actually reached staging. Account-specific pricing remains held for all 565 customers. Do not approve a production cutover from file counts alone.

## Scope of this environment

This handoff is for staging acceptance. The customer-facing Shopify site and domain cutover remain outside this release. Payment, carrier and messaging provider credentials are not configured on the dedicated staging project; provider-dependent workflows need sandbox configuration and acceptance before they can be marked passed. Scheduled outbox and webhook processing is skipped on staging.

Some older screens still contain local-only actions. Confirm persistence by refreshing or signing in on another device, and flag any action that appears successful but does not save.

## Prompt to paste into ChatGPT

> Help me test Unite Medical staging. Work through one workflow at a time: customers, historical orders, products/inventory, quotes, approvals, receiving/picking, returns/recall. Ask what I expected and what actually happened. Separate bugs, confusing UX, missing data, unavailable integrations and business decisions. Turn my notes into: workflow, steps, expected result, actual result, impact, suggested fix. Do not mark a workflow passed without evidence. Do not include passwords, activation links, authenticator keys or customer/payment details. I will paste the resulting notes into the staging feedback page.

Send Alex the three changes that would make daily work simplest, then identify which remaining items prevent your go/no-go decision.
