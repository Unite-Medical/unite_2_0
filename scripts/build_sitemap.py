#!/usr/bin/env python3
"""Compatibility command: regenerate the canonical sitemap from the build's route list."""
from pathlib import Path
import subprocess

if __name__ == "__main__":
    raise SystemExit(subprocess.call(["node", "scripts/sitemap.mjs"], cwd=Path(__file__).resolve().parent.parent))
