# Advanced BI and assistant actions — September 26, 2026

Target: https://staging.unitemedical.net, Vercel project `unite-2-0-staging` (`prj_PL5BOZooLBtLiPQlrn34SyC0MRKS`). The Vercel Production target is this staging project, not the Shopify storefront.

## Delivered implementation

- Admin-only `/admin/advanced-bi` navigation, date and accounting-basis filters, saved report history, CSV download, browser print, accounting statements, Shopify monthly/customer views and a link to analyze the exact saved report in a fresh internal Unite chat.
- Reports load QuickBooks ProfitAndLoss, BalanceSheet, AgedReceivables and AgedPayables using encrypted server-side OAuth credentials. Missing authorization produces an explicit unavailable state, never zero profit. Individual report failures are retained.
- Shopify uses authenticated fixed GraphQL queries, checks historical scopes, follows pagination, detects incomplete retrieval, separates currencies and excludes test/cancelled orders. The selected date cohort is UTC creation time; amounts represent current order values, not period-recognized accounting revenue. Cohort lifetime refunds are never subtracted twice or labeled period refunds. No cross-system totals are added together.
- Saved evidence is stored in `business_reports`, omitted from generic browser raw sync. Read/write report endpoints independently require a current admin session. Report generation also checks the exact configured origin.
- Assistant `read_business_report` reads the saved evidence or generates a fresh report. Existing branded document tools can produce a narrative report in PDF, Word, Excel, PowerPoint or CSV. Older provider conversations retain their original tools; the Analyze link starts a new conversation.
- Existing reviewed notes/tags/pricing actions remain available. New `prepare_business_action` supports local sales drafts for invoice preparation, draft replenishment purchase orders from approved vendor/reorder settings, and posting an existing physically recorded inventory count. It uses the same pricing, inventory and traceability rules as the operational UI. Changes expire after 15 minutes, recheck current data/authority, and commit the changes, receipt and audit in one atomic transaction after a person clicks Apply. No external financial action is performed by merely asking the assistant.

## Live read verification

September 1–26 initial report: `712ab92c-a45f-40c2-bb2a-3f81ae81e1ac`. Shopify live read returned `ready`, 63 fetched orders, with `read_all_orders` access. This count is before exclusion of test/cancelled orders; the saved report displays eligible counts. QBO returned unavailable because no company is connected. The existing accounting-job queue was empty at verification.

## Intuit setup still required

User confirmed there is no Intuit Developer app and requested setup help. Opened Intuit Developer sign-in in Dia and asked the user to sign in, complete verification and accept the developer terms personally. No app or credentials have been created yet.

Proposed app name: **Unite Medical BI & Operations**.

- Product: QuickBooks Online Accounting.
- Scope: `com.intuit.quickbooks.accounting`.
- Exact production redirect URI: `https://staging.unitemedical.net/api/auth/qbo/callback`.
- Connect route: `https://staging.unitemedical.net/api/auth/qbo/connect` (signed-in Unite admin).
- Vercel server variables still missing: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`.
- `QBO_TOKEN_ENCRYPTION_KEY`, `QBO_ENVIRONMENT` and the database are already configured. Verify the environment is production for the real migrated company. A staging website can use live QBO credentials; Intuit sandbox credentials cannot read the migrated live company.
- Complete Intuit's actual production assessment honestly; do not invent security practices, legal terms or business details. The owner may need to approve terms and access grants.
- Store credentials as sensitive server variables; never put them in VITE variables, source files or chat.
- Before company authorization, recheck `accounting_jobs`. An existing outbox cron can post queued mapped invoices when credentials become available. The queue was empty during this task, but later order activity could change that.
- After authorization, verify CompanyInfo identifies the intended migrated company and reconcile the first reports with the migration checks.

## External writes and remaining scope

The Shopify assistant app is installed with read scopes. Direct Shopify notes/tags/pricing/inventory writes have NOT been activated. New assistant actions save Unite workspace records; they do not write through to Shopify. Direct QuickBooks writes also remain unavailable until app setup/company authorization, record matching and the accounting workflow are verified. Creating a local sales draft is not posting a QuickBooks invoice. Draft purchase orders are not emailed or sent to suppliers by the assistant tool.

Cross-system transaction matching, automated Shopify-to-QBO bookkeeping, SKU cost/margin attribution, unattended scheduling and direct provider mutation tools are not implemented by this change. The user requested all write categories; preserve this as outstanding work rather than claiming it is fully enabled.

## Validation

- Full suite: 537 passing, 0 failures.
- Focused rerun after input-size/CSV hardening: 18 passing.
- Targeted lint passed; local and remote builds passed through source compilation and live Shopify read verification.
- Local synthetic browser review confirmed layout and keyboard activation of the accounting statement. Synthetic preview data was not uploaded as real business records. Real signed-in staging BI/assistant review remains to be verified.
- Existing unrelated whitespace warning in `src/components/shared/HomepageJourney.css` was not changed.

## Final deployment

READY: `dpl_D8cvuWJXjnkciANmfL39tuiydyha`, `https://unite-2-0-staging-eq7dg35k9-alexs-projects-38d5c32d.vercel.app`, aliased to staging.unitemedical.net. Initial report was created during verified deployment `dpl_CWhkPsxkpCpe4RP9SifapPgYp8FS` and remains saved in the staging database. Subsequent deployments did not repeat initialization.

Final HTTP checks: BI data endpoint rejects anonymous requests with 401; report route returns the application with 200. Browser verified redirect to login preserving the saved report destination. Synthetic local browser checks also verified Customers, Sources & definitions and the corrected dark theme. Real signed-in staging assistant execution remains unverified while awaiting user access. Local preview server stopped; temporary environment download removed. The Intuit sign-in page remains open in Dia for the user.
