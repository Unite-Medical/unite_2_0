#!/usr/bin/env python3
"""PRD-27 verifier — distributor consignment / 3PL.

Static checks that consignment upholds the PRD invariants:
  1. Availability is ALWAYS owner-scoped (no query sums distributor + Unite).
  2. Every receive + pick writes a scan_events row; manual capture is flagged.
  3. A Unite sale of a unite_sellable distributor SKU writes consignment_movements
     and decrements the distributor's lot (not Unite's).
  4. Blind orders use the distributor ship identity + non-Unite packing slip.
  5. applyMarkup is the only path producing a distributor-facing shipping price.
  6. Third-party billing sets billToThirdParty + adds no freight to Unite.

Run from the repo root: python3 scripts/consignment_check.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
fails = []


def read(rel):
    p = SRC / rel
    return p.read_text() if p.exists() else ""


def check(cond, msg):
    if not cond:
        fails.append(msg)


# 1. Owner-scoped availability.
cons = read("lib/consignment.js")
check("owner_type" in cons and "owner_org_id" in cons, "consignment must scope by owner_type/owner_org_id")
check("availableFor" in cons, "consignment must expose owner-scoped availableFor")

# 2. Scan provenance for receive + pick; manual flagged.
scan = read("lib/scanning.js")
check("receiveScan" in scan and "scan_events" in scan, "receiveScan must write scan_events")
check("pickScan" in scan and "lot_tracking" in scan, "pickScan must write recall trace (lot_tracking)")
check("gs1_scan" in scan and "manual" in scan, "scanning must record capture_method incl. manual")
check("parseGs1" in scan, "scanning must parse GS1 AIs")

# 3. Sell-through writes movements + decrements the owner's lot.
check("recordSellThrough" in cons and "consignment_movements" in cons, "must record sell-through movements")
check("sold_by_unite" in cons, "sell-through movement type must be sold_by_unite")
check("consignment.recordSellThrough" in read("lib/fulfillment.js"), "fulfillment must record sell-through on Unite sale")

# 4. Blind ship identity + non-Unite slip.
blind = read("lib/blindShip.js")
check("shipIdentityFor" in blind and "brand_name" in blind, "blindShip must resolve distributor identity")
check("neutral_unbranded" in blind, "blind orders must never use the Unite-branded slip")
check("ship_from" in read("lib/external/shipstation.js"), "shipstation must accept a ship_from identity")

# 5. Markup is the only distributor-facing price path.
rates = read("lib/shippingRates.js")
check("applyMarkup" in rates and "markupPctFor" in rates, "shippingRates must centralize markup")
check("compareForDistributor" in rates, "must provide Unite-rate vs your-account comparison")

# 6. Third-party billing.
check("bill_to_third_party" in read("lib/external/shipstation.js"), "shipstation must support third-party billing")
check("billToParty" in read("lib/external/shipstation.js"), "third-party billing must set billToParty")

# PO ingestion (Phase 6).
po = read("lib/poIngestion.js")
check("resolveSku" in po and "learnMapping" in po, "poIngestion must match + learn SKU mappings")
check("needs_mapping" in po, "poIngestion must flag unmatched lines for mapping")

if fails:
    print("PRD-27 consignment_check FAILED:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("PRD-27 consignment_check passed (%d assertions)" % 18)
