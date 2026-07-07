#!/usr/bin/env python3
"""
One-shot global text substitutions for Phase 1 of the Unite Medical 2.0
rebuild. Runs the safe, mechanical find/replace rules from §3c of the
CTO spec across every source file.

This is intentionally text-level (not regex-driven semantic refactor).
Complex copy that needs more than substitution is handled in Phase 3 by
hand-edited page rewrites. After running this, `scripts/phase_check.py
--phase 1` should drop dramatically.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
PUBLIC = ROOT / "public"

# Targets: .jsx/.js/.html/.json/.css under the repo, skipping vendored dirs.
EXCLUDE = {"node_modules", "dist", ".git"}


def target_files() -> list[Path]:
    out: list[Path] = []
    for pat in ("**/*.jsx", "**/*.js", "**/*.html", "**/*.json", "**/*.css"):
        for p in ROOT.glob(pat):
            rel = p.relative_to(ROOT)
            if set(rel.parts) & EXCLUDE:
                continue
            # Skip our own tooling.
            if rel.parts[0] == "scripts":
                continue
            if rel.parts[0] == "docs":
                continue
            out.append(p)
    return out


# ----------------------------------------------------------------------
# Replacement rules
# ----------------------------------------------------------------------

# Phone numbers (display) — both spaces and unicode-ish variants
PHONE_NUMS = ("0142", "0180", "0219", "0255", "0277")

# (regex pattern, replacement). Order matters.
RULES: list[tuple[re.Pattern[str], str]] = []

# Credentials
# Per Damon 2026-06-29: contract number is 36C24123A0077, labeled "MSPV BPA".
RULES.append((re.compile(r"36F79725D0203"), "36C24123A0077"))
RULES.append((re.compile(r"(?<!MSPV )BPA(?= ?[·:]? ?36C24123A0077)"), "MSPV BPA"))
RULES.append((re.compile(r"MSPV-NG"), "MSPV-NG"))  # keep — different concept

# Phone display
for tail in PHONE_NUMS:
    RULES.append(
        (re.compile(rf"\(678\)\s*555-{tail}"), "833.868.6483")
    )
# Phone tel: hrefs (with or without +1). NB: 678-555-NNNN -> 67855NNNN in the
# tel: form, no extra digit.
for tail in PHONE_NUMS:
    body = f"678555{tail}"
    RULES.append((re.compile(rf"tel:\+1?{body}"), "tel:+18338686483"))
    RULES.append((re.compile(rf"tel:{body}"), "tel:+18338686483"))

# Founding year, HCPCS typo, FOB
RULES.append((re.compile(r"EST\.\s*2018"), "EST. 2019"))
RULES.append((re.compile(r"founded in 2018"), "founded in 2019"))
RULES.append((re.compile(r"Founded in 2018"), "Founded in 2019"))
RULES.append((re.compile(r"\bHCPC\b(?!S)"), "HCPCS"))
RULES.append((re.compile(r"FOB Atlanta"), "FOB Georgia"))

# SKU count copy
RULES.append((re.compile(r"12,400 SKUs"), "stocked catalog"))
RULES.append((re.compile(r"all 12,400 SKUs"), "the full catalog"))
RULES.append((re.compile(r"View all 12,400 SKUs"), "Browse products"))
RULES.append((re.compile(r"See all 12,400 SKUs"), "Browse the catalog"))
RULES.append((re.compile(r"Search 12,400 SKUs"), "Search products"))
RULES.append((re.compile(r"Browse 12,400 SKUs"), "Browse the catalog"))

# Shipping/logistics
RULES.append(
    (
        re.compile(r"48-hour median ship from Atlanta, Reno, and Dallas"),
        "Same-day shipping on orders before 2pm EST from Georgia & Nevada",
    )
)
RULES.append(
    (
        re.compile(r"48-hour median ship from Atlanta · Reno · Dallas"),
        "Same-day shipping on orders before 2pm EST from Georgia & Nevada",
    )
)
RULES.append(
    (
        re.compile(r"48-hour median ship"),
        "Same-day shipping on orders before 2pm EST",
    )
)
RULES.append(
    (re.compile(r"48-hr median ship"), "Same-day shipping (orders by 2pm EST)")
)
RULES.append(
    (
        re.compile(r"48 hour median"),
        "Same-day shipping on orders before 2pm EST",
    )
)
RULES.append((re.compile(r"\b48 hr\b"), "Same-day"))
RULES.append((re.compile(r"\b48-hr\b"), "Same-day"))
RULES.append((re.compile(r"\b48 hours\b"), "the same day"))
RULES.append((re.compile(r"Median 48 hours"), "Same-day"))

# Warehouse count
RULES.append((re.compile(r"4 DCs"), "2 US warehouses"))
RULES.append((re.compile(r"Four DCs"), "2 US warehouses"))
RULES.append((re.compile(r"4 distribution centers"), "2 US warehouses"))
RULES.append((re.compile(r"4 DOMESTIC WAREHOUSES"), "2 US WAREHOUSES"))
RULES.append((re.compile(r"3 US warehouses"), "2 US warehouses"))
RULES.append((re.compile(r"From 3 US warehouses\."), "From 2 US warehouses."))
RULES.append((re.compile(r"\b3 COASTS\b"), ""))
RULES.append((re.compile(r"\bthree time zones\b"), ""))

# Atlanta/Reno/Dallas trio + Dallas alone
RULES.append((re.compile(r"Atlanta, Reno, and Dallas"), "Georgia & Nevada"))
RULES.append((re.compile(r"Atlanta, Reno, Dallas"), "Georgia & Nevada"))
RULES.append((re.compile(r"Atlanta · Reno · Dallas"), "Georgia · Nevada"))
RULES.append((re.compile(r"Atlanta, Reno"), "Georgia, Nevada"))
RULES.append((re.compile(r"Reno · Atlanta · Dallas"), "Georgia · Nevada"))
RULES.append((re.compile(r"\bDallas, TX\b"), "Reno, NV"))

# Net-30 / onboarding qualifier
RULES.append((re.compile(r"Net-30 standard"), "Net-30 with approved credit"))
RULES.append(
    (re.compile(r"net-30 clock starts"), "net-30 clock starts (approved credit)")
)

# Internal tooling exposure
RULES.append((re.compile(r"\bShipStation\b"), "our WMS"))
RULES.append((re.compile(r"\bQuickBooks\b"), "our billing system"))
RULES.append((re.compile(r"\bQBO\b"), "our billing system"))
RULES.append((re.compile(r"\bcXML\b/OCI"), "EDI"))
RULES.append((re.compile(r"\bcXML\b"), "EDI"))
RULES.append((re.compile(r"\bOCI\b"), "EDI"))
RULES.append((re.compile(r"Punch-?out \(EDI\)"), "EDI"))
RULES.append((re.compile(r"Punch-?out\b"), "EDI"))
RULES.append((re.compile(r"\bPunchOut\b"), "EDI"))
RULES.append((re.compile(r"\bFlexport\b"), "our freight forwarder"))

# Bio / military corrections
RULES.append((re.compile(r"22-year U\.S\. Army logistics officer"), "8-year Alabama Army National Guard veteran (MOS 13E/13P)"))
RULES.append((re.compile(r"22-year U\.S\. Army"), "8-year Alabama Army National Guard"))
RULES.append((re.compile(r"22 years"), "8 years"))
RULES.append((re.compile(r"22-year"), "8-year"))
RULES.append((re.compile(r"\btwo decades\b"), "8 years"))
RULES.append((re.compile(r"U\.S\. Army"), "Alabama Army National Guard"))
RULES.append((re.compile(r"Army logistics officer"), "fire direction NCO (MOS 13E/13P)"))
RULES.append((re.compile(r"Army logistics veteran"), "Army National Guard veteran"))

# Competitor / tone
RULES.append((re.compile(r"Big 3 can'?t serve well\."), ""))
RULES.append((re.compile(r"the channels the Big 3 can'?t serve well"), "underserved buyers"))
RULES.append((re.compile(r"Big 3 can'?t serve\."), "underserved buyers."))
RULES.append((re.compile(r"\bBig 3\b"), "the majors"))
RULES.append((re.compile(r"\bBig-3\b"), "the majors"))

# Cert claims to delete
RULES.append((re.compile(r"\bSDVOSB-verified\."), "Veteran-owned."))
RULES.append((re.compile(r"\bSDVOSB[-\s]?verified"), "veteran-owned"))
RULES.append((re.compile(r", SDVOSB"), ""))
RULES.append((re.compile(r"\bSDVOSB\b"), "veteran-owned"))
RULES.append(
    (
        re.compile(r"Service-Disabled Veteran-Owned Small Business"),
        "Veteran-owned business",
    )
)
RULES.append((re.compile(r"VOSB / Berry compliant"), "Veteran-owned / Berry compliant"))
RULES.append((re.compile(r"\bVOSB\b"), "Veteran-owned"))

# Email domains
RULES.append((re.compile(r"sales@unitemedical\.com"), "sales@unitemedical.net"))
RULES.append((re.compile(r"support@unitemedical\.com"), "support@unitemedical.net"))
RULES.append((re.compile(r"gov@unitemedical\.com"), "info@unitemedical.net"))
RULES.append((re.compile(r"dealers@unitemedical\.com"), "sales@unitemedical.net"))
RULES.append((re.compile(r"vendors@unitemedical\.com"), "info@unitemedical.net"))
RULES.append((re.compile(r"miguel@unitemedical\.com"), "sales@unitemedical.net"))

# Misc
RULES.append((re.compile(r"VHA procurement\. "), ""))


def main() -> None:
    total_changes = 0
    files_touched = 0
    for path in target_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        original = text
        local_changes = 0
        for rx, repl in RULES:
            new_text, n = rx.subn(repl, text)
            if n:
                local_changes += n
                text = new_text
        if local_changes:
            path.write_text(text, encoding="utf-8")
            files_touched += 1
            total_changes += local_changes
            print(f"  {path.relative_to(ROOT)}: {local_changes} replacements")
    print(f"\n{files_touched} files touched, {total_changes} total replacements.")


if __name__ == "__main__":
    main()
