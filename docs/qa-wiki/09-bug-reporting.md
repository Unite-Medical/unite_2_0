# 9. Bug reporting & sign-off

## Where to log

1. **In-app (preferred for staff testers):** `/admin/testing` on staging (Admin only; endpoint `api/admin/testing.js` stores rows in `staging_feedback` and refuses outside `UNITE_ENVIRONMENT=staging`). Its checklist IDs (`daily`, `quote`, `receive`, …) match the brackets in [Staff scripts](06-staff-workflows.md).
2. **GitHub issues** on `Unite-Medical/unite_2_0` for anything a developer must fix — label `qa`, plus `P0`–`P3`. No customer data or credentials in issues (public repo).

## Bug template

```
Title: [ROLE] [Test ID] short summary            e.g. [finance] FIN-02 duplicate payment reference accepted
Env / URL:    staging.unitemedical.net/admin/finance
Account:      qa+finance@ (role finance, MFA)    ← never the password
Browser/device: Chrome 131 macOS / iPhone 15 Safari
Steps:        1. … 2. … 3. …
Expected:     …
Actual:       …
Evidence:     screenshot/video (blur customer data)
Side effects: e.g. "created QBO invoice #…", "sent email to qa+…"
```

## Severity

| Sev | Meaning | Examples | Launch? |
|---|---|---|---|
| P0 | Data leak, security, money/books wrong | Customer sees another org's invoice; sales approves own margin exception; duplicate QBO invoice | Blocks |
| P1 | Core workflow broken for a role | Can't check out; warehouse can't receive; finance can't record payment | Blocks |
| P2 | Workaround exists / confusing UX | Wrong label, missing filter, layout break on mobile | Fix or accept |
| P3 | Cosmetic / copy | Typos, spacing | Post-launch OK |

## Sign-off sheet

| Area | Pages | Tester | Date | Result | Open P0/P1 |
|---|---|---|---|---|---|
| Public site | [04](04-public-site.md) | | | | |
| Customer (owner/buyer/viewer/pending) | [05](05-customer-and-distributor.md) | | | | |
| Distributor | [05](05-customer-and-distributor.md#distributor--3pl-portal-distributor) | | | | |
| Admin — Damon | [06 §6.3](06-staff-workflows.md#63-admin--damon-admin-mfa-approval-margin-access-history) | | | | |
| Sales — Jacobe (+ sales mgr, CS) | [06 §6.2](06-staff-workflows.md#62-sales--jacobe-sales-customer-inquiries-quote-delivery) | | | | |
| Warehouse — Darren | [06 §6.4](06-staff-workflows.md) | | | | |
| Finance — Ashley | [06 §6.5](06-staff-workflows.md) | | | | |
| WellLink | [06 §6.6](06-staff-workflows.md) | | | | |
| Role boundaries | [02](02-roles-and-permissions.md#role-boundary-test-checklist) | | | | |
| Go-live gates | [08](08-go-live-gates.md) | | | | |
