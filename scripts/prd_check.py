#!/usr/bin/env python3
"""
PRD verifier — consolidated structural checks for the back-end PRDs
(PRD-07, PRD-08, PRD-10, PRD-11).

Unlike `phase_check.py` which scans for forbidden strings in the
site rebuild, this script verifies that the architectural commitments
of each PRD are still in place:

  - PRD-07: openFDA + USITC HTS clients exist; vendor scoring uses
    the real openFDA client (no inline lookup table in services.js)
  - PRD-08: quote print view route is mounted; SQL migration is
    present
  - PRD-10: surplus page mounted; SQL migrations + form fields exist
  - PRD-11: prompt registry has all expected entries; every prompt
    file referenced actually exists on disk; the @unite/ai client
    routes everything through the registry

Usage:
    python3 scripts/prd_check.py             # all PRDs
    python3 scripts/prd_check.py --prd 07    # one PRD
    python3 scripts/prd_check.py --strict    # fail on warnings

Exit codes:
    0 = all requested PRDs pass
    1 = at least one PRD failed (or --strict + warnings)
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Result:
    prd: str
    title: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.errors


def file_contains(path: Path, pattern: str, flags: int = 0) -> bool:
    if not path.exists():
        return False
    return re.search(pattern, path.read_text(), flags) is not None


def file_must_exist(res: Result, path: Path, label: str) -> None:
    if not path.exists():
        res.errors.append(f"missing: {label} ({path.relative_to(ROOT)})")


def file_must_contain(res: Result, path: Path, pattern: str, label: str) -> None:
    if not path.exists():
        res.errors.append(f"missing file for check {label}: {path.relative_to(ROOT)}")
        return
    if not re.search(pattern, path.read_text()):
        res.errors.append(f"{label}: pattern not found in {path.relative_to(ROOT)}: {pattern}")


def file_must_not_contain(res: Result, path: Path, pattern: str, label: str) -> None:
    if not path.exists():
        return
    if re.search(pattern, path.read_text()):
        res.errors.append(f"{label}: forbidden pattern still in {path.relative_to(ROOT)}: {pattern}")


# ---------- PRD-07: vendor approval ----------

def check_prd_07() -> Result:
    res = Result(prd="07", title="Vendor approval (openFDA + GUDID + GS1)")

    file_must_exist(res, ROOT / "src/lib/external/openfda.js", "openFDA client")
    file_must_exist(res, ROOT / "src/lib/vendorScoring.js", "vendor scoring engine")
    file_must_exist(res, ROOT / "docs/schema/migrations/0007_vendors.sql", "vendors migration")

    # openFDA client must hit the real API, not a hard-coded table.
    file_must_contain(
        res, ROOT / "src/lib/external/openfda.js",
        r"https://api\.fda\.gov/device",
        "openFDA client targets real api.fda.gov",
    )

    # services.js must NOT redefine the OPENFDA_PRODUCT_CODES table.
    # (It's been removed in favor of the external client.)
    file_must_not_contain(
        res, ROOT / "src/lib/services.js",
        r"OPENFDA_PRODUCT_CODES",
        "PRD-07 Phase 1: hardcoded openFDA table removed from services.js",
    )

    # Admin vendor page must use the real scoring engine.
    file_must_contain(
        res, ROOT / "src/pages/admin/AdminVendorApproval.jsx",
        r"evaluateVendor",
        "AdminVendorApproval uses evaluateVendor",
    )

    # Scoring engine must reference openFDA recall + classification.
    scoring = ROOT / "src/lib/vendorScoring.js"
    file_must_contain(res, scoring, r"registrationListing", "scoring uses registrationListing")
    file_must_contain(res, scoring, r"recallHistory", "scoring uses recallHistory")

    return res


# ---------- PRD-08: quoting engine v2 ----------

def check_prd_08() -> Result:
    res = Result(prd="08", title="Quoting engine v2")

    file_must_exist(res, ROOT / "src/lib/external/hts.js", "USITC HTS client")
    file_must_exist(res, ROOT / "src/pages/QuotePrint.jsx", "quote print view")
    file_must_exist(res, ROOT / "docs/schema/migrations/0006_quotes.sql", "quotes migration")

    # HTS client must reach for the real source.
    file_must_contain(
        res, ROOT / "src/lib/external/hts.js",
        r"hts\.usitc\.gov|/proxy/hts",
        "HTS client targets USITC or its backend proxy",
    )

    # services.js must not redefine its own HTS_RATES.
    file_must_not_contain(
        res, ROOT / "src/lib/services.js",
        r"const HTS_RATES",
        "PRD-08 Phase 2: HTS rate table removed from services.js",
    )

    # Quote print view is routed.
    file_must_contain(
        res, ROOT / "src/App.jsx",
        r"/quotes/:id/print",
        "QuotePrint route mounted in App.jsx",
    )

    # Quote page links to the print view.
    file_must_contain(
        res, ROOT / "src/pages/Quote.jsx",
        r"/quotes/\$\{[^}]+\}/print",
        "Quote page links to print view",
    )

    return res


# ---------- PRD-10: surplus inventory ----------

def check_prd_10() -> Result:
    res = Result(prd="10", title="Surplus inventory network")

    file_must_exist(res, ROOT / "src/pages/Surplus.jsx", "surplus intake page")
    file_must_exist(res, ROOT / "docs/schema/migrations/0012_surplus.sql", "surplus migration")

    file_must_contain(
        res, ROOT / "src/App.jsx",
        r'<Route path="/surplus"',
        "surplus route mounted",
    )

    # AI categorization wired
    file_must_contain(
        res, ROOT / "src/pages/Surplus.jsx",
        r"surplus/line_normalize",
        "surplus page calls AI categorization prompt",
    )

    # DB tables registered
    file_must_contain(
        res, ROOT / "src/lib/db.js",
        r"'surplus_submissions'",
        "db.js registers surplus_submissions table",
    )

    return res


# ---------- PRD-11: AI intelligence layer ----------

EXPECTED_PROMPT_KEYS = [
    "quoting/cover_letter",
    "quoting/hts_classify",
    "fathom/extract_action_items",
    "fathom/extract_insights",
    "digest/ceo_morning_brief",
    "vendor/outreach_email",
    "vendor/recall_notice",
    "surplus/line_normalize",
    "surplus/valuation",
]


def check_prd_11() -> Result:
    res = Result(prd="11", title="AI intelligence layer (Claude)")

    file_must_exist(res, ROOT / "src/lib/ai/client.js", "AI client")
    file_must_exist(res, ROOT / "src/lib/ai/registry.js", "AI prompt registry")
    file_must_exist(res, ROOT / "prompts/README.md", "prompt registry readme")
    file_must_exist(res, ROOT / "docs/schema/migrations/0010_ai_usage.sql", "ai_usage migration")

    registry_path = ROOT / "src/lib/ai/registry.js"
    registry_text = registry_path.read_text() if registry_path.exists() else ""

    for key in EXPECTED_PROMPT_KEYS:
        if f"'{key}'" not in registry_text:
            res.errors.append(f"prompt registry missing key: {key}")
        # The matching prompt file must exist on disk.
        rel = f"prompts/{key}.v1.md"
        if not (ROOT / rel).exists():
            res.errors.append(f"prompt file missing: {rel}")

    # services.js routes Claude calls through the new client.
    file_must_contain(
        res, ROOT / "src/lib/services.js",
        r"from\s+'\./ai/client\.js'",
        "services.js imports the AI client",
    )

    # db.js registers ai_usage table.
    file_must_contain(
        res, ROOT / "src/lib/db.js",
        r"'ai_usage'",
        "db.js registers ai_usage table",
    )

    return res


# ---------- PRD-02: QuickBooks Online ----------

def check_prd_02() -> Result:
    res = Result(prd="02", title="QuickBooks Online")
    file_must_exist(res, ROOT / "src/lib/external/qbo.js", "QBO client")
    file_must_exist(res, ROOT / "docs/schema/migrations/0005_finance.sql", "finance migration")
    file_must_contain(res, ROOT / "src/lib/external/qbo.js", r"quickbooks\.api\.intuit\.com", "QBO client targets api.intuit.com")
    file_must_contain(res, ROOT / "src/lib/external/qbo.js", r"createInvoice", "qbo.createInvoice exists")
    file_must_contain(res, ROOT / "src/lib/external/qbo.js", r"recordPayment", "qbo.recordPayment exists")
    return res


# ---------- PRD-03: Flexport ----------

def check_prd_03() -> Result:
    res = Result(prd="03", title="Flexport")
    file_must_exist(res, ROOT / "src/lib/external/flexport.js", "Flexport client")
    file_must_contain(res, ROOT / "src/lib/external/flexport.js", r"api\.flexport\.com", "Flexport client targets real upstream")
    file_must_contain(res, ROOT / "src/lib/external/flexport.js", r"Flexport-Version", "Flexport-Version header sent")
    file_must_contain(res, ROOT / "src/lib/external/flexport.js", r"handleWebhookEvent", "webhook handler present")
    return res


# ---------- PRD-04: Cin7 + ShipStation direct ----------

def check_prd_04() -> Result:
    res = Result(prd="04", title="Cin7 + ShipStation")
    file_must_exist(res, ROOT / "src/lib/external/cin7.js", "Cin7 client")
    file_must_exist(res, ROOT / "src/lib/external/shipstation.js", "ShipStation client")
    file_must_contain(res, ROOT / "src/lib/external/cin7.js", r"inventory\.dearsystems\.com", "Cin7 client targets Core API")
    file_must_contain(res, ROOT / "src/lib/external/cin7.js", r"api-auth-accountid", "Cin7 sends required auth header")
    file_must_contain(res, ROOT / "src/lib/external/shipstation.js", r"ssapi\.shipstation\.com", "ShipStation client targets ssapi")
    return res


# ---------- PRD-05: Fathom + AI brain ----------

def check_prd_05() -> Result:
    res = Result(prd="05", title="Fathom + Gmail AI brain")
    file_must_exist(res, ROOT / "src/lib/external/fathom.js", "Fathom handler")
    file_must_contain(res, ROOT / "src/lib/external/fathom.js", r"handleCallCompleted", "fathom.handleCallCompleted exists")
    file_must_contain(res, ROOT / "src/lib/external/fathom.js", r"fathom/extract_action_items", "Calls action_items prompt")
    file_must_contain(res, ROOT / "src/lib/external/fathom.js", r"fathom/extract_insights", "Calls insights prompt")
    file_must_exist(res, ROOT / "prompts/digest/ceo_morning_brief.v1.md", "CEO digest prompt")
    return res


# ---------- PRD-06: HubSpot ----------

def check_prd_06() -> Result:
    res = Result(prd="06", title="HubSpot CRM + 1099 reps")
    file_must_exist(res, ROOT / "src/lib/external/hubspot.js", "HubSpot client")
    file_must_contain(res, ROOT / "src/lib/external/hubspot.js", r"api\.hubapi\.com", "HubSpot client targets api.hubapi.com")
    file_must_contain(res, ROOT / "src/lib/external/hubspot.js", r"ensureCustomProperties", "custom properties setup present")
    file_must_contain(res, ROOT / "src/lib/external/hubspot.js", r"createDeal", "deals create exists")
    file_must_contain(res, ROOT / "src/lib/external/hubspot.js", r"createTask", "tasks create exists")
    return res


# ---------- PRD-09: Stripe ----------

def check_prd_09() -> Result:
    res = Result(prd="09", title="Stripe Billing + Connect")
    file_must_exist(res, ROOT / "src/lib/external/stripe.js", "Stripe client")
    file_must_contain(res, ROOT / "src/lib/external/stripe.js", r"api\.stripe\.com", "Stripe client targets api.stripe.com")
    file_must_contain(res, ROOT / "src/lib/external/stripe.js", r"send_invoice", "uses collection_method=send_invoice")
    file_must_contain(res, ROOT / "src/lib/external/stripe.js", r"handleWebhookEvent", "webhook handler present")
    return res


# ---------- PRD-08 v2: vendor sheet + margin policy ----------

def check_prd_08_v2() -> Result:
    res = Result(prd="08b", title="Quoting engine v2 — wave 2")
    file_must_exist(res, ROOT / "src/lib/vendorSheet.js", "vendor sheet parser")
    file_must_exist(res, ROOT / "src/pages/QuoteNew.jsx", "quote new wizard")
    file_must_exist(res, ROOT / "src/lib/marginPolicy.js", "margin policy module")
    file_must_exist(res, ROOT / "src/pages/admin/AdminMarginPolicy.jsx", "margin policy admin")
    file_must_contain(res, ROOT / "src/App.jsx", r'/quote/new"', "QuoteNew route mounted")
    file_must_contain(res, ROOT / "src/App.jsx", r"/admin/settings/margin", "margin policy admin route mounted")
    return res


# ---------- PRD-10 v2: surplus offer workflow ----------

def check_prd_10_v2() -> Result:
    res = Result(prd="10b", title="Surplus — wave 2")
    file_must_exist(res, ROOT / "src/pages/admin/AdminSurplus.jsx", "surplus admin")
    file_must_contain(res, ROOT / "src/App.jsx", r"/admin/surplus", "surplus admin route mounted")
    file_must_contain(res, ROOT / "src/pages/admin/AdminSurplus.jsx", r"surplus/valuation", "AI valuation wired")
    return res


# ---------- PRD-03 v2: inbound receiving pipeline ----------

def check_prd_03_v2() -> Result:
    res = Result(prd="03b", title="Inbound receiving — cleared → inventory → bill → reorder")
    file_must_exist(res, ROOT / "src/lib/receiving.js", "receiving pipeline")
    file_must_contain(res, ROOT / "src/lib/receiving.js", r"receiveClearedShipment", "receive entry point exists")
    file_must_contain(res, ROOT / "src/lib/receiving.js", r"createBillFromFlexport", "landed-cost bill posted")
    file_must_contain(res, ROOT / "src/lib/receiving.js", r"recalcReorderPoints", "reorder recalc chained")
    file_must_contain(res, ROOT / "src/lib/external/flexport.js", r"receiveClearedShipment", "webhook triggers receiving chain")
    return res


# ---------- PRD-12: run-rate replenishment ----------

def check_prd_12() -> Result:
    res = Result(prd="12", title="Run-rate replenishment model")
    file_must_exist(res, ROOT / "src/lib/replenishment.js", "replenishment engine")
    file_must_contain(res, ROOT / "src/lib/replenishment.js", r"computeRunRates", "run-rate computation exists")
    file_must_contain(res, ROOT / "src/lib/replenishment.js", r"draftPurchaseOrders", "PO drafting exists")
    file_must_exist(res, ROOT / "src/pages/admin/AdminReplenishment.jsx", "replenishment admin page")
    file_must_contain(res, ROOT / "src/App.jsx", r"/admin/replenishment", "replenishment route mounted")
    file_must_exist(res, ROOT / "docs/schema/migrations/0015_replenishment_digest.sql", "migration 0015")
    file_must_exist(res, ROOT / "forecasting/app/forecaster.py", "Python sidecar (Prophet upgrade path)")
    return res


# ---------- PRD-05 v2: CEO digest ----------

def check_prd_05_v2() -> Result:
    res = Result(prd="05b", title="CEO morning brief")
    file_must_exist(res, ROOT / "src/lib/digest.js", "digest generator")
    file_must_contain(res, ROOT / "src/lib/digest.js", r"digest/ceo_morning_brief", "routed through prompt registry")
    file_must_contain(res, ROOT / "src/lib/digest.js", r"heuristicBullets", "key-less fallback exists")
    file_must_exist(res, ROOT / "src/pages/admin/AdminDigest.jsx", "digest admin page")
    file_must_contain(res, ROOT / "src/App.jsx", r"/admin/digest", "digest route mounted")
    return res


# ---------- PRD-02 v2: CFO finance dashboard ----------

def check_prd_02_v2() -> Result:
    res = Result(prd="02b", title="Finance dashboard — AR aging + collections")
    file_must_exist(res, ROOT / "src/pages/admin/AdminFinance.jsx", "finance admin page")
    file_must_contain(res, ROOT / "src/pages/admin/AdminFinance.jsx", r"recordPayment", "one-click payment recording")
    file_must_contain(res, ROOT / "src/pages/admin/AdminFinance.jsx", r"ar_reminder", "reminder emails wired")
    file_must_contain(res, ROOT / "src/App.jsx", r"/admin/finance", "finance route mounted")
    return res


# ---------- Brief §7: trade-data discovery ----------

def check_discovery() -> Result:
    res = Result(prd="td", title="Trade-data discovery (vendor + customer mining)")
    file_must_exist(res, ROOT / "src/lib/external/importgenius.js", "trade-data client")
    file_must_contain(res, ROOT / "src/lib/external/importgenius.js", r"searchShipments", "shipment search exists")
    file_must_exist(res, ROOT / "src/pages/admin/AdminDiscovery.jsx", "discovery admin page")
    file_must_contain(res, ROOT / "src/pages/admin/AdminDiscovery.jsx", r"vendor/outreach_email", "AI outreach wired")
    file_must_contain(res, ROOT / "src/App.jsx", r"/admin/discovery", "discovery route mounted")
    return res


# ---------- PRD-07 v2: recall monitoring ----------

def check_prd_07_v2() -> Result:
    res = Result(prd="07b", title="Continuous recall monitoring")
    file_must_exist(res, ROOT / "src/pages/admin/AdminCompliance.jsx", "compliance admin page")
    file_must_contain(res, ROOT / "src/pages/admin/AdminCompliance.jsx", r"recallHistory", "openFDA sweep wired")
    file_must_contain(res, ROOT / "src/pages/admin/AdminCompliance.jsx", r"vendor/recall_notice", "AI notice drafting wired")
    file_must_contain(res, ROOT / "src/App.jsx", r"/admin/compliance", "compliance route mounted")
    return res


# ---------- runner ----------

ALL_CHECKS = {
    "02": check_prd_02,
    "02b": check_prd_02_v2,
    "03": check_prd_03,
    "03b": check_prd_03_v2,
    "04": check_prd_04,
    "05": check_prd_05,
    "05b": check_prd_05_v2,
    "06": check_prd_06,
    "07": check_prd_07,
    "07b": check_prd_07_v2,
    "08": check_prd_08,
    "08b": check_prd_08_v2,
    "09": check_prd_09,
    "10": check_prd_10,
    "10b": check_prd_10_v2,
    "11": check_prd_11,
    "12": check_prd_12,
    "td": check_discovery,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="PRD structural verifier")
    parser.add_argument("--prd", help="Run a single PRD (e.g. 07). Default: all.")
    parser.add_argument("--strict", action="store_true", help="Fail on warnings too.")
    args = parser.parse_args()

    if args.prd:
        if args.prd not in ALL_CHECKS:
            print(f"Unknown PRD: {args.prd}", file=sys.stderr)
            return 2
        targets = {args.prd: ALL_CHECKS[args.prd]}
    else:
        targets = ALL_CHECKS

    any_failed = False
    for key, runner in targets.items():
        res = runner()
        bar = "─" * 72
        status = "PASS" if res.passed and (not args.strict or not res.warnings) else "FAIL"
        print(bar)
        print(f"PRD-{res.prd}: {res.title}  →  {status}")
        print(bar)
        if not res.errors and not res.warnings:
            print("  no issues")
        for e in res.errors:
            print(f"  ✗ {e}")
        for w in res.warnings:
            print(f"  ! {w}")
        if not res.passed or (args.strict and res.warnings):
            any_failed = True

    print("─" * 72)
    print(f"OVERALL: {'FAIL' if any_failed else 'PASS'}")
    return 1 if any_failed else 0


if __name__ == "__main__":
    sys.exit(main())
