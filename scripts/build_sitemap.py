#!/usr/bin/env python3
"""
Generates public/sitemap.xml + public/robots.txt covering every public route
on the Unite Medical site.

- Static routes are listed inline.
- Product detail pages are pulled from the same SKU list seeded into
  src/lib/seed.js so the sitemap stays in lockstep with the catalog.
- Blog posts are pulled from src/lib/seed.js's SAMPLE_BLOG_POSTS.
- Auth/cart/checkout/account/admin routes are intentionally NOT listed.

Run after any catalog or blog change:
    python3 scripts/build_sitemap.py
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SEED = ROOT / "src" / "lib" / "seed.js"
CATALOG = ROOT / "src" / "data" / "realCatalog.js"

SITE_URL = "https://unitemedical.net"

STATIC_ROUTES = [
    ("/",                        "1.0",  "weekly"),
    ("/catalog",                 "0.95", "daily"),
    ("/quote",                   "0.9",  "weekly"),
    ("/shortage-list",           "0.9",  "weekly"),
    ("/supply-risk",             "0.9",  "daily"),
    ("/surplus",                 "0.85", "monthly"),
    ("/surplus/market",          "0.85", "daily"),
    ("/segments/asc",            "0.9",  "monthly"),
    ("/segments/pharmacy",       "0.9",  "monthly"),
    ("/segments/ems",            "0.85", "monthly"),
    ("/segments/distributors",   "0.85", "monthly"),
    ("/services",                "0.9",  "monthly"),
    ("/services/distribution",   "0.85", "monthly"),
    ("/services/pdac",           "0.85", "monthly"),
    ("/services/distributors",   "0.85", "monthly"),
    ("/services/private-label",  "0.85", "monthly"),
    ("/robotics",                "0.85", "monthly"),
    ("/diagnostics",             "0.85", "monthly"),
    ("/government",              "0.85", "monthly"),
    ("/case-studies/tjs",        "0.7",  "monthly"),
    ("/about",                   "0.85", "monthly"),
    ("/compliance",              "0.85", "monthly"),
    ("/portfolio",               "0.8",  "monthly"),
    ("/procurement",             "0.85", "monthly"),
    ("/locations",               "0.8",  "monthly"),
    ("/careers",                 "0.7",  "monthly"),
    ("/contact",                 "0.85", "monthly"),
    ("/support",                 "0.7",  "monthly"),
    ("/blog",                    "0.85", "weekly"),
    ("/resources",               "0.75", "monthly"),
    ("/resources/coding",        "0.75", "monthly"),
    ("/privacy",                 "0.4",  "yearly"),
    ("/terms",                   "0.4",  "yearly"),
    ("/returns",                 "0.5",  "yearly"),
    ("/shipping",                "0.5",  "yearly"),
]

CATEGORY_FILTERS = ["Orthotics", "Diagnostics", "PPE", "Wound Care", "Pharmaceuticals", "Equipment"]


def parse_skus() -> list[str]:
    """Top-level product SKUs from src/data/realCatalog.js.

    The catalog module is `export const REAL_CATALOG = { ...JSON... };`
    so we slice out the object literal and json-parse it, then take
    PRODUCTS[].sku (variants stay off the sitemap — they share the
    parent product page).
    """
    text = CATALOG.read_text()
    start = text.index("{", text.index("REAL_CATALOG"))
    end = text.rindex("};", 0, text.index("export const REAL_PRODUCTS")) + 1
    catalog = json.loads(text[start:end])
    skus = [p["sku"] for p in catalog.get("PRODUCTS", []) if p.get("sku")]
    # Hand-maintained listings (src/data/extraProducts.js) are merged into
    # REAL_PRODUCTS at runtime — include them here too.
    extra_text = (ROOT / "src" / "data" / "extraProducts.js").read_text()
    skus += [s for s in re.findall(r"sku:\s*'([^']+)'", extra_text) if s not in skus]
    return skus


def parse_blog_slugs(seed_text: str) -> list[str]:
    block = re.search(
        r"const SAMPLE_BLOG_POSTS\s*=\s*\[(.*?)\];",
        seed_text,
        re.DOTALL,
    )
    if not block:
        return []
    return re.findall(r"slug:\s*'([^']+)'", block.group(1))


def url_xml(loc: str, priority: str, freq: str, lastmod: str) -> str:
    return f"""  <url>
    <loc>{SITE_URL}{loc}</loc>
    <lastmod>{lastmod}</lastmod>
    <changefreq>{freq}</changefreq>
    <priority>{priority}</priority>
  </url>"""


def main() -> int:
    seed_text = SEED.read_text()
    skus = parse_skus()
    blog_slugs = parse_blog_slugs(seed_text)
    today = date.today().isoformat()

    entries: list[str] = []
    for path, priority, freq in STATIC_ROUTES:
        entries.append(url_xml(path, priority, freq, today))
    for cat in CATEGORY_FILTERS:
        # URL-encode the space in 'Wound Care'.
        encoded = cat.replace(" ", "%20")
        entries.append(url_xml(f"/catalog?cat={encoded}", "0.85", "weekly", today))
    for sku in skus:
        entries.append(url_xml(f"/products/{sku}", "0.9", "weekly", today))
    for slug in blog_slugs:
        entries.append(url_xml(f"/blog/{slug}", "0.7", "monthly", today))

    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(entries)
        + "\n</urlset>\n"
    )
    (PUBLIC / "sitemap.xml").write_text(sitemap)

    robots = (
        "# Unite Medical · robots.txt\n"
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /cart\n"
        "Disallow: /checkout\n"
        "Disallow: /orders/\n"
        "Disallow: /dashboard\n"
        "Disallow: /account/\n"
        "Disallow: /admin\n"
        "Disallow: /admin/\n"
        "Disallow: /login\n"
        "Disallow: /register\n"
        "\n"
        f"Sitemap: {SITE_URL}/sitemap.xml\n"
    )
    (PUBLIC / "robots.txt").write_text(robots)

    total = len(STATIC_ROUTES) + len(CATEGORY_FILTERS) + len(skus) + len(blog_slugs)
    print(f"Wrote public/sitemap.xml  ({total} URLs)")
    print(f"  static routes: {len(STATIC_ROUTES)}")
    print(f"  catalog filters: {len(CATEGORY_FILTERS)}")
    print(f"  product detail pages: {len(skus)}")
    print(f"  blog posts: {len(blog_slugs)}")
    print("Wrote public/robots.txt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
