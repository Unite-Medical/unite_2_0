# 3. Accounts & sign-in

**No passwords, MFA setup keys, QR codes or recovery codes go in this file, the repo, chat, or screenshots.** Share them only through the Devin secret store / 1Password.

## Known staff identities (staging)

| Person | Email | Role(s) | MFA | Status |
|---|---|---|---|---|
| Damon | `damon@unitemedical.net` | `admin` | Required | Historical identity verified; fresh sign-in pending. Activation link can be issued by `api/internal/staging-setup.js` (`damon_activation`, needs `STAGING_SETUP_TOKEN`) |
| Jacobe | `jacobe@unitemedical.net` | `sales` | No | Fresh sign-in pending |
| Darren | `darren@unitemedical.net` | `warehouse_operator` | No (Yes if `warehouse_manager`) | Fresh sign-in pending |
| Ashley | `accounting@unitemedical.net` | `finance` | Required | Fresh sign-in pending |

The June demo logins in `docs/UNITE-PLATFORM-MAP.md` (`damon@…/admin`, `sarah@atlanta-surgical.com/demo`, `kareem@holloway.com/demo`) came from the old in-browser demo DB. They are **unverified** on the Postgres-backed staging — don't rely on them.

## Getting QA accounts

Staff accounts **cannot be created from the UI**: `/admin/team` (`api/admin/roles.js`) only changes roles on an *existing* profile. Customer accounts can be self-registered (`/register`) and then approved by admin.

Recommended: one dedicated, clearly-labelled QA account per role so real people's accounts and audit trails aren't used for testing.

| QA account (suggested) | Role | How to create |
|---|---|---|
| `qa+admin@unitemedical.net` | `admin` (MFA) | DB-provision as pending + activation link; also gives the needed **second admin** |
| `qa+sales@…` | `sales` | DB-provision, or create profile then grant at `/admin/team` |
| `qa+salesmgr@…` | `sales_manager` (MFA) | same |
| `qa+cs@…` | `customer_service` | same |
| `qa+wh@…` / `qa+whmgr@…` | `warehouse_operator` / `warehouse_manager` (MFA) | same |
| `qa+finance@…` | `finance` (MFA) | same |
| `qa+sourcing@…` | `sourcing` | same |
| `qa+multi@…` | `sales` + `finance` | tests role switcher + MFA on switch |
| `qa+cust-owner@`, `qa+cust-buyer@`, `qa+cust-viewer@` | customer org (`owner/buyer/viewer`) in an org named **"TEST – QA Hospital"** | `/register` → admin approves → owner invites the other two |
| `qa+cust-pending@` | unapproved customer | `/register`, leave unapproved |
| `qa+dist@` | `distributor` in **"TEST – QA Distributor"** with a small consigned pool | Admin creates org + consignment |

All `qa+…` addresses must land in one mailbox the testers (and Devin) can read.

## Sign-in flows

| Flow | Where | Notes |
|---|---|---|
| Sign in | `/login` | Email + password; optional "remember me" (up to 30 days). Redirects back to `?next=` |
| Forgot / reset password | `/login?forgot` → emailed reset link | Generic response whether or not the email exists; single-use, expiring token (`api/auth/password-reset.js`) |
| Activation (invited / migrated) | `/activate?token=…` | Set password once; token single-use |
| MFA enrollment | First sign-in for MFA roles | Scan authenticator setup, enter code, **save the 8 recovery codes offline** |
| MFA sign-in | After password | 6-digit TOTP or a one-time recovery code |
| Lost phone | — | Appears not to be self-service on staging; the authenticator-replacement / lost-factor recovery/replacement work is on unmerged branch `codex/unite-account-recovery-2026-10-23` ([Gate A2](08-go-live-gates.md)) |
| Role switch | Account menu | Only granted roles; MFA roles require MFA in that session |
| Sign out | Account menu | Ends server session |

## Test-session hygiene

- One role per browser profile (or private window) to avoid cookie bleed.
- Note the account + role + browser at the top of every bug report.
- Never test on a real customer's record — only orgs/records named **TEST**.
