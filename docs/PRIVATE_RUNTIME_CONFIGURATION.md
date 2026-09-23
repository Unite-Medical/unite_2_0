# Private runtime configuration

The source repository is public. Never commit contracts, credentials, operational snapshots, member rosters, or account handoff files.

WellLink uses server-only `WELLLINK_SOURCE_JSON` containing a `contract` object and six `products` (SKU, size, pack counts, full-precision unit price strings). The authenticated handler reads these values at runtime. Missing or invalid configuration fails closed; it never activates customer pricing.

The seven original document files are stored under `welllink/` in a private Vercel Blob store. `BLOB_READ_WRITE_TOKEN` is server-only. Downloads require a live authorized staff session and are returned through the application API; storage URLs and tokens are never returned to the client.

Controlled staging builds set `UNITE_PRIVATE_BUILD_INPUTS=1` and restore the existing historical inventory, legacy-order decision, and barcode-readiness snapshots from `build-inputs/` in the private store. These snapshots remain ignored by Git. They do not constitute current operational reconciliation or authorize live ordering. Builds fail if required private storage cannot be read.

A fresh public checkout without private configuration generates empty local snapshots before development, tests, or builds. It contains no real inventory or historical order approvals. Do not interpret empty local snapshots as production data. Private configuration must be supplied separately before operating these features in another environment.
