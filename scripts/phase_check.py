#!/usr/bin/env python3
"""
Phase verifier for the Unite Medical 2.0 rebuild.

Reads docs/PRD.md as ground truth and validates that the codebase
satisfies each phase's exit criteria.

Usage:
    python3 scripts/phase_check.py             # run every phase
    python3 scripts/phase_check.py --phase 1   # single phase
    python3 scripts/phase_check.py --strict    # fail on warnings too

Exit codes:
    0 = every requested phase PASS
    1 = at least one phase FAIL (or --strict + warnings)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
PUBLIC = ROOT / "public"

# ----------------------------------------------------------------------
# Violation reporting
# ----------------------------------------------------------------------


@dataclass
class Violation:
    phase: int
    severity: str  # 'error' | 'warning'
    file: str
    line: int
    rule: str
    snippet: str


@dataclass
class PhaseResult:
    phase: int
    title: str
    violations: list[Violation] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def errors(self) -> list[Violation]:
        return [v for v in self.violations if v.severity == "error"]

    @property
    def warnings(self) -> list[Violation]:
        return [v for v in self.violations if v.severity == "warning"]

    @property
    def passed(self) -> bool:
        return not self.errors


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


SOURCE_GLOBS = ("**/*.jsx", "**/*.js", "**/*.html", "**/*.json", "**/*.css")

# Files that legitimately discuss the old copy (PRD, source spec, scripts).
DOC_EXEMPT_DIRS = {"node_modules", "dist", ".git", "docs", "scripts", "prompts", "forecasting"}

# Files where vendor / tool names (ShipStation, Cin7, QBO, Flexport)
# are legitimately required: the external client code itself and the
# admin-only integration dashboards. Phase-1 rules that match those
# names skip these paths. All OTHER Phase-1 rules (phones, BPA #, etc.)
# still apply.
VENDOR_NAME_RULES = {
    "ShipStation",
    "QuickBooks/QBO",
    "Flexport",
    "Cin7 (customer-facing)",
}
VENDOR_NAME_EXEMPT_PATHS = (
    "src/lib/external/",
    "src/lib/services.js",          # re-export shim
    "src/lib/receiving.js",         # inbound pipeline (names the systems it chains)
    "src/pages/admin/AdminIntegrations.jsx",
    "src/pages/admin/AdminAI.jsx",
    "src/pages/admin/AdminMarginPolicy.jsx",
    "src/pages/admin/AdminSurplus.jsx",
    "src/pages/admin/AdminProductOnboard.jsx",
    "src/pages/QuoteNew.jsx",
)


def iter_source_files() -> Iterable[Path]:
    for pattern in SOURCE_GLOBS:
        for path in ROOT.glob(pattern):
            rel = path.relative_to(ROOT)
            parts = set(rel.parts)
            if parts & DOC_EXEMPT_DIRS:
                continue
            yield path


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def scan(
    files: Iterable[Path],
    pattern: re.Pattern[str] | str,
    *,
    phase: int,
    rule: str,
    severity: str = "error",
) -> list[Violation]:
    rx = re.compile(pattern) if isinstance(pattern, str) else pattern
    out: list[Violation] = []
    for path in files:
        text = read(path)
        for m in rx.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            snip = text.splitlines()[line - 1].strip()[:160]
            out.append(
                Violation(
                    phase=phase,
                    severity=severity,
                    file=str(path.relative_to(ROOT)),
                    line=line,
                    rule=rule,
                    snippet=snip,
                )
            )
    return out


_TAG_RX = re.compile(r"<[^<>]+>")


def _strip_inline_tags(text: str) -> str:
    """Strip inline JSX/HTML tags so required-pattern checks can match
    user-visible copy that interleaves <em>, <Grad>, <strong>, etc."""
    return _TAG_RX.sub("", text)


def require_in_file(
    path: Path, pattern: re.Pattern[str] | str, *, phase: int, rule: str
) -> list[Violation]:
    rx = re.compile(pattern) if isinstance(pattern, str) else pattern
    if not path.exists():
        return [
            Violation(
                phase=phase,
                severity="error",
                file=str(path.relative_to(ROOT)) if path.is_absolute() else str(path),
                line=0,
                rule=f"missing file ({rule})",
                snippet="",
            )
        ]
    text = read(path)
    if rx.search(text) is None and rx.search(_strip_inline_tags(text)) is None:
        return [
            Violation(
                phase=phase,
                severity="error",
                file=str(path.relative_to(ROOT)),
                line=0,
                rule=rule,
                snippet="(required pattern not found)",
            )
        ]
    return []


def forbid_in_file(
    path: Path, pattern: re.Pattern[str] | str, *, phase: int, rule: str
) -> list[Violation]:
    rx = re.compile(pattern) if isinstance(pattern, str) else pattern
    if not path.exists():
        return []
    text = read(path)
    out = []
    for m in rx.finditer(text):
        line = text.count("\n", 0, m.start()) + 1
        snip = text.splitlines()[line - 1].strip()[:160]
        out.append(
            Violation(
                phase=phase,
                severity="error",
                file=str(path.relative_to(ROOT)),
                line=line,
                rule=rule,
                snippet=snip,
            )
        )
    return out


# ----------------------------------------------------------------------
# Phase 1 — Global replacements & layout
# ----------------------------------------------------------------------

FORBIDDEN_PATTERNS: list[tuple[str, str]] = [
    # rule label, regex (case-sensitive unless ?i flag)
    ("old BPA number", r"36C24123A0077"),
    ("MSPV BPA label", r"MSPV\s+BPA"),
    ("old sales phone display", r"\(678\)\s*555-0(142|180|219|255|277)"),
    ("old sales phone tel:", r"tel:\+1?6785550(142|180|219|255|277)"),
    ("old sales phone tel (no +)", r"tel:6785550(142|180|219|255|277)"),
    ("VOSB self-claim", r"\bVOSB\b"),
    # Spec §4h/§4i/§4l explicitly permit:
    #   - "via authorized SDVOSB partner" (BPA partner attribution)
    #   - "SDVOSB partner contract" / "SDVOSB contract channels" (gov page)
    #   - "SDVOSB suppliers" (diversity-network attribution)
    # All three reference an *external* SDVOSB entity, not Unite. Anything
    # outside those contexts is a Unite-side self-claim and is forbidden.
    (
        "SDVOSB self-claim",
        r"\bSDVOSB\b(?!\s+(?:partner|contract|suppliers))",
    ),
    ("wrong founding year", r"EST\.?\s*2018"),
    ("HCPC without S", r"\bHCPC\b(?!S)"),
    ("FOB Atlanta", r"FOB\s+Atlanta"),
    ("12,400 SKUs", r"12,?400\s+SKUs"),
    ("48-hr ship claim", r"48[\s\-]?(?:hr|hour)s?\b"),
    ("4 DCs claim", r"\b(4|Four)\s+DCs?\b"),
    ("4 distribution centers", r"4\s+distribution\s+centers"),
    ("4 domestic warehouses", r"4\s+DOMESTIC\s+WAREHOUSES"),
    ("3 coasts", r"\b3\s+COASTS\b|three\s+time\s+zones"),
    ("Atlanta/Reno/Dallas trio", r"Atlanta,?\s+Reno,?\s+(?:and\s+)?Dallas"),
    ("Dallas warehouse", r"Dallas,?\s+TX"),
    # PRD-00: ghost Dallas warehouse — survived the original sweep
    # because the city + state lived in separate JS fields.
    ("Dallas city literal", r"['\"]Dallas['\"]"),
    ("wh_dal warehouse id", r"\bwh_dal\b"),
    ("PunchOut", r"\bPunch[-\s]?Out\b|\bcXML\b|\bOCI\b"),
    ("ShipStation", r"\bShipStation\b"),
    ("QuickBooks/QBO", r"\bQuickBooks\b|\bQBO\b"),
    ("Flexport", r"\bFlexport\b"),
    ("Cin7 (customer-facing)", r"\bCin7\b"),
    ("22-year military claim", r"\b22[\s\-]?year[s]?\b|two\s+decades"),
    ("U.S. Army (Damon)", r"U\.S\.\s+Army"),
    ("Army logistics officer", r"Army\s+logistics\s+officer"),
    ("Big 3 dig", r"Big[\s\-]?3"),
    # PRD-00: catch-all for any @unitemedical.com address. The specific
    # legacy aliases (sales, support, gov, dealers, vendors) are kept
    # below for clearer error labels, but this rule covers any new
    # offender (e.g., privacy@, damon@, ops@).
    (".com email (catch-all)", r"(?i)@unitemedical\.com"),
    (".com email — sales", r"sales@unitemedical\.com"),
    (".com email — support", r"support@unitemedical\.com"),
    (".com email — gov", r"gov@unitemedical\.com"),
    (".com email — dealers", r"dealers@unitemedical\.com"),
    (".com email — vendors", r"vendors@unitemedical\.com"),
]


def check_phase_1() -> PhaseResult:
    res = PhaseResult(phase=1, title="Global replacements & layout")
    files = list(iter_source_files())

    for label, rx in FORBIDDEN_PATTERNS:
        # Vendor-name rules skip the integration admin pages and the
        # external client folder where these names are required.
        targeted_files = files
        if label in VENDOR_NAME_RULES:
            targeted_files = [
                f for f in files
                if not any(str(f.relative_to(ROOT)).startswith(p) for p in VENDOR_NAME_EXEMPT_PATHS)
            ]
        res.violations.extend(
            scan(targeted_files, rx, phase=1, rule=f"forbidden: {label}")
        )

    # Utility bar (Nav.jsx) must say the new things.
    nav = SRC / "components/layout/Nav.jsx"
    res.violations.extend(
        require_in_file(nav, r"36F79725D0203", phase=1, rule="Nav: new BPA")
    )
    res.violations.extend(
        require_in_file(nav, r"CAGE\s*·\s*8MK70", phase=1, rule="Nav: CAGE row")
    )
    res.violations.extend(
        require_in_file(
            nav,
            r"833\.868\.6483|833-868-6483",
            phase=1,
            rule="Nav: new phone display",
        )
    )
    res.violations.extend(
        require_in_file(
            nav, r"tel:\+18338686483", phase=1, rule="Nav: new tel: href"
        )
    )
    res.violations.extend(
        require_in_file(
            nav, r"Search products", phase=1, rule="Nav: search placeholder"
        )
    )

    # Footer rewrite
    footer = SRC / "components/layout/Footer.jsx"
    res.violations.extend(
        require_in_file(
            footer,
            r"FDA\s*3015727296\s*·\s*CAGE\s*8MK70\s*·\s*DUNS\s*117553945",
            phase=1,
            rule="Footer: cleaned credential line",
        )
    )
    res.violations.extend(
        require_in_file(
            footer,
            r"Veteran-owned wholesale medical supply\.\s*<",
            phase=1,
            rule="Footer: tagline no Big-3",
        )
    )
    res.violations.extend(
        forbid_in_file(
            footer, r"View all 12,?400 SKUs", phase=1, rule="Footer: no SKU count"
        )
    )

    return res


# ----------------------------------------------------------------------
# Phase 2 — Routes & redirects
# ----------------------------------------------------------------------

REQUIRED_REDIRECTS = [
    ("/pages/pdac-consulting", "/services/pdac"),
    ("/pages/about-us", "/about"),
    ("/pages/contact-us", "/contact"),
    ("/pages/dealer-program", "/services/distributors"),
    ("/pages/private-labeling", "/services/private-label"),
    ("/pages/pdac-approval-letters", "/services/pdac"),
    ("/blogs/orthopedic-insights", "/blog"),
    ("/solutions", "/services"),
    ("/services/education", "/blog"),
    ("/services/dealer", "/services/distributors"),
    ("/about/veteran-owned", "/procurement"),
    ("/segments/gov", "/government"),
]

REQUIRED_ROUTES = [
    "/government",
    "/services/private-label",
    "/services/distributors",
    "/case-studies/tjs",
]


def check_phase_2() -> PhaseResult:
    res = PhaseResult(phase=2, title="Routes & redirects")
    vercel = ROOT / "vercel.json"
    if not vercel.exists():
        res.violations.append(
            Violation(
                phase=2,
                severity="error",
                file="vercel.json",
                line=0,
                rule="missing vercel.json",
                snippet="",
            )
        )
        return res

    try:
        cfg = json.loads(vercel.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        res.violations.append(
            Violation(
                phase=2,
                severity="error",
                file="vercel.json",
                line=0,
                rule=f"invalid JSON: {e}",
                snippet="",
            )
        )
        return res

    redirects = {(r["source"], r["destination"]) for r in cfg.get("redirects", [])}
    for src_path, dest in REQUIRED_REDIRECTS:
        if (src_path, dest) not in redirects:
            res.violations.append(
                Violation(
                    phase=2,
                    severity="error",
                    file="vercel.json",
                    line=0,
                    rule=f"missing redirect {src_path} → {dest}",
                    snippet="",
                )
            )

    # Wildcard collection redirect
    has_collections = any(
        r["source"].startswith("/collections/")
        and r["destination"] == "/catalog"
        for r in cfg.get("redirects", [])
    )
    if not has_collections:
        res.violations.append(
            Violation(
                phase=2,
                severity="error",
                file="vercel.json",
                line=0,
                rule="missing /collections/* → /catalog wildcard redirect",
                snippet="",
            )
        )

    # New routes must be in App.jsx
    app = SRC / "App.jsx"
    app_text = read(app)
    for route in REQUIRED_ROUTES:
        if f'path="{route}"' not in app_text:
            res.violations.append(
                Violation(
                    phase=2,
                    severity="error",
                    file="src/App.jsx",
                    line=0,
                    rule=f"missing <Route path=\"{route}\">",
                    snippet="",
                )
            )

    # Sitemap should mention key routes
    sitemap = PUBLIC / "sitemap.xml"
    if sitemap.exists():
        st = read(sitemap)
        for route in REQUIRED_ROUTES:
            if route not in st:
                res.violations.append(
                    Violation(
                        phase=2,
                        severity="warning",
                        file="public/sitemap.xml",
                        line=0,
                        rule=f"sitemap missing {route}",
                        snippet="",
                    )
                )

    return res


# ----------------------------------------------------------------------
# Phase 3 — Page rewrites
# ----------------------------------------------------------------------

PAGE_CHECKS: list[tuple[str, list[tuple[str, str]], list[tuple[str, str]]]] = [
    # (page_path_relative_to_src, required[(rule, regex)], forbidden[(rule, regex)])
    (
        "pages/Homepage.jsx",
        [
            ("hero H1", r"The supply chain your suppliers use\."),
            ("two ways to buy", r"Two ways to buy"),
            ("partner spotlight", r"PARTNER SPOTLIGHT"),
            ("same-day stat", r"Same-day"),
        ],
        [
            ("old hero copy", r"behind\s*<\/Grad>"),
            ("1.24M units claim", r"1\.24M"),
        ],
    ),
    (
        "pages/About.jsx",
        [
            ("new H1", r"Built on discipline\. Driven by demand\."),
            ("letter from Damon", r"A letter from Damon"),
            ("Jackie S. card", r"Jackie\s*S\."),
        ],
        [],
    ),
    (
        "pages/Services.jsx",
        [
            ("distribution card", r"Distribution\s*&\s*Fulfillment"),
            ("pdac card", r"PDAC Consulting"),
            ("quoting card", r"Quoting\s*&\s*Sourcing"),
            ("distributor card", r"Distributor Program"),
        ],
        [
            ("education card removed", r"Education\s*&\s*CEU"),
        ],
    ),
    (
        "pages/ServiceDistribution.jsx",
        [
            ("forward warehouse H1", r"Your forward warehouse\."),
            ("2 US warehouses", r"2\s+US\s+warehouses|Two\s+US\s+warehouses"),
            ("fill rate stat", r"98\.6%"),
            ("net-30 qualifier", r"approved credit"),
        ],
        [],
    ),
    (
        "pages/ServicePDAC.jsx",
        [
            ("L-codes headline", r"L-codes right the first time"),
            ("HCPCS mention", r"HCPCS"),
            ("95% stat", r"95%\+"),
        ],
        [
            ("180+ submissions", r"180\+"),
            ("$2,400 per L-code", r"\$2,?400"),
        ],
    ),
    (
        "pages/Procurement.jsx",
        [
            ("procurement H1", r"For procurement\s*&\s*diversity officers\."),
        ],
        [
            ("22 years Army", r"22\s+years"),
        ],
    ),
    (
        "pages/Compliance.jsx",
        [
            ("ISO pursuit", r"Pursuing ISO 13485"),
        ],
        [
            ("SOC 2 claim", r"SOC\s*2"),
            ("cold chain claim", r"Cold\s+chain"),
            ("48 SKUs claim", r"48\s+SKUs"),
        ],
    ),
    (
        "pages/Locations.jsx",
        [
            ("locations H1", r"Close to every dock\."),
            ("2 US warehouses badge", r"2\s+US\s+WAREHOUSES"),
        ],
        [],
    ),
    (
        "pages/Contact.jsx",
        [
            ("call us H1", r"Call us\. We answer\."),
            ("distributor program option", r"Distributor program"),
            ("document request option", r"Document request"),
            ("pdac consulting option", r"PDAC consulting"),
        ],
        [],
    ),
    (
        "pages/Support.jsx",
        [
            ("FAQ JSON-LD", r"FAQPage"),
            ("MOQ FAQ", r"minimum order quantities"),
            ("EDI FAQ", r"EDI"),
        ],
        [],
    ),
    (
        "pages/Quote.jsx",
        [],
        [
            ("CORE IP exposure", r"CORE\s+IP"),
            ("Shanghai factory", r"Shanghai"),
            ("60% margin", r"60%\s*MARGIN"),
            ("AI cover letter", r"AI\s+COVER\s+LETTER"),
        ],
    ),
    (
        "pages/Catalog.jsx",
        [],
        [
            ("12,400 in catalog", r"12,?400"),
        ],
    ),
    (
        "pages/segments/SegmentASC.jsx",
        [("ASC H1", r"Ambulatory Surgery Centers")],
        [],
    ),
    (
        "pages/segments/SegmentPharmacy.jsx",
        [("pharmacy H1", r"Independent Pharmacies")],
        [],
    ),
    (
        "pages/segments/SegmentEMS.jsx",
        [("EMS H1", r"EMS\s*&\s*First Responders")],
        [],
    ),
    (
        "pages/segments/SegmentDealers.jsx",
        [("distributors H1", r"Regional Medical Distributors")],
        [],
    ),
    (
        "pages/Blog.jsx",
        [],
        [
            ("placeholder article #1", r"Tariff volatility, Q2 2026"),
            ("placeholder article #2", r"McKesson is spinning off"),
            ("placeholder article #3", r"Procedure bundles 101"),
            ("placeholder article #4", r"The MSPV BPA, in plain English"),
        ],
    ),
]


def check_phase_3() -> PhaseResult:
    res = PhaseResult(phase=3, title="Page content rewrites")
    for rel, required, forbidden in PAGE_CHECKS:
        path = SRC / rel
        for rule, rx in required:
            res.violations.extend(
                require_in_file(path, rx, phase=3, rule=f"{rel}: {rule}")
            )
        for rule, rx in forbidden:
            res.violations.extend(
                forbid_in_file(path, rx, phase=3, rule=f"{rel}: {rule}")
            )
    return res


# ----------------------------------------------------------------------
# Phase 4 — New pages & features
# ----------------------------------------------------------------------


def check_phase_4() -> PhaseResult:
    res = PhaseResult(phase=4, title="New pages & features")

    # New page files
    for rel in (
        "pages/CaseStudyTJS.jsx",
        "pages/Government.jsx",
        "pages/ServicePrivateLabel.jsx",
        "pages/ServiceDistributors.jsx",
    ):
        path = SRC / rel
        if not path.exists():
            res.violations.append(
                Violation(
                    phase=4,
                    severity="error",
                    file=f"src/{rel}",
                    line=0,
                    rule=f"missing new page {rel}",
                    snippet="",
                )
            )

    # Testimonials data — exactly the 3 approved authors
    test_file = SRC / "data/testimonials.js"
    if test_file.exists():
        text = read(test_file)
        for needle in ("Sarah C.", "Kareem H.", '"D. V."'):
            if needle.strip('"') not in text:
                res.violations.append(
                    Violation(
                        phase=4,
                        severity="error",
                        file="src/data/testimonials.js",
                        line=0,
                        rule=f"missing testimonial entry: {needle}",
                        snippet="",
                    )
                )
    else:
        res.violations.append(
            Violation(
                phase=4,
                severity="error",
                file="src/data/testimonials.js",
                line=0,
                rule="missing testimonials data file",
                snippet="",
            )
        )

    # FAQ data
    faq_file = SRC / "data/faqs.js"
    if not faq_file.exists():
        res.violations.append(
            Violation(
                phase=4,
                severity="error",
                file="src/data/faqs.js",
                line=0,
                rule="missing FAQ data file",
                snippet="",
            )
        )

    # Account approval helper
    aa = SRC / "lib/accountApproval.js"
    if aa.exists():
        text = read(aa)
        if "evaluateAccount" not in text:
            res.violations.append(
                Violation(
                    phase=4,
                    severity="error",
                    file="src/lib/accountApproval.js",
                    line=0,
                    rule="missing evaluateAccount export",
                    snippet="",
                )
            )
    else:
        res.violations.append(
            Violation(
                phase=4,
                severity="error",
                file="src/lib/accountApproval.js",
                line=0,
                rule="missing accountApproval helper",
                snippet="",
            )
        )

    # Lot tracking schema
    lot_sql = ROOT / "docs/schema/lot_tracking.sql"
    if not lot_sql.exists():
        res.violations.append(
            Violation(
                phase=4,
                severity="error",
                file="docs/schema/lot_tracking.sql",
                line=0,
                rule="missing lot_tracking schema",
                snippet="",
            )
        )

    return res


# ----------------------------------------------------------------------
# Driver
# ----------------------------------------------------------------------

PHASE_FNS: dict[int, Callable[[], PhaseResult]] = {
    1: check_phase_1,
    2: check_phase_2,
    3: check_phase_3,
    4: check_phase_4,
}


def print_phase(res: PhaseResult, *, strict: bool) -> bool:
    bar = "─" * 72
    print(bar)
    status = "PASS" if res.passed and (not strict or not res.warnings) else "FAIL"
    print(f"Phase {res.phase}: {res.title}  →  {status}")
    print(bar)
    if not res.violations:
        print("  no violations")
        return res.passed and (not strict or not res.warnings)

    by_rule: dict[str, list[Violation]] = {}
    for v in res.violations:
        by_rule.setdefault(v.rule, []).append(v)
    for rule, vs in by_rule.items():
        head = f"  [{vs[0].severity.upper()}] {rule}"
        print(head)
        for v in vs[:20]:
            loc = f"{v.file}:{v.line}" if v.line else v.file
            print(f"     · {loc}")
            if v.snippet:
                print(f"         {v.snippet}")
        if len(vs) > 20:
            print(f"     · …and {len(vs) - 20} more")
    return res.passed and (not strict or not res.warnings)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", type=int, choices=sorted(PHASE_FNS))
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    phases = [args.phase] if args.phase else sorted(PHASE_FNS)
    all_pass = True
    for p in phases:
        ok = print_phase(PHASE_FNS[p](), strict=args.strict)
        all_pass = all_pass and ok

    print("─" * 72)
    print("OVERALL:", "PASS" if all_pass else "FAIL")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
