#!/usr/bin/env python3
"""
Import the real Unite Medical product catalog (scraped from the live Shopify
store) into the Unite 2.0 site:

  1. Parse  ALL_PRODUCTS_MASTER.csv  +  ALL_VARIANTS.csv
  2. Map Shopify product_type / collections -> the site's existing category
     vocabulary (Orthotics, Diagnostics, PPE, Wound Care, Pharmaceuticals,
     Equipment, Supplements).
  3. Copy every downloaded product photo from the catalog directory to
     `public/images/products/{handle}/{handle}_NN.jpg|png` so the React app
     can serve them statically.
  4. Emit a single JavaScript module at `src/data/realCatalog.js` that the
     in-browser DB seed loads instead of the legacy 16-row STATIC_PRODUCTS.

Run:
    python3 scripts/import_catalog.py            # default: copy + emit JS
    python3 scripts/import_catalog.py --no-copy  # only regenerate JS module
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Iterable

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
CATALOG_ROOT = Path("/Users/alex-nt-14/Mavera_Main_Bot/unite_medical_catalog")
CSV_DIR = CATALOG_ROOT / "csvs"
PRODUCTS_CSV = CSV_DIR / "ALL_PRODUCTS_MASTER.csv"
VARIANTS_CSV = CSV_DIR / "ALL_VARIANTS.csv"
SRC_IMAGES = CATALOG_ROOT / "images"

OUT_IMAGES = ROOT / "public" / "images" / "products"
OUT_JS = ROOT / "src" / "data" / "realCatalog.js"

# ---------------------------------------------------------------------------
# Mapping: Shopify product_type -> site category
# ---------------------------------------------------------------------------
# The existing site uses a tighter vocabulary. We map Shopify types to those
# canonical names so the existing Catalog filters keep working.
TYPE_TO_CATEGORY = {
    "Orthopedic Devices": "Orthotics",
    "Back Brace":          "Orthotics",
    "Cervical Collar":     "Orthotics",
    "Supports & Braces":   "Orthotics",
    "Diagnostic Tests":    "Diagnostics",
    "Medical Face Masks":  "PPE",
    "Medical Gloves":      "PPE",
    "Surgical Supplies":   "Surgical",
    "Supplements":         "Supplements",
}

# Used for the on-disk image folder name (mirror catalog tree).
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

# Tier labels surfaced in the catalog filter UI.
def _tier_for(category: str, tags: list[str]) -> str:
    if category == "Orthotics":
        return "Bracing"
    if category == "Diagnostics":
        # POC vs OTC inferred from tags
        joined = " ".join(tags).upper()
        if "POC" in joined:
            return "POC"
        if "OTC" in joined:
            return "OTC"
        return "Diagnostic"
    if category == "PPE":
        return "Consumable"
    if category == "Surgical":
        return "Surgical"
    if category == "Supplements":
        return "Wellness"
    return "Consumable"

# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------
def split_pipes(value: str) -> list[str]:
    if not value:
        return []
    return [p.strip() for p in value.split("|") if p.strip()]


def to_money(value: str) -> float:
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def short_desc(text: str, max_len: int = 220) -> str:
    """Single-paragraph summary used in catalog cards / SEO descriptions."""
    if not text:
        return ""
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= max_len:
        return cleaned
    cut = cleaned[: max_len - 1]
    last_space = cut.rfind(" ")
    if last_space > 80:
        cut = cut[:last_space]
    return cut.rstrip(",.;:- ") + "…"


# ---------------------------------------------------------------------------
# Image copying
# ---------------------------------------------------------------------------
def copy_images(handle: str, product_type: str) -> list[str]:
    """Copy a product's photo set to public/images/products/{handle}/.

    Returns the public URL paths (Vite serves /public/* at the site root) for
    each image, sorted by the trailing numeric suffix.
    """
    folder_name = TYPE_TO_FOLDER.get(product_type)
    if not folder_name:
        return []
    src_dir = SRC_IMAGES / folder_name / handle
    if not src_dir.exists():
        return []

    out_dir = OUT_IMAGES / handle
    out_dir.mkdir(parents=True, exist_ok=True)

    public_paths: list[str] = []
    for src in sorted(src_dir.iterdir(), key=lambda p: p.name):
        if not src.is_file():
            continue
        if src.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        dest = out_dir / src.name
        if not dest.exists() or src.stat().st_mtime > dest.stat().st_mtime:
            shutil.copy2(src, dest)
        public_paths.append(f"/images/products/{handle}/{src.name}")

    return public_paths


# ---------------------------------------------------------------------------
# CSV loading
# ---------------------------------------------------------------------------
def load_products() -> list[dict]:
    rows = []
    with PRODUCTS_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows


def load_variants_by_product() -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    with VARIANTS_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            grouped.setdefault(row["product_id"], []).append(row)
    return grouped


# ---------------------------------------------------------------------------
# Mapping a CSV row -> JS-ready product dict
# ---------------------------------------------------------------------------
def derive_compliance(category: str, vendor: str, tags: list[str], description: str) -> dict:
    desc_lower = description.lower()
    return {
        "fda_registered": True,
        "pdac_approved":  category == "Orthotics",
        "taa_compliant":  category in {"Orthotics", "Equipment"},
        "berry_compliant": category == "PPE" and "USA" in (vendor or "").upper(),
        "mspv_listed":    category in {"PPE", "Surgical", "Pharmaceuticals", "Wound Care"},
        "latex_free":     "latex-free" in desc_lower or "latex free" in desc_lower,
        "country_of_origin": (
            "US" if "made in usa" in desc_lower or "made in the usa" in desc_lower
            else "VN" if "made in vietnam" in desc_lower
            else "CN"
        ),
    }


def build_product(row: dict, variants: list[dict]) -> dict:
    product_type = row["product_type"]
    category = TYPE_TO_CATEGORY.get(product_type, "Consumable")
    handle = row["handle"]
    tags = split_pipes(row.get("tags", ""))
    collections = split_pipes(row.get("collections", ""))
    description = (row.get("description") or "").strip()

    images = copy_images(handle, product_type)
    if not images and row.get("image_1_url"):
        # fallback to remote CDN URL if local file missing
        images = [row["image_1_url"]]

    price_min = to_money(row.get("price_min") or 0)
    price_max = to_money(row.get("price_max") or 0)
    if price_min == 0 and variants:
        prices = [to_money(v.get("price")) for v in variants if v.get("price")]
        if prices:
            price_min = min(prices)
            price_max = max(prices)

    raw_sku = next(
        (v.get("sku") for v in variants if v.get("sku")),
        f"UM-{handle.upper()[:32]}",
    )
    # Some Shopify SKUs contain spaces or other URL-unsafe chars (`APN 3001-C`).
    # Normalise to a slug-style SKU so it's safe to use as both a database id
    # and as a path segment in /products/:id.
    sku_primary = re.sub(r"[^A-Za-z0-9._-]+", "-", raw_sku).strip("-")
    if not sku_primary:
        sku_primary = f"UM-{handle.upper()[:32]}"

    compliance = derive_compliance(category, row.get("vendor", ""), tags, description)
    tier = _tier_for(category, tags)

    # Normalize variants to a compact shape consumed by the React UI.
    js_variants = []
    for v in variants:
        js_variants.append({
            "variant_id": v.get("variant_id"),
            "title": v.get("variant_title") or v.get("option1_value") or "Default",
            "sku": v.get("sku") or "",
            "price": to_money(v.get("price")),
            "compare_at_price": to_money(v.get("compare_at_price")) or None,
            "available": (v.get("available") or "").strip().lower() == "true",
            "weight_grams": int(float(v.get("weight_grams") or 0)),
            "options": {
                k: v.get(f"option{i}_value") or ""
                for i, k in enumerate(
                    [v.get("option1_name") or "", v.get("option2_name") or "", v.get("option3_name") or ""],
                    start=1,
                ) if k
            },
            "image": v.get("variant_image_url") or "",
        })

    pack_size = ""
    if js_variants:
        first = js_variants[0]
        pack_size = first.get("title") or "1 ea"

    return {
        "id": sku_primary,
        "sku": sku_primary,
        "product_id": row["product_id"],
        "handle": handle,
        "name": row["title"].strip(),
        "vendor": row.get("vendor", "").strip(),
        "category": category,
        "product_type": product_type,
        "tier": tier,
        "tags": tags,
        "collections": collections,
        "description": description,
        "summary": short_desc(description),
        "images": images,
        "hero_image": images[0] if images else "",
        "price": price_min or price_max,
        "price_min": price_min,
        "price_max": price_max,
        "pack_size": pack_size,
        "moq": 1,
        "hcpcs": "—",
        "url": row.get("url", ""),
        "num_variants": int(row.get("num_variants") or len(js_variants) or 1),
        "num_images": len(images),
        "variants": js_variants,
        "img": short_desc(row["title"], 60),  # legacy caption used by PhotoPlaceholder
        **compliance,
    }


def build_categories(products: Iterable[dict]) -> list[dict]:
    counts: dict[str, int] = {}
    for p in products:
        counts[p["category"]] = counts.get(p["category"], 0) + 1
    order = ["Orthotics", "Diagnostics", "PPE", "Surgical", "Supplements"]
    out = []
    for name in order:
        if name in counts:
            out.append({
                "slug": name.lower().replace(" ", "-").replace("&", "and"),
                "name": name,
                "count": counts[name],
            })
    # any uncategorised buckets
    for name, count in counts.items():
        if name not in order:
            out.append({
                "slug": name.lower().replace(" ", "-"),
                "name": name,
                "count": count,
            })
    return out


def build_collections(products: Iterable[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for p in products:
        for col in p["collections"]:
            slug = re.sub(r"[^a-z0-9]+", "-", col.lower()).strip("-")
            entry = seen.setdefault(slug, {"slug": slug, "name": col, "category": p["category"], "handles": []})
            entry["handles"].append(p["handle"])
    # deterministic order: largest first
    return sorted(seen.values(), key=lambda c: (-len(c["handles"]), c["slug"]))


# ---------------------------------------------------------------------------
# JS emitter
# ---------------------------------------------------------------------------
JS_HEADER = """/* AUTO-GENERATED by scripts/import_catalog.py — do not edit by hand.
   Source of truth:
     /Users/alex-nt-14/Mavera_Main_Bot/unite_medical_catalog/csvs/ALL_PRODUCTS_MASTER.csv
     /Users/alex-nt-14/Mavera_Main_Bot/unite_medical_catalog/csvs/ALL_VARIANTS.csv
   Re-run the importer whenever the upstream catalog changes. */

"""


def emit_js(products: list[dict], categories: list[dict], collections: list[dict]) -> None:
    payload = {
        "PRODUCTS":    products,
        "CATEGORIES":  categories,
        "COLLECTIONS": collections,
        "GENERATED_AT": _now_iso(),
        "PRODUCT_COUNT": len(products),
        "VARIANT_COUNT": sum(len(p["variants"]) for p in products),
    }
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    out = (
        JS_HEADER
        + "export const REAL_CATALOG = " + body + ";\n\n"
        # Hand-maintained products (e.g. RegeniCool™ Pro) live outside the
        # Shopify export and must survive every re-import.
        + "import { EXTRA_PRODUCTS } from './extraProducts.js';\n"
        + "export const REAL_PRODUCTS = [...REAL_CATALOG.PRODUCTS, ...EXTRA_PRODUCTS];\n"
        + "export const REAL_CATEGORIES = REAL_CATALOG.CATEGORIES;\n"
        + "export const REAL_COLLECTIONS = REAL_CATALOG.COLLECTIONS;\n"
        + "export default REAL_CATALOG;\n"
    )
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text(out, encoding="utf-8")


def _now_iso() -> str:
    import datetime as _dt
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-copy", action="store_true", help="skip image copy step (regenerate JS only)")
    args = ap.parse_args()

    if not PRODUCTS_CSV.exists():
        print(f"ERROR: master CSV not found: {PRODUCTS_CSV}", file=sys.stderr)
        return 2

    rows = load_products()
    variants_by_product = load_variants_by_product()

    if args.no_copy:
        global copy_images  # noqa: PLW0603
        copy_images = lambda handle, product_type: []  # type: ignore  # noqa: E731

    products: list[dict] = []
    type_counts: dict[str, int] = {}
    img_counts = 0
    for row in rows:
        ptype = row["product_type"]
        type_counts[ptype] = type_counts.get(ptype, 0) + 1
        variants = variants_by_product.get(row["product_id"], [])
        product = build_product(row, variants)
        img_counts += product["num_images"]
        products.append(product)

    categories = build_categories(products)
    collections = build_collections(products)
    emit_js(products, categories, collections)

    print(f"OK: imported {len(products)} products, "
          f"{sum(len(p['variants']) for p in products)} variants, "
          f"{img_counts} images.")
    print(f"     -> JS module:  {OUT_JS.relative_to(ROOT)}")
    print(f"     -> Image dir:  {OUT_IMAGES.relative_to(ROOT)}")
    print()
    print("By Shopify product_type:")
    for ptype, count in sorted(type_counts.items(), key=lambda kv: -kv[1]):
        print(f"  {count:3d}  {ptype}")
    print()
    print("By site category:")
    cat_counts: dict[str, int] = {}
    for p in products:
        cat_counts[p["category"]] = cat_counts.get(p["category"], 0) + 1
    for cat, count in sorted(cat_counts.items(), key=lambda kv: -kv[1]):
        print(f"  {count:3d}  {cat}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
