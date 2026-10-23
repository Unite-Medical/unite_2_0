# Account recovery launch gate

This release adds recovery code paths. It does not authorize operating a reset on a real account. Staff MFA requirements and the customer/distributor MFA exclusion remain unchanged. Password reset never deletes an authenticator or bypasses MFA.

## User flows

- **Forgot password:** `/login?forgot=1`. Active and unknown addresses receive the same response. Recovery email links last 30 minutes. A new password must contain 15–256 Unicode code points and cannot be all whitespace. Tokens are random 256-bit values, stored hashed and bound to the account revision and email. Completion consumes the token atomically, changes the password, increments the session revision, audits the change and queues a security notice. Prior sessions and outstanding links no longer authorize access. Staff must still verify their enrolled factor at the next login.
- **Replace an available authenticator:** Account menu → Account security → enter current password and a fresh authenticator code. A code just used to sign in cannot be reused; wait for the next code. The new setup lasts five minutes. Verify the new authenticator and confirm invalidating old recovery codes and sessions. The old authenticator remains active until this completes. Cancel/expiry does not remove the old factor. Completion replaces the sealed secret and hashed recovery codes atomically, revokes prior sessions/challenges, audits and queues a notice. No signed-in session is granted by replacement.
- **Recover a lost authenticator:** A different administrator opens Account security → Staff account recovery. They choose one active, enrolled staff account in their organization, type its registered email, document an independently verified identity check, confirm consequences and supply their own password and fresh authenticator code. No recovery code is accepted for this step-up. The server queues a 30-minute link to the target's existing registered email; no token or QR is returned to the administrator. The owner opens the link, verifies their existing password and verifies their own new authenticator. They explicitly confirm replacement. Only then are old MFA/recovery credentials and sessions revoked. Changes to either the target's revision/email/factor or the approving administrator's revision/authority invalidate the pending flow.
- A user with a valid recovery code may use it for normal MFA sign-in. That alone does **not** authorize authenticator replacement. They must use the available-factor path or independently verified admin assistance.
- A sole administrator who loses both factor and recovery codes cannot self-approve lost-factor recovery. Before launch, the owner must verify an appropriate second existing administrator or establish a separately reviewed operational recovery procedure. This feature does not provision or grant another administrator.

## Delivery and privacy

All security mail uses a dedicated encrypted database outbox, `um_auth_mail`, and Resend's stable per-message idempotency key. The delivery worker is `/api/auth/security-notices`, protected by `CRON_SECRET`, scheduled every five minutes. Claims expire after three minutes; retries are bounded to five attempts, with five-minute backoff and no retry after the message expiry. Sender acceptance is recorded separately from any claim of inbox delivery. Failed/expired counts appear in Staff account recovery; the Integrations launch controls show configuration presence only. Real provider acceptance and receipt must be demonstrated before launch.

Required configuration, set independently in each environment:

- `UNITE_AUTH_ORIGIN`: exact trusted HTTPS origin. Never derived from incoming Host/forwarded headers. No production fallback to staging. The staging project uses `https://staging.unitemedical.net`.
- `UNITE_AUTH_FROM`: an explicitly verified Resend sender. No inferred sender default.
- Existing `RESEND_API_KEY`, `MFA_ENCRYPTION_KEY` and `CRON_SECRET`. The existing MFA encryption key also seals mail payloads; never print or export it. A key change needs its own migration/recovery plan.

No delivery provider is contacted by a reset request; it queues mail. Delivery waits for the protected worker. No QR service is used. Tokens travel only in the necessary emailed fragment and JSON POSTs; fragments are removed before rendering, kept in memory and never persisted to browser storage. Recovery pages disable analytics and use `no-referrer` and `no-store` headers. GET/email-scanner visits do not consume tokens. Refreshing loses the in-memory token; reopen the original unused email link while it is valid. Tokens, setup keys, QR content, passwords, verification codes and recovery codes must never be logged or included in screenshots; test artifacts use synthetic values only.

## Schema and rollout

The release adds private `um_auth_mail` and `um_mfa_replacements` tables and an `email` identity binding to `um_password_resets`. Existing password-reset links without an email binding fail closed; their owners request a new link. The tables are not generic synchronized `um_rows` tables. Only safe audit events are stored in the shared audit log. No role grants or active user credentials change during deployment.

Deploy only after exact commit/environment approval, verified sender/origin configuration and review of the new mail cron. Retain the previous application deployment. A code rollback does not restore credentials changed after rollout; never roll back security tables to restore old factors or sessions. Stop new recovery requests/delivery through an explicitly approved operational plan if necessary; preserve audits.

## Acceptance

Local validation must include real isolated PostgreSQL SQL, not only implementation-shaped mocks: neutral requests, CSRF rejection, expiry/replay, concurrent token redemption, revision/email binding, factor presence, step-up denial, old-factor retention on cancellation, admin role/organization/self-target denial, owner password verification, new-factor confirmation, old-factor rejection, fresh normal MFA login, new recovery hashes, session revocation and delivery retry/idempotency.

Before calling recovery launch-ready, additionally prove the exact deployed build, sender acceptance and receipt of one controlled reset email, password reset plus normal staff MFA sign-in, available-factor replacement, and one approved lost-device handback. Each real credential/MFA action requires the owner's action-time confirmation or secure handoff. Do not operate on a staff account merely to demonstrate the UI. Keep customer order and accounting integration acceptance separate.
