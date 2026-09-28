#!/usr/bin/env python3
"""Render the approved Unite artwork; do not recreate the mark with generic glyphs."""
import subprocess
from pathlib import Path
subprocess.run(['node', str(Path(__file__).with_name('render_favicons.mjs'))], check=True)
