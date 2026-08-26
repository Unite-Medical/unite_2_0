#!/usr/bin/env python3
from pathlib import Path
import re
base = Path(__file__).resolve().parents[1] / "docs/walkthrough_audio"
for src in sorted(base.glob("Devine_Ruedi_*.txt")):
    if src.stem.endswith("_reflow"):
        continue
    text = src.read_text(encoding="utf-8")
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text.strip())
    out = src.with_name(f"{src.stem}_reflow.txt")
    out.write_text("\n".join(s.strip() for s in sentences if s.strip()) + "\n", encoding="utf-8")
    print(f"{out.name}: {len(sentences)} lines, {len(text)} chars")
