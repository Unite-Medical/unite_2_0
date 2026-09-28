#!/usr/bin/env python3
"""Compatibility entry point for the official-artwork SVG icon renderer."""
import subprocess
from pathlib import Path
subprocess.run(['node', str(Path(__file__).with_suffix('.mjs'))], check=True)
