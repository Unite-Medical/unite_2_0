#!/usr/bin/env python3
"""Generate src/data/hcpcs.json from the official CMS HCPCS Level II file.

PRD-29 §6.3 — the Resources page must run on the real public CMS dataset,
not fabricated rows. Download the current quarterly "Alpha-Numeric HCPCS
File (ZIP)" from:

    https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update

unzip it, and point this script at the fixed-width .txt inside
(e.g. HCPC2026_JUL_ANWEB_06172026.txt):

    python3 scripts/import_hcpcs.py /path/to/HCPC2026_JUL_ANWEB_06172026.txt "July 2026"

Record layout (from HCPC_recordlayout.txt): code = cols 1-5, record type =
cols 9-11 (3 = first line of a procedure record, 4 = continuation of the
long description), long description = cols 12-91. HCPCS Level II is public
domain (unlike AMA-copyrighted CPT Level I, which is not in this file).
"""

import json
import sys
from pathlib import Path

FAMILY_LABELS = {
    'A': 'A · Supplies & ambulance',
    'B': 'B · Enteral & parenteral',
    'C': 'C · Hospital outpatient (OPPS)',
    'E': 'E · Durable medical equipment',
    'G': 'G · Procedures & services',
    'H': 'H · Behavioral health',
    'J': 'J · Drugs (non-oral)',
    'K': 'K · DMEPOS (temporary)',
    'L': 'L · Orthotics & prosthetics',
    'M': 'M · Medical services',
    'P': 'P · Pathology & lab',
    'Q': 'Q · Temporary codes',
    'R': 'R · Diagnostic radiology',
    'S': 'S · Private payer (non-Medicare)',
    'T': 'T · State Medicaid',
    'U': 'U · Coronavirus lab',
    'V': 'V · Vision & hearing',
}


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    updated = sys.argv[2]  # e.g. "July 2026"

    recs, order = {}, []
    with src.open(encoding='latin-1') as f:
        for line in f:
            code = line[0:5].strip()
            try:
                rectype = int(line[8:11])
            except ValueError:
                continue
            desc = line[11:91].rstrip()
            if rectype == 3:  # procedure record (skip 7/8 = modifiers)
                recs[code] = [desc]
                order.append(code)
            elif rectype == 4 and code in recs:
                recs[code].append(desc)

    codes = [[c, ' '.join(p.strip() for p in recs[c]).strip()] for c in order]
    out = {
        'source': 'CMS HCPCS Level II Alpha-Numeric File',
        'updated': updated,
        'families': FAMILY_LABELS,
        'codes': codes,
    }

    dest = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'hcpcs.json'
    dest.write_text(json.dumps(out, separators=(',', ':')), encoding='utf-8')
    print(f'Wrote {len(codes)} codes ({updated}) -> {dest}')


if __name__ == '__main__':
    main()
