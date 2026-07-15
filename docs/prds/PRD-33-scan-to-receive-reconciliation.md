# PRD-33 — Scan-to-Receive & Goods-Receipt Reconciliation

**Source:** Damon working session (2026-07) — "when a product comes into the
warehouse and they scan the UPC, that should register in our system as received.
And we want it to reconcile."
**Owner:** Alex (CTO) · Damon as warehouse-operations owner
**Status:** draft / built (Phase 1-3 landed; hardware + Neon backfill are go-live)
**Depends on:** PRD-25 (native WMS — append-only ledger, lots, PO lifecycle),
PRD-27 (`scan_events` provenance table + GS1/UDI parser in `src/lib/scanning.js`),
PRD-07 (GTIN validation via `src/lib/external/gs1.js`).
**Blocks:** accurate on-hand at go-live (opening count depends on a working
receive path), FEFO integrity (lot + expiry captured at receive).

> Half of this already existed: PRD-25 built a receiving workstation that posts
> real ledger receipts, and PRD-27 shipped a GS1/UDI barcode parser. The two
> were never connected, and the workstation keyed on **SKU**, not the **UPC**
> printed on the carton. Nothing resolved a scanned barcode back to a product,
> and there was no ordered-vs-received reconciliation. This PRD wires the scan
> path end to end and adds the reconciliation Damon asked for.

---

## 1. North star

A warehouse worker scans the barcode on an inbound carton. The system
recognizes the product, records the units as received against the right
purchase order (or as a blind receipt), captures lot + expiration when the
barcode carries them, and writes an auditable scan trail — with **zero manual
SKU lookup**. At any moment the receiving screen shows **ordered vs received**
per line, sourced from the append-only ledger, so a PO reconciles itself as
cartons land and short/over/unexpected receipts are impossible to miss.

Success = a receiving clerk never types a SKU, and Damon can look at any PO and
see in one glance whether what showed up matches what was ordered.

---

## 2. Current state

| Have | Where |
|---|---|
| Receiving workstation (PO + blind receipt), posts real ledger receipts | `src/pages/admin/AdminReceiving.jsx`, `wms/purchaseOrders.receive` |
| Append-only stock ledger (`on_hand ≝ SUM(qty_delta)`), idempotent | `src/lib/wms/ledger.js` |
| Lots + FEFO + recall genealogy, `receiveLot()` primitive | `src/lib/wms/lots.js` |
| GS1-128 / DataMatrix / UDI parser (GTIN 01, lot 10, expiry 17) | `src/lib/scanning.js` (`parseGs1`, `generateLotBarcode`) |
| GTIN-14 mod-10 check-digit validation | `src/lib/external/gs1.js` (`isValidGtin`) |
| `scan_events` provenance table (registered) | `src/lib/db.js` |
| PO lifecycle draft→approved→sent→partial→received→closed | `src/lib/wms/purchaseOrders.js` |
| Nightly ledger reconcile (`on_hand` vs `SUM(movements)`) | `wms/ledger.reconcile()` |

**Gaps this PRD closes:**
1. **No UPC → product resolution.** Products carried a GTIN at onboarding but
   nothing mapped a scanned barcode back to a SKU. The workstation input was
   labeled "SKU / SCAN" and shoved the raw code into `scan.sku`.
2. **GS1 parser orphaned.** `parseGs1()` existed but was never called by the
   receiving screen — a scanned 2D code was not decoded to lot/expiry.
3. **No goods-receipt reconciliation.** Nothing compared PO ordered qty against
   what the ledger actually received; short/over/off-PO receipts were invisible.

---

## 3. Architecture — the resolve → receive → reconcile path

New module: **`src/lib/wms/receiving.js`**. It is a resolver + reconciler, not a
second source of truth. All stock writes still go through `wms/lots` and
`wms/purchaseOrders`, which post through the ledger. Copy this seam for any new
inbound flow.

### 3.1 `resolveScan(raw) → { matched, sku, product, gtin, lot_number, expiration_date, capture_method, reason }`

Priority order (each falls through to the next on no-match):

1. **Bare barcode** — the whole scan is digits of a standard GTIN length
   (UPC-A 12 / EAN-13 13 / GTIN-14 14 / GTIN-8 8) with a valid mod-10 check
   digit → look up product by `upc`/`gtin` (GTIN-14 normalized).
   `capture_method: 'upc'`. **Checked before GS1 parsing** so a plain UPC
   beginning "01" is not misread as GS1 Application Identifier (01).
2. **GS1 / UDI element string** — symbology prefix (`]C1`/`]d2`/`]Q3`), AIs, or
   non-GTIN length → `parseGs1()` → GTIN (01) + lot (10) + expiry (17) in one
   scan. `capture_method: 'gs1_scan'`.
3. **Raw SKU fallback** — a label Unite printed, or manual entry. Exact then
   case-insensitive SKU match; keeps the raw value so blind receipts still work.
   `capture_method: 'sku'`.

An unmatched code returns `matched: false` with a `reason`
(`upc_not_in_catalog` / `gtin_not_in_catalog` / `sku_not_in_catalog`) — it is
**never silently invented** into a fake product.

### 3.2 `receiveScans(lines, { po_id, warehouse_id, received_by })`

Batch-receives resolved lines. With a PO → `purchaseOrders.receive` (advances
`received_qty`, flips partial/received, posts the QBO landed-cost bill on full
receipt). Without → blind receipt via `lots.receiveLot`. Either path writes one
`scan_events` provenance row per line (raw barcode, parsed fields, capture
method, matched flag, qty, station, actor). Idempotent through the underlying
ledger idempotency keys — a replayed scan does not double stock.

### 3.3 `reconcilePO(po_id) → { lines[], totals, unexpected, balanced }`

The reconciliation. **Received counts come from the ledger** (SUM of `receipt`
movements where `ref_type=purchase_order, ref_id=po_id`), never a trusted
counter. Each line classified:

- `exact` — received == ordered
- `short` — received < ordered (variance negative)
- `over` — received > ordered (variance positive)
- `unexpected` — a receipt movement for a SKU never on the PO

`balanced` is true only when every line is `exact`.

### 3.4 UPC seeding (demo)

Every catalog product now carries a deterministic, check-digit-valid `upc`
(UPC-A) and `gtin` (GTIN-14 = zero-padded UPC) — `upcForSku()` in
`src/lib/seed.js`, all under a shared GS1 company prefix. This lets scan-to-
receive resolve against the catalog with no external key. Schema bumped to 18.

---

## 4. UI

`AdminReceiving.jsx` rewritten:
- **02 · Scan a carton** — single scan field ("SCAN UPC / GTIN / BARCODE"),
  Enter (USB wedge) or the Resolve button. On resolve it shows the matched
  product + capture method + GTIN, and lot/expiry auto-fill from a 2D code.
  Unmatched codes surface a clear error; off-PO scans are rejected with a
  "switch to blind receipt" hint.
- **03 · Staged** — resolved lines with remove, then "Post receipt → ledger".
- **04 · Reconcile `<PO>`** — live ordered/received/variance table + a
  BALANCED / OPEN VARIANCE badge, recomputed on every ledger change.

---

## 5. Hardware (Damon's buy list)

See `docs/Receiving_Hardware.docx`. The software is scanner-agnostic — any
**USB-HID "keyboard wedge"** scanner works with zero config (it types the code
and hits Enter). For 2D/UDI codes (auto lot + expiry) a **2D imager** is
required; a 1D laser reads UPC only. Label printer is for Unite-printed
internal barcodes (blind receipts, repacks) — a **direct-thermal** unit.

---

## 6. Phases & exit criteria

| Phase | Scope | Exit criteria | Status |
|---|---|---|---|
| 1 | UPC/GTIN on every product + `resolveScan` | bare UPC + GS1 code both resolve to SKU; unknown reports reason (verifier) | ✅ landed |
| 2 | `receiveScans` + `scan_events` provenance | scan-to-receive posts a real ledger receipt + 1 scan row; idempotent | ✅ landed |
| 3 | `reconcilePO` + workstation UI | short/over/exact/unexpected classified from ledger truth; live panel | ✅ landed |
| 4 | Hardware procurement | scanner + label printer purchased, tested against `/admin/inventory/receive` | ⬜ go-live |
| 5 | **Neon backfill** — write `upc`/`gtin` to the live product rows | in connected mode, catalog products resolve by UPC (not just demo seed) | ⬜ go-live |

---

## 7. Verifier

`scripts/verify_orchestration.mjs` → section **"PRD-33 · scan-to-receive +
reconciliation"** (15 checks, exercises the real modules against the in-memory
DB): bare-UPC resolve, GS1 resolve with lot+expiry, unknown-code no-fabrication,
scan-to-receive posts a ledger receipt + provenance row, short/exact/over
reconciliation, and the ledger invariant holds through scan-receive.
`phase_check.py`, `npm run lint`, `npm run build` all green.

---

## 8. Open questions

- **Neon backfill (Phase 5):** the demo seed adds UPCs, but in connected mode
  `remoteDb.js` hydrates products from the Neon row-store on boot, which has no
  UPC values — so live product rows need a one-time `upc`/`gtin` write. This is
  a **production DB mutation** and must not run without Damon's go-ahead.
  Real cartons carry the manufacturer's real UPC (Medava-brand and others), so
  the backfill should ideally use the true published GTINs, not the demo hash.
- **Manufacturer GTIN source:** GS1 US Data Hub (`gs1.js`, key = GO_LIVE bucket)
  can verify third-party GTINs; is there a supplier feed for the real codes, or
  do we scan a sample carton per SKU to capture ground truth?
- **Serial-tracked devices:** current path captures lot + expiry (AI 10/17).
  Serial (AI 21) is parsed but not yet stored per-unit — needed only if a
  device line requires unit-level UDI. Defer until a SKU demands it.

---

## 9. Definition of done

- [x] `resolveScan` handles UPC-A / EAN-13 / GTIN-14 / GS1-UDI / raw SKU, no fabrication
- [x] `receiveScans` posts through the ledger + writes `scan_events`, idempotent
- [x] `reconcilePO` classifies exact/short/over/unexpected from ledger truth
- [x] Workstation UI: scan → resolve → stage → post → live reconcile panel
- [x] 15 verifier checks green; phase_check / lint / build green
- [x] Verified live in-browser: UPC scan → ledger receipt + lot + scan_events + on_hand
- [ ] Scanner + label printer purchased and bench-tested (Phase 4)
- [ ] Neon product rows backfilled with `upc`/`gtin` (Phase 5, needs go-ahead)
