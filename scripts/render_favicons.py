#!/usr/bin/env python3
"""
Render the Unite Medical logomark to a full favicon / app-icon set.

Outputs all of the following into /public:
    favicon.ico              (multi-resolution: 16, 32, 48)
    favicon-16.png
    favicon-32.png
    favicon-96.png
    favicon-180.png          (apple-touch-icon)
    favicon-192.png          (PWA manifest)
    favicon-512.png          (PWA manifest)
    apple-touch-icon.png     (alias of -180)
    favicon.svg              (vector logomark, for browsers that support it)
    site.webmanifest         (PWA manifest pointing at the icons above)

Re-uses the same gradient + UM glyph drawn by render_logo_mark.py so the
favicon matches the in-app brand mark exactly.

The product hero logomark is also re-rendered so a single run of this
script keeps everything in sync. Pure PIL — no cairo / librsvg needed.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "images" / "source"

# Precision system: solid surgical-green field, bone glyph, sharp radius.
FIELD = (0x1D, 0x5C, 0x4D)  # surgical green
GLYPH = (0xF3, 0xF2, 0xEB)  # bone
CORNER_RATIO = 0.14


def make_gradient(size: int) -> Image.Image:
    """Flat brand field (name kept for call-site compatibility)."""
    arr = np.zeros((size, size, 3), dtype=np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = FIELD
    return Image.fromarray(arr, mode="RGB")


def round_rect_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [(0, 0), (size - 1, size - 1)], radius=radius, fill=255
    )
    return mask


def draw_um_glyph(img: Image.Image, size: int) -> None:
    """Draws the abstract UM glyph from src/components/shared/Logo.jsx
    inside the rounded square."""
    mark_w = int(size * 0.62)
    mark_h = int(size * 0.50)
    mark_x = (size - mark_w) // 2
    mark_y = (size - mark_h) // 2

    # SVG viewBox is 24 x 20.
    sx = mark_w / 24
    sy = mark_h / 20
    stroke = max(1, round(2.6 * sx))
    cap_radius = stroke // 2

    def to_canvas(x, y):
        return (mark_x + x * sx, mark_y + y * sy)

    draw = ImageDraw.Draw(img, "RGBA")
    white = (*GLYPH, 255)
    white92 = (*GLYPH, int(255 * 0.92))

    # Path 1 — U: M3 3v9a5 5 0 0 0 10 0V3
    draw.line([to_canvas(3, 3), to_canvas(3, 12)], fill=white, width=stroke)
    draw.line([to_canvas(13, 3), to_canvas(13, 12)], fill=white, width=stroke)
    arc_box = [to_canvas(3, 7), to_canvas(13, 17)]
    draw.arc(arc_box, start=0, end=180, fill=white, width=stroke)
    for cx, cy in [to_canvas(3, 3), to_canvas(13, 3)]:
        draw.ellipse(
            [(cx - cap_radius, cy - cap_radius), (cx + cap_radius, cy + cap_radius)],
            fill=white,
        )

    # Path 2 — M-ish: M13 17V9 l4 5 l4 -5 v8 (92% opacity)
    pts = [to_canvas(x, y) for x, y in [(13, 17), (13, 9), (17, 14), (21, 9), (21, 17)]]
    if hasattr(draw, "line"):
        draw.line(pts, fill=white92, width=stroke, joint="curve")
    for cx, cy in pts:
        draw.ellipse(
            [(cx - cap_radius, cy - cap_radius), (cx + cap_radius, cy + cap_radius)],
            fill=white92,
        )


def render(size: int, padding: float = 0.0) -> Image.Image:
    """Returns an RGBA Image of the logomark sized for the given pixel size.
    `padding` (0..0.2) shrinks the icon inside the canvas — useful for
    Apple touch icons which want some safe-area inset.
    """
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    inner_size = size if padding <= 0 else int(size * (1 - 2 * padding))
    if inner_size < 8:
        inner_size = size
    radius = max(2, int(inner_size * CORNER_RATIO))
    grad = make_gradient(inner_size)
    mask = round_rect_mask(inner_size, radius)
    sub = Image.new("RGBA", (inner_size, inner_size), (255, 255, 255, 0))
    sub.paste(grad, (0, 0), mask=mask)
    draw_um_glyph(sub, inner_size)
    if inner_size != size:
        offset = (size - inner_size) // 2
        canvas.paste(sub, (offset, offset), mask=sub)
    else:
        canvas = sub
    return canvas


def write_svg() -> Path:
    """Writes a vector logomark for browsers that prefer SVG favicons.
    Geometry mirrors src/components/shared/Logo.jsx exactly."""
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect x="0" y="0" width="1024" height="1024" rx="144" ry="144" fill="#{"%02x%02x%02x" % FIELD}"/>
  <g transform="translate(195 256) scale(26.46 25.6)" fill="none" stroke="#{"%02x%02x%02x" % GLYPH}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3v9a5 5 0 0 0 10 0V3"/>
    <path d="M13 17V9l4 5 4-5v8" opacity="0.92"/>
  </g>
</svg>'''
    out = PUBLIC / "favicon.svg"
    out.write_text(svg.strip())
    return out


def main() -> int:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)

    # Re-render the source 1024 PNG used by image-edit references.
    big = render(1024)
    (SOURCE / "um-logo-mark.png").write_bytes(b"")  # placeholder for consistency
    big.save(SOURCE / "um-logo-mark.png", "PNG")
    print(f"  source/um-logo-mark.png  ({big.size[0]}x{big.size[1]})")

    # Standard favicon PNGs.
    sizes = {
        "favicon-16.png": (16, 0.0),
        "favicon-32.png": (32, 0.0),
        "favicon-96.png": (96, 0.0),
        "favicon-180.png": (180, 0.06),       # apple-touch-icon — needs inset
        "favicon-192.png": (192, 0.0),        # PWA
        "favicon-512.png": (512, 0.0),        # PWA + share previews
    }
    for name, (size, pad) in sizes.items():
        img = render(size, padding=pad)
        out = PUBLIC / name
        img.save(out, "PNG", optimize=True)
        print(f"  {name:<22} ({size}x{size}, {out.stat().st_size:,} bytes)")

    # apple-touch-icon alias for the iOS Safari sniffer that just looks for the
    # exact filename.
    apple = render(180, padding=0.06)
    apple.save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)
    print(f"  apple-touch-icon.png   (180x180)")

    # Multi-resolution .ico for legacy browsers + Windows pinned tabs.
    ico_sizes = [render(48), render(32), render(16)]
    ico_path = PUBLIC / "favicon.ico"
    ico_sizes[0].save(
        ico_path,
        format="ICO",
        sizes=[(48, 48), (32, 32), (16, 16)],
        append_images=ico_sizes[1:],
    )
    print(f"  favicon.ico            (16/32/48 multi-res, {ico_path.stat().st_size:,} bytes)")

    # SVG vector favicon for modern browsers.
    svg_path = write_svg()
    print(f"  {svg_path.name}            ({svg_path.stat().st_size:,} bytes)")

    # PWA manifest.
    manifest = {
        "name": "Unite Medical",
        "short_name": "Unite Medical",
        "description": "Veteran-owned wholesale medical supply.",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#f3f2eb",
        "theme_color": "#0e1713",
        "icons": [
            {"src": "/favicon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/favicon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/favicon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    }
    (PUBLIC / "site.webmanifest").write_text(json.dumps(manifest, indent=2))
    print(f"  site.webmanifest")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
