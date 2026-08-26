#!/usr/bin/env python3
"""Normalize a Shopify product CSV into a reviewable local migration snapshot."""
from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path


def clean(v: str | None) -> str:
    return (v or "").strip()


def truthy(v: str | None) -> bool:
    return clean(v).lower() in {"true", "1", "yes"}


def main() -> int:
    source = Path(sys.argv[1]).expanduser().resolve()
    out_dir = Path(sys.argv[2]).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    with source.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))

    products: dict[str, dict] = {}
    variants: list[dict] = []
    media: defaultdict[str, list[dict]] = defaultdict(list)
    exceptions: list[dict] = []
    sku_seen: defaultdict[str, list[str]] = defaultdict(list)

    current_handle = None
    for row_no, row in enumerate(rows, start=2):
        handle = clean(row.get("Handle")) or current_handle
        if not handle:
            exceptions.append({"severity": "error", "kind": "missing_handle", "handle": "", "sku": clean(row.get("Variant SKU")), "row": row_no, "detail": "Row cannot be attributed to a Shopify product"})
            continue
        current_handle = handle
        title = clean(row.get("Title"))
        sku = clean(row.get("Variant SKU"))
        image = clean(row.get("Image Src"))
        is_product_row = bool(title)
        if is_product_row:
            products[handle] = {
                "handle": handle,
                "title": title,
                "status": clean(row.get("Status")).lower(),
                "published": truthy(row.get("Published")),
                "vendor": clean(row.get("Vendor")),
                "product_category": clean(row.get("Product Category")),
                "product_type": clean(row.get("Type")),
                "tags": [x.strip() for x in clean(row.get("Tags")).split(",") if x.strip()],
                "description_html": row.get("Body (HTML)") or "",
                "seo_title": clean(row.get("SEO Title")),
                "seo_description": clean(row.get("SEO Description")),
                "variants": [],
                "media": [],
            }
        if sku:
            variant = {
                "handle": handle,
                "sku": sku,
                "title": title or clean(row.get("Option1 Value")) or "Default Title",
                "options": [
                    {"name": clean(row.get(f"Option{i} Name")), "value": clean(row.get(f"Option{i} Value"))}
                    for i in range(1, 4) if clean(row.get(f"Option{i} Name")) or clean(row.get(f"Option{i} Value"))
                ],
                "price": clean(row.get("Variant Price")),
                "compare_at_price": clean(row.get("Variant Compare At Price")),
                "barcode": clean(row.get("Variant Barcode")),
                "grams": clean(row.get("Variant Grams")),
                "weight_unit": clean(row.get("Variant Weight Unit")),
                "requires_shipping": truthy(row.get("Variant Requires Shipping")),
                "taxable": truthy(row.get("Variant Taxable")),
                "inventory_policy": clean(row.get("Variant Inventory Policy")),
                "inventory_tracker": clean(row.get("Variant Inventory Tracker")),
                "image": clean(row.get("Variant Image")) or image,
            }
            variants.append(variant)
            sku_seen[sku].append(handle)
            products.setdefault(handle, {"handle": handle, "title": "", "status": "", "published": False, "vendor": "", "product_category": "", "product_type": "", "tags": [], "description_html": "", "seo_title": "", "seo_description": "", "variants": [], "media": []})["variants"].append(variant)
            if not variant["barcode"]:
                exceptions.append({"severity": "warning", "kind": "missing_barcode", "handle": handle, "sku": sku, "row": row_no, "detail": "No UPC/GTIN source from Shopify CSV"})
            try:
                if float(variant["grams"] or 0) <= 0:
                    exceptions.append({"severity": "warning", "kind": "missing_or_zero_weight", "handle": handle, "sku": sku, "row": row_no, "detail": "Variant grams is blank or zero"})
            except ValueError:
                exceptions.append({"severity": "warning", "kind": "invalid_weight", "handle": handle, "sku": sku, "row": row_no, "detail": f"Non-numeric grams: {variant['grams']}"})
        if image:
            record = {"url": image, "position": clean(row.get("Image Position")), "alt": clean(row.get("Image Alt Text")), "variant_sku": sku or None}
            media[handle].append(record)

    for handle, product in products.items():
        product["media"] = media[handle]
        if not product["title"]:
            exceptions.append({"severity": "error", "kind": "missing_product_title", "handle": handle, "sku": "", "row": "", "detail": "No product header row found"})
        if not product["seo_title"] or not product["seo_description"]:
            exceptions.append({"severity": "warning", "kind": "incomplete_seo", "handle": handle, "sku": "", "row": "", "detail": "SEO title or SEO description blank"})
        if re.search(r"font-claude-response|group/message-row|<meta charset", product["description_html"], re.I):
            exceptions.append({"severity": "warning", "kind": "description_html_cleanup", "handle": handle, "sku": "", "row": "", "detail": "Description contains editor/AI artifact markup"})

    for sku, handles in sku_seen.items():
        if len(handles) > 1:
            exceptions.append({"severity": "error", "kind": "duplicate_sku", "handle": "; ".join(sorted(set(handles))), "sku": sku, "row": "", "detail": f"SKU appears {len(handles)} times"})

    status = Counter(p["status"] for p in products.values())
    result = {
        "source": str(source),
        "products": len(products),
        "variants": len(variants),
        "media_records": sum(len(v) for v in media.values()),
        "status": dict(status),
        "exceptions": dict(Counter(item["kind"] for item in exceptions)),
        "exception_count": len(exceptions),
    }
    (out_dir / "catalog_summary.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    with (out_dir / "products_normalized.jsonl").open("w", encoding="utf-8") as handle:
        for product in sorted(products.values(), key=lambda value: value["handle"]):
            handle.write(json.dumps(product, ensure_ascii=False) + "\n")
    with (out_dir / "catalog_exceptions.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["severity", "kind", "handle", "sku", "row", "detail"])
        writer.writeheader()
        writer.writerows(exceptions)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
