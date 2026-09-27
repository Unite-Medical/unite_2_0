# Restore Robotics connection handoff

Updated September 24, 2026. These changes target staging.unitemedical.net; the Shopify storefront is unchanged.

## Public inquiries

`POST /api/public/inquiry` accepts `kind: "robotics"`. Submissions are stored privately with an assigned review task before any external delivery. Robotics ownership is `UNITE_JACOBE_EMAIL`; the notification recipient is fixed to support@unitemedical.net. The public response confirms storage, not email delivery or HubSpot success.

Staff can review all fields, update status and notes, and inspect delivery/HubSpot status at `/admin/inquiries` using the Restore Robotics filter. Administrators can retry HubSpot from an unsynced inquiry. Repeated identical submissions share an idempotency key; changed content requires a new key. Failed/unknown email delivery remains visible for reconciliation.

Request types: `savings`, `consult`, `collections`, `distributor`. Collections is for hospitals returning expired robotic instruments. It requires facility, contact name and email; purchase-oriented model/annual-volume fields are excluded. The type is preserved in the private inbox, review task, notification and HubSpot property.

### HubSpot

Connect **Unite's** portal, not the OSPRI portal. Server environment: `HUBSPOT_PRIVATE_APP_TOKEN`. Use a private app limited to contact read/write and contact schema read/write (`crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.schemas.contacts.read`, `crm.schemas.contacts.write`). Schema write initializes the five Unite Robotics custom fields; no deals, payments, deletion or marketing subscription permissions are needed.

Fields: `unite_program`, `unite_robotics_inquiry`, `unite_robotics_model`, `unite_robotics_volume`, `unite_robotics_reference`. Existing contact identity/lifecycle is preserved. The full inquiry and message remain in Unite. Contact properties represent the most recently synced inquiry, with native HubSpot property history. No fake contacts are created when credentials are missing. Missed requests can be synced from the inquiry inbox after connecting.

## Savings feed — daily pull (September 25, 2026)

Brad provided `GET https://restorerobotics.net/unite-savings.json`, returning a dollar-formatted `savings` value. Server requests use `Authorization: Bearer <RESTORE_API_TOKEN>` and `User-Agent: Mozilla`. The token is a sensitive environment variable in the existing `unite-2-0-staging` Vercel project; never place it in client code or tracked files.

`GET /api/internal/restore-savings-refresh` requires the existing `CRON_SECRET`. Vercel invokes it daily at 11:00 UTC (7 a.m. Eastern during daylight saving time, 6 a.m. during standard time). The staging domain uses this staging project's Production deployment target, so its cron runs there. Brad updates every 15 minutes; Unite intentionally fetches once daily. The persistent database lease suppresses duplicate successful polls on the same UTC day and limits failed attempts to at least 15 minutes apart.

A successful request strictly validates the USD amount and stores it in `um_metrics` as `restore_savings`, atomically recording the successful refresh day. Invalid JSON, failed HTTP requests, timeouts, and storage failures preserve the previous snapshot. Public visitors read only Unite's CDN-cached `/api/metrics/savings`; they never trigger a Restore request.

The upstream load balancer rejects HTTP/1.1 with status 464. The server uses native HTTP/2, keeps TLS verification enabled, refuses redirects, caps responses at 16 KB, and times out after 15 seconds. HTTP/2 transport tests cover headers, redirects, invalid/oversized bodies, and cancellation.

The upstream payload has no reporting date. Store `checked_at`, expose it explicitly, and display **Last checked [date] · Updates daily** without inventing a source `as_of`. The public page rounds the amount to whole dollars; the database retains cents. Until the first successful sync, the existing $1.4M reported fallback remains.

For explicit deployment diagnostics only, `UNITE_VERIFY_RESTORE=1` runs a live HTTP/2 feed check during the build. Adding `UNITE_INITIALIZE_RESTORE=1` performs the user-authorized initial database seed in the staging project using that same validated response. These are opt-in build flags, not required for normal deployments or the daily cron.

The optional HMAC-authenticated `POST /api/hooks/restore` receiver remains available for dated source snapshots but is not needed for this pull integration. Its ordering check understands both legacy source timestamps and the new check timestamps. No webhook secret is required for the daily feed.

## Photography and factual references

Real program images sourced September 24, 2026 from Encore, the program's master distributor:
- `xi-instruments.jpg`: https://encoremdr.com/wp-content/uploads/2025/03/Xi_glamour-scaled.jpg
- `collection-tray.jpg`: https://encoremdr.com/wp-content/uploads/2025/03/Step-2-photo.jpg
- `return-container.jpg`: https://encoremdr.com/wp-content/uploads/2025/03/Step-4-photo.jpg
- Source pages: https://encoremdr.com/remanufactured-robotic-instruments/ and https://encoremdr.com/robotic-instrument-collections/

Page includes attribution. Confirm partner marketing asset usage as part of production content approval.
Design reference: https://rocuvexmed.com/
Manufacturer update: https://www.restorerobotics.com/mar-31--2026
FDA instrument-specific scope: https://www.accessdata.fda.gov/cdrh_docs/pdf25/K252926.pdf

Copy avoids asserting blanket clearance for every Xi/DV5 instrument or guaranteed clinical performance. Quotes confirm instrument-specific compatibility/labeling. Damon-provided approximate savings and static fallback are retained with context.

### Savings attribution
The displayed cumulative savings total is specific to accounts introduced to Restore Robotics through Unite Medical’s marketing and outreach. The feed is Brad’s Unite-specific `unite-savings.json` endpoint provided for this integration; retain the Unite-account wording rather than describing it as all Restore Robotics program savings.

### September 24 editorial redesign and scroll film
- Design reference: Palantir homepage and hospital offering page; adapted typography, full-bleed imagery, thin rules and editorial rows to Unite's existing palette and content.
- Official da Vinci Xi reference photo: https://www.intuitive.com/en-us/-/media/ISI/Intuitive/Images/Da-Vinci-Xi/image-of-da-Vinci-Xi-arms-on-black-background.jpg (source page: https://www.intuitive.com/en-us/products-and-services/da-vinci/xi). Saved as `public/images/robotics/da-vinci-xi-system.jpg`.
- Higgsfield generated motion job `6f2b7fd2-4f55-413e-b65c-1f489ac44d85`, Grok Video v1.5, six seconds. Camera/light motion from the source photograph, not actual surgical footage. Visible page attribution labels AI-generated motion and system imagery as contextual.
- `da-vinci-xi-motion.mp4`: silent H.264, 1280px wide, 24 fps, faststart, keyframes every six frames; approximately 1.1 MB. Scrolling controls its timeline in both directions while the section stays sticky. A native workflow link skips the section. No wheel/touch interception.
- Motion loads near the viewport only on desktop (900px+), without reduced-motion or data-saving preferences. Smaller screens and reduced-motion/data-saving users get the original still with no pinned scroll runway. Media errors also fall back to the still.
- Robot and text use subtle scroll-linked parallax. Page-scoped overflow correction enables sticky positioning without affecting other routes; the main header scrolls away before the section index takes over.
- Mobile 390px and tablet 855px verified without horizontal overflow or video elements. Desktop verified forward from 2.878s to 4.875s and backward to 2.878s, with the stage fixed at viewport top. FAQ and savings/consultation/collections/partnership routes retain the existing inquiry behavior.


### September 24 — final robotics editorial rebuild
Rebuilt the page around a centered film hero, translucent Unite navigation, selectable feature, oversized offering rows, scoped account-savings metrics, separate lower scroll film, four-step workflow, partners, one FAQ, and the existing inquiry form. Hero is now an 8-second autoplay loop (robot/instrument/robot, 2.5–3 seconds per shot) with pause/play; the 12-second scroll-driven clip remains below the program/metrics sections. Removed the unrelated corridor shot and both rejected generated tray illustrations; feature imagery uses existing original instrument/system photography. Removed the repetitive readiness section and replaced the paired-photo block with one collections callout. Mobile/reduced-motion/data-saver fallbacks remain static. Collections CTA verified to select collections and omit purchasing-only fields; no inquiry submitted. Desktop/mobile visual QA and build performed; original integrations and live-store cutover remain outside this visual change.

### September 25 deployment verification

Deployed `dpl_E5c34LLm2pPpLxWoaYMg8wybCw8i` to the existing staging alias. Vercel HTTP/2 feed read succeeded and seeded the real $1,411,198.32 snapshot at 2026-09-25T16:41:04.168Z. Public API and browser display verified ($1,411,198, whole-dollar formatting) with “Last checked Sep 25, 2026 · Updates daily.” The daily cron is enabled at 11:00 UTC. Unauthorized refresh requests return 401. A manual repeat cron invocation left the successful snapshot unchanged. All 24 focused tests and targeted lint passed; Vercel build passed. No token was found in the built public assets.
