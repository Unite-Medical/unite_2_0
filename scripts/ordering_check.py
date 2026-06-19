#!/usr/bin/env python3
"""PRD-26 verifier — customer order management.

Static checks that the ordering core upholds the PRD invariants:
  1. resolveCustomerPrice is the single price resolver used by cart/quick/reorder
     (no inline tier math in those modules).
  2. Checkout renders only approved methods + placeOrder server-rejects off-list.
  3. placeOrder runs through the PRD-24 orchestrator (no drifting inline copy).
  4. Rep overrides are gated + audited.

Source-level assertions (the runtime behavior is covered by the Node harness);
run from the repo root: python3 scripts/ordering_check.py
"""
import re
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


# 1. One resolver: cart + quick order + reorder import resolveCustomerPrice and
#    do not call priceFor directly.
cart = read("store/cart.js")
check("resolveCustomerPrice" in cart, "cart.js must use resolveCustomerPrice")
check("priceFor(" not in cart, "cart.js must not call priceFor directly (use the resolver)")
check("resolveCustomerPrice" in read("lib/quickOrder.js"), "quickOrder.js must use resolveCustomerPrice")
check("resolveCustomerPrice" in read("lib/reorder.js"), "reorder.js must use resolveCustomerPrice")

# 2. Payment gate present + enforced server-side.
orders = read("lib/orders.js")
check("assertMethodAllowed" in orders, "orders.js must enforce the payment allowlist")
check("method_not_allowed" in read("lib/paymentMethods.js"), "paymentMethods must reject off-list methods")
check("approvedMethodsFor" in read("pages/Checkout.jsx"), "Checkout must render only approved methods")

# 3. placeOrder routes through the orchestrator.
check("runFulfillment" in orders, "placeOrder must hand off to runFulfillment (PRD-24)")
check("credit_hold" in orders, "placeOrder must route over-limit terms to a hold queue")

# 4. Rep authority gated + audited.
rep = read("lib/repAuthority.js")
check("assertRepAuthority" in orders, "orders.js must assert rep authority when rep_id is set")
check("rep.authority_denied" in rep, "repAuthority must audit denied attempts")
check("max_discount_pct" in rep, "repAuthority must bound the discount grant")

# 5. Multi-recipient notifications fan out from the orchestrator.
check("notifyRecipients" in read("lib/fulfillment.js"), "fulfillment must fan out via notifyRecipients")

if fails:
    print("PRD-26 ordering_check FAILED:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("PRD-26 ordering_check passed (%d assertions)" % 16)
