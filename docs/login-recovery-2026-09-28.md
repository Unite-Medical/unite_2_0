# Navigation and account recovery — 28 September 2026

Unite staging now uses rounded navigation controls aligned with the landing-page design. Search and menu have 44px touch targets. Login supports password-manager field names and an optional 30-day session. Staff still complete MFA; the signed session has a fixed 30-day expiry, preserved across bootstrap and role switching. Sign-out and password changes invalidate it through the existing profile revision check.

Forgot-password now sends a 30-minute, single-use link through Resend. Tokens are stored as SHA-256 digests in dedicated server-only tables. Atomic redemption updates the password hash and increments the session revision. Other reset links and old sessions become invalid. Requests are throttled by email and IP and use generic account responses. Recovery tokens travel in the URL fragment, which is removed when the form opens.

Validation: 590 tests passed, 3 skipped; changed-file ESLint passed; build and 155-route prerender passed. The isolated PGlite test exercised the actual PostgreSQL SQL for concurrent single use, expiry, inactive accounts, old-session/link invalidation, and atomic rate limits. Live staging API checks returned 400 for malformed email, 200 generic for an unknown account, and 400 for an invalid reset token. No existing user's password was changed during testing.

For the database regression, install @electric-sql/pglite in a temporary QA directory, then run `PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/test_password_recovery_db.mjs`.

TJS uses a separate Supabase Auth account system. Its existing recovery handler was retained from current main. This release adds autofill names, safe dashboard return URLs, reopening a valid session, network-error recovery, global sign-out after password reset, and preservation of refreshed cookies through middleware redirects. A disposable test account completed the real Supabase recovery/password-change cycle; old-password and link-reuse rejection passed, and the account was removed. A fresh recovery email was accepted for Damon's verified TJS admin email, damon@unitemedical.net. The password itself remains for Damon to choose.
