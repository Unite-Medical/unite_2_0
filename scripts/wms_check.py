#!/usr/bin/env python3
"""
PRD-25 — UniteWMS verifier (CI + nightly). Phase 0 (v1).

The single most important invariant in UniteWMS (PRD §4.1, §10):

    for every (sku, warehouse):  inventory.on_hand == SUM(stock_movements.qty_delta)

If the projection ever diverges from the append-only ledger, the ledger wins
and this check fails hard. Later phases add: no oversell (available >= 0), lot
conservation, recall latency, PO math, reservation math.

Data sources (first match wins):
  1. --snapshot <path>            a JSON file {tables:{inventory:[...], stock_movements:[...]}}
  2. env WMS_SNAPSHOT             same shape, path from environment
  3. live durable store          --live with env SYNC_URL + DB_SYNC_TOKEN
                                  (GET /api/db/sync, stdlib only)
  4. default                      tmp/wms_snapshot.json (produced by
                                  scripts/wms_seed_movements.mjs)

Exit 0 = all checks pass, 1 = at least one failed.
"""

import json
import os
import sys
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SNAPSHOT = os.path.join(ROOT, "tmp", "wms_snapshot.json")


def _arg(flag):
    argv = sys.argv[1:]
    if flag in argv:
        i = argv.index(flag)
        if flag == "--live":
            return True
        if i + 1 < len(argv):
            return argv[i + 1]
    return None


def load_from_file(path):
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("tables", data)


def load_from_live():
    sync_url = os.environ.get("SYNC_URL") or os.environ.get("VITE_API_BASE", "").rstrip("/") + "/db/sync"
    token = os.environ.get("DB_SYNC_TOKEN") or os.environ.get("VITE_DB_SYNC_TOKEN")
    if not sync_url or not token:
        raise SystemExit("--live requires SYNC_URL (or VITE_API_BASE) and DB_SYNC_TOKEN")
    req = urllib.request.Request(sync_url, headers={"x-sync-token": token})
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload.get("tables", {})


def resolve_tables():
    snap = _arg("--snapshot") or os.environ.get("WMS_SNAPSHOT")
    if _arg("--live"):
        print("source: live /api/db/sync")
        return load_from_live()
    if snap:
        print(f"source: {snap}")
        return load_from_file(snap)
    if os.path.exists(DEFAULT_SNAPSHOT):
        print(f"source: {os.path.relpath(DEFAULT_SNAPSHOT, ROOT)}")
        return load_from_file(DEFAULT_SNAPSHOT)
    raise SystemExit(
        "No data source. Run `node scripts/wms_seed_movements.mjs` first, "
        "or pass --snapshot <path> / --live."
    )


def num(v):
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return 0


def sku_of(row):
    return row.get("sku") or row.get("product_sku")


def main():
    tables = resolve_tables()
    inventory = tables.get("inventory", []) or []
    movements = tables.get("stock_movements", []) or []

    failures = []
    checks = 0

    # ── Check 1: ledger invariant (hard fail) ──────────────────────────────
    projected = defaultdict(int)
    for row in inventory:
        key = (sku_of(row), row.get("warehouse_id"))
        if key[0] is None or key[1] is None:
            continue
        projected[key] += num(row.get("on_hand"))

    ledgered = defaultdict(int)
    for mv in movements:
        key = (sku_of(mv), mv.get("warehouse_id"))
        if key[0] is None or key[1] is None:
            continue
        ledgered[key] += num(mv.get("qty_delta"))

    keys = set(projected) | set(ledgered)
    invariant_fails = 0
    for key in sorted(keys, key=lambda k: (str(k[0]), str(k[1]))):
        checks += 1
        if projected.get(key, 0) != ledgered.get(key, 0):
            invariant_fails += 1
            if invariant_fails <= 20:
                failures.append(
                    f"ledger invariant: {key[0]}@{key[1]} on_hand={projected.get(key, 0)} "
                    f"!= SUM(qty_delta)={ledgered.get(key, 0)}"
                )
    print(f"  ledger invariant: checked {len(keys)} (sku,warehouse) pairs, "
          f"{len(keys) - invariant_fails} ok")

    # ── Check 2: no negative on-hand in the projection ─────────────────────
    neg = [(sku_of(r), r.get("warehouse_id"), num(r.get("on_hand")))
           for r in inventory if num(r.get("on_hand")) < 0]
    checks += 1
    if neg:
        for sku, wh, oh in neg[:20]:
            failures.append(f"negative on_hand: {sku}@{wh} = {oh}")
    print(f"  no negative on_hand: {len(inventory)} rows checked, {len(neg)} negative")

    # ── Check 3: no oversell — available = on_hand - reserved >= 0 ──────────
    oversold = 0
    for row in inventory:
        avail = num(row.get("on_hand")) - num(row.get("reserved"))
        if avail < 0:
            oversold += 1
            if oversold <= 20:
                failures.append(
                    f"oversell: {sku_of(row)}@{row.get('warehouse_id')} available={avail} "
                    f"(on_hand={num(row.get('on_hand'))} reserved={num(row.get('reserved'))})"
                )
    checks += 1
    print(f"  no oversell (available >= 0): {len(inventory)} rows, {oversold} oversold")

    # ── Check 4: reservation math — SUM(held.qty) == inventory.reserved ─────
    reservations = tables.get("reservations", []) or []
    held = defaultdict(int)
    for r in reservations:
        if r.get("status") == "held":
            held[(sku_of(r), r.get("warehouse_id"))] += num(r.get("qty"))
    reserved_proj = defaultdict(int)
    for row in inventory:
        reserved_proj[(sku_of(row), row.get("warehouse_id"))] += num(row.get("reserved"))
    resv_fails = 0
    for key in set(held) | set(reserved_proj):
        if held.get(key, 0) != reserved_proj.get(key, 0):
            resv_fails += 1
            if resv_fails <= 20:
                failures.append(
                    f"reservation math: {key[0]}@{key[1]} SUM(held)={held.get(key, 0)} "
                    f"!= inventory.reserved={reserved_proj.get(key, 0)}"
                )
    checks += 1
    print(f"  reservation math (SUM held == reserved): "
          f"{len(set(held) | set(reserved_proj))} pairs, {resv_fails} mismatched")

    # ── Report ─────────────────────────────────────────────────────────────
    print()
    if failures:
        for f in failures:
            print(f"  \u2717 {f}")
        print(f"\nFAIL — {len(failures)} problem(s) across {checks} checks.")
        return 1
    print(f"PASS — all checks green ({len(keys)} sku/warehouse pairs, "
          f"{len(movements)} movements).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
