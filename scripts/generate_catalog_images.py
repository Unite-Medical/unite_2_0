#!/usr/bin/env python3
"""
Regenerate polished e-commerce hero images for the real catalog using
OpenAI's `images.edit` endpoint with the original Shopify product photo as
a reference.

This is OPTIONAL. The site already works with the real product photos copied
in by `import_catalog.py`. Use this when you want a uniform editorial look
across the catalog (cream / plum brand palette, soft natural lighting,
single-product framing) while preserving the actual product's shape, color,
and branding.

Workflow per product:
  1. Read the row from ALL_PRODUCTS_MASTER.csv.
  2. Open `images/{Category}/{handle}/{handle}_01.{jpg|png}` as the reference.
  3. Build a prompt from the title + first sentence of the description.
  4. Call `client.images.edit(model="gpt-image-2", image=ref, prompt=...)`.
  5. Save to `public/images/products-ai/{handle}.png` (parallel directory so the
     originals stay untouched). To make these the live hero images, re-run
     `import_catalog.py` with the AI versions copied over the originals, or
     swap the path in `imageMap.js`.

Cost (gpt-image-2 high, 1024x1024): ~$0.211/image x 87 = ~$18.40 USD.
Cost (medium):                       ~$0.053/image x 87 = ~$4.60.
Cost (low):                          ~$0.006/image x 87 = ~$0.50.

Usage:
    OPENAI_API_KEY=sk-... python3 scripts/generate_catalog_images.py \
        [--quality medium] [--concurrency 8] [--only handle1,handle2] \
        [--skip-existing] [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import csv
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

try:
    from openai import AsyncOpenAI
    from openai import APIError, APIStatusError, RateLimitError
except ImportError:
    print("ERROR: install the openai package: pip install openai", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent
CATALOG_ROOT = Path("/Users/alex-nt-14/Mavera_Main_Bot/unite_medical_catalog")
PRODUCTS_CSV = CATALOG_ROOT / "csvs" / "ALL_PRODUCTS_MASTER.csv"
SRC_IMAGES = CATALOG_ROOT / "images"
OUT_DIR = ROOT / "public" / "images" / "products-ai"

TYPE_TO_FOLDER = {
    "Orthopedic Devices":  "Orthopedic_Devices",
    "Back Brace":          "Back_Brace",
    "Cervical Collar":     "Cervical_Collar",
    "Supports & Braces":   "Supports_Braces",
    "Diagnostic Tests":    "Diagnostic_Tests",
    "Medical Face Masks":  "Medical_Face_Masks",
    "Medical Gloves":      "Medical_Gloves",
    "Surgical Supplies":   "Surgical_Supplies",
    "Supplements":         "Supplements",
}

CATEGORY_STYLE_HINT = {
    "Orthopedic Devices":  "Show the orthotic device clearly. Emphasize construction details, straps, hinges, and adjustability.",
    "Back Brace":          "Show the back brace flat-laid or on a clean mannequin form. Emphasize straps and panels.",
    "Cervical Collar":     "Show the cervical collar in profile so the contour is legible.",
    "Supports & Braces":   "Show the brace clearly with all straps visible.",
    "Diagnostic Tests":    "Show the test box / packaging prominently with branding readable.",
    "Medical Face Masks":  "Show the mask packaging or a clean stack of masks. Brand details legible.",
    "Medical Gloves":      "Show the glove box with brand panel facing forward. Optional: a single glove flat-laid alongside.",
    "Surgical Supplies":   "Show the product packaging clearly, suitable for an OR or sterile-supply context.",
    "Supplements":         "Show the supplement bottle/container with the label fully visible and branding legible.",
}


# ---------------------------------------------------------------------------
@dataclass
class Job:
    handle: str
    title: str
    summary: str
    product_type: str
    ref_path: Path
    out_path: Path


def short_summary(description: str, max_chars: int = 220) -> str:
    cleaned = re.sub(r"\s+", " ", description or "").strip()
    if len(cleaned) <= max_chars:
        return cleaned
    cut = cleaned[: max_chars - 1]
    last = cut.rfind(". ")
    if last > 80:
        cut = cut[: last + 1]
    return cut.strip()


def build_prompt(title: str, summary: str, product_type: str) -> str:
    style = CATEGORY_STYLE_HINT.get(product_type, "Show the product clearly with all branding readable.")
    return (
        f"Editorial e-commerce product photograph of: {title}.\n\n"
        f"Description: {summary}\n\n"
        f"Composition: single product centered on a soft cream-paper background "
        f"(#f7f2ea fading to #ede5d6). Soft, diffused natural light from a north "
        f"window angle. Subtle warm shadow under the product. {style} The product "
        f"must match the reference image exactly in shape, color, materials, "
        f"label text, and branding details. No people, no extra props, no on-image "
        f"text overlays beyond what is already on the product itself. Clean, "
        f"premium, brand-consistent (Unite Medical · cream paper, ink, restrained "
        f"deep plum #5e2963 only where it appears naturally). High resolution, "
        f"sharp focus, no HDR, no fluorescent cyan."
    )


def find_reference(handle: str, product_type: str) -> Optional[Path]:
    folder = TYPE_TO_FOLDER.get(product_type)
    if not folder:
        return None
    src_dir = SRC_IMAGES / folder / handle
    if not src_dir.exists():
        return None
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        candidate = src_dir / f"{handle}_01{ext}"
        if candidate.exists():
            return candidate
    # fallback: any _01.* file
    for f in sorted(src_dir.glob(f"{handle}_01.*")):
        return f
    # fallback: any image
    for f in sorted(src_dir.iterdir()):
        if f.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            return f
    return None


def load_jobs(only: Optional[set[str]], skip_existing: bool) -> list[Job]:
    jobs: list[Job] = []
    with PRODUCTS_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            handle = row["handle"]
            if only and handle not in only:
                continue
            ptype = row["product_type"]
            ref = find_reference(handle, ptype)
            if ref is None:
                print(f"WARN: no reference image for {handle} ({ptype})", file=sys.stderr)
                continue
            out = OUT_DIR / f"{handle}.png"
            if skip_existing and out.exists():
                continue
            jobs.append(
                Job(
                    handle=handle,
                    title=row["title"].strip(),
                    summary=short_summary(row.get("description", "")),
                    product_type=ptype,
                    ref_path=ref,
                    out_path=out,
                )
            )
    return jobs


# ---------------------------------------------------------------------------
async def edit_one(
    client: AsyncOpenAI,
    job: Job,
    quality: str,
    size: str,
    sem: asyncio.Semaphore,
    progress: dict,
    max_attempts: int = 4,
) -> tuple[Job, bool, Optional[str]]:
    async with sem:
        attempt = 0
        while True:
            attempt += 1
            t0 = time.monotonic()
            try:
                with job.ref_path.open("rb") as f:
                    result = await client.images.edit(
                        model="gpt-image-2",
                        image=f,
                        prompt=build_prompt(job.title, job.summary, job.product_type),
                        size=size,
                        quality=quality,
                        n=1,
                    )
                b64 = result.data[0].b64_json
                job.out_path.write_bytes(base64.b64decode(b64))
                progress["done"] += 1
                done, total = progress["done"], progress["total"]
                dur = time.monotonic() - t0
                print(f"[{done:3d}/{total}] OK   {job.handle} ({dur:.1f}s)", flush=True)
                return job, True, None
            except RateLimitError as e:
                wait = min(60, 2 ** attempt)
                print(f"[{progress['done']:3d}/{progress['total']}] RATE {job.handle} sleep {wait}s ({e})", flush=True)
                await asyncio.sleep(wait)
                if attempt >= max_attempts:
                    progress["done"] += 1
                    return job, False, "rate-limited"
            except (APIError, APIStatusError) as e:
                msg = str(e)[:200]
                print(f"[{progress['done']:3d}/{progress['total']}] ERR  {job.handle} attempt {attempt}: {msg}", flush=True)
                if attempt >= max_attempts:
                    progress["done"] += 1
                    return job, False, msg
                await asyncio.sleep(min(30, 2 ** attempt))
            except Exception as e:  # noqa: BLE001
                msg = f"{type(e).__name__}: {e}"[:200]
                print(f"[{progress['done']:3d}/{progress['total']}] FAIL {job.handle}: {msg}", flush=True)
                progress["done"] += 1
                return job, False, msg


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", default="medium", choices=["low", "medium", "high", "auto"])
    ap.add_argument("--size", default="1024x1024", choices=["1024x1024", "1536x1024", "1024x1536"])
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--only", default="", help="comma-separated handles to render")
    ap.add_argument("--skip-existing", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not set in environment.", file=sys.stderr)
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    only = set(filter(None, [s.strip() for s in args.only.split(",")])) or None
    jobs = load_jobs(only, args.skip_existing)
    if not jobs:
        print("Nothing to do.")
        return 0

    px_cost = {
        "high":   {"1024x1024": 0.211, "1536x1024": 0.165, "1024x1536": 0.165},
        "medium": {"1024x1024": 0.053, "1536x1024": 0.041, "1024x1536": 0.041},
        "low":    {"1024x1024": 0.006, "1536x1024": 0.005, "1024x1536": 0.005},
    }
    est = sum(px_cost.get(args.quality, px_cost["medium"]).get(args.size, 0.06) for _ in jobs)
    print(f"Jobs queued:  {len(jobs)}")
    print(f"Quality:      {args.quality}")
    print(f"Size:         {args.size}")
    print(f"Concurrency:  {args.concurrency}")
    print(f"Output dir:   {OUT_DIR}")
    print(f"Est. cost:    ~${est:.2f} USD")
    print()

    if args.dry_run:
        for j in jobs[:25]:
            print(f"  {j.handle}  ref={j.ref_path.name}  -> {j.out_path.name}")
        if len(jobs) > 25:
            print(f"  ... and {len(jobs) - 25} more")
        return 0

    client = AsyncOpenAI(api_key=api_key)
    sem = asyncio.Semaphore(args.concurrency)
    progress = {"done": 0, "total": len(jobs)}

    t0 = time.monotonic()
    results = await asyncio.gather(
        *(edit_one(client, j, args.quality, args.size, sem, progress) for j in jobs)
    )
    dur = time.monotonic() - t0
    ok = sum(1 for _, success, _ in results if success)
    failed = [(j, err) for j, success, err in results if not success]

    print()
    print(f"Done in {dur:.1f}s. OK: {ok}/{len(jobs)}. Failed: {len(failed)}")
    if failed:
        print("Failures:")
        for j, err in failed[:20]:
            print(f"  {j.handle}: {err}")
    print(f"Output: {OUT_DIR}")
    print()
    print("Next step: to make these the live hero images, swap the path in")
    print("           src/lib/imageMap.js or copy them over the originals.")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
