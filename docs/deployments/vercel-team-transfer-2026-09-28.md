# Vercel team transfer — 2026-09-28

Destination: `unite-medical` (`team_0cCbU6aEuKn7U9erXTQl8VBD`).

| Project | Environment entries preserved | Current production deployment |
| --- | ---: | --- |
| unite-2-0 | 42 | dpl_Gzi2dRNvPPzzUeQJQeecktDkMs8D |
| unite-2-0-staging | 33 | dpl_ACp9fkVfuBaZgcPxfmPKADwFBLLN |
| tjs-project-2 | 27 | dpl_FauisDRvCtje5ia5x3j5SyF1j5As |

All 102 environment entry names, types, target environments, and branch scopes match the pre-transfer inventory. Native transfer preserved their values; secrets were not exported into this repository. Existing PostHog configuration remains intact.

## Domains and storage

- Vercel ownership of `unitemedical.net` moved to Unite Medical. External GoDaddy nameservers remain unchanged. This does not launch staging onto the root website.
- `staging.unitemedical.net`, `tjs.unitemedical.net`, `www.tjs.unitemedical.net`, and the three existing project `.vercel.app` domains remain verified and attached.
- `unite-welllink-private` Blob storage moved to Unite Medical: all 10 objects remain private, with the production staging connection intact.
- Existing local Vercel project/repository links for these project IDs now reference the Unite team.

## Analytics and verification

Vercel Web Analytics is enabled on all three projects, and the API reports `hasData: true` for each after verification. TJS already included its SDK. The updated Unite site now includes the SDK and excludes authentication, staff, account, and private quote routes; public URL query strings and fragments are removed.

The older Unite deployment was rebuilt from its exact prior uploaded source references (baseline `dpl_EJudfjwoxY79oXhWBxFPAubpUqcB`). Only `index.html` changed to add privacy-filtered Web Analytics. It was then promoted; this did not promote the newer staging application into the older project.

Validation: eight analytics tests passed, targeted lint passed, production build and 155-route prerender passed. All three homepages and analytics scripts returned HTTP 200. TJS dashboard login and database-backed public resources returned HTTP 200. Unite staging's database-backed invalid-login check returned the expected HTTP 401. The older Unite services health endpoint returned `ok: true`.

## Pending ownership/setup decisions

1. The existing Unite Neon database remains under its original billing account. Moving its native integration requires the destination to match the existing Neon Scale plan ($0.222 per compute-unit hour and $0.35 per GB-month). Approval was requested. Its transferred environment credentials continue to connect to the existing database.
2. Vercel requires GitHub app authorization for `Unite-Medical/unite_2_0` before reconnecting automatic deployments. The obsolete `LubedB1nary` link was removed during the reconnect attempt; the new connection was rejected with `Install GitHub App`. Unite currently deploys through the authorized CLI/API. Staging was already CLI-managed; TJS retains its existing Git connection.

The analytics source update is in commit `2e926fd` on `codex/catalog-quick-quote` / PR #6.
