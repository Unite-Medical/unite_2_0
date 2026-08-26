#!/usr/bin/env python3
"""Read-only Shopify Admin GraphQL export for the Unite migration.

Requires server-side SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET,
and SHOPIFY_API_VERSION in the process environment. Writes product, customer, order,
collection, and location records as JSONL plus a machine-readable manifest.
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


REQUIRED = ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_API_VERSION"]


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"missing {name}")
    return value


def post_json(url: str, payload: dict, headers: dict[str, str]) -> tuple[int, dict]:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json", **headers},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code}: {body[:600]}") from error


def token_for_shop() -> tuple[str, str, str]:
    for name in REQUIRED:
        require_env(name)
    shop = require_env("SHOPIFY_STORE_DOMAIN")
    client_id = require_env("SHOPIFY_CLIENT_ID")
    client_secret = require_env("SHOPIFY_CLIENT_SECRET")
    version = require_env("SHOPIFY_API_VERSION")
    _, payload = post_json(
        f"https://{shop}/admin/oauth/access_token",
        {"client_id": client_id, "client_secret": client_secret, "grant_type": "client_credentials"},
        {},
    )
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("Shopify token response did not contain access_token")
    return shop, version, token


def graphql(shop: str, version: str, token: str, query: str, variables: dict) -> dict:
    _, payload = post_json(
        f"https://{shop}/admin/api/{version}/graphql.json",
        {"query": query, "variables": variables},
        {"X-Shopify-Access-Token": token},
    )
    if payload.get("errors"):
        raise RuntimeError(f"GraphQL errors: {json.dumps(payload['errors'])[:1200]}")
    return payload["data"]


def fetch_connection(shop: str, version: str, token: str, name: str, query: str, out_dir: Path) -> dict:
    output = out_dir / f"{name}.jsonl"
    cursor = None
    count = 0
    pages = 0
    with output.open("w", encoding="utf-8") as handle:
        while True:
            data = graphql(shop, version, token, query, {"cursor": cursor})
            connection = data[name]
            nodes = connection.get("nodes", [])
            for node in nodes:
                handle.write(json.dumps(node, ensure_ascii=False, separators=(",", ":")) + "\n")
            count += len(nodes)
            pages += 1
            page = connection["pageInfo"]
            if not page["hasNextPage"]:
                break
            cursor = page["endCursor"]
            time.sleep(0.15)
    return {"records": count, "pages": pages, "path": output.name}


PRODUCTS_QUERY = """
query Products($cursor: String) {
  products(first: 250, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id legacyResourceId handle title status vendor productType tags descriptionHtml
      createdAt updatedAt publishedAt templateSuffix
      seo { title description }
      options { id name position values }
      featuredMedia { preview { image { url altText } } }
      media(first: 250) { nodes { alt mediaContentType preview { image { url altText width height } } } }
      variants(first: 250) {
        nodes {
          id legacyResourceId title sku barcode price compareAtPrice taxable requiresShipping
          inventoryPolicy weight weightUnit position selectedOptions { name value }
          image { url altText }
          inventoryItem {
            id tracked requiresShipping countryCodeOfOrigin provinceCodeOfOrigin
            inventoryLevels(first: 100) { nodes { id quantities(names: ["available", "committed", "incoming", "on_hand", "reserved"]) { name quantity updatedAt } location { id legacyResourceId name address { address1 address2 city provinceCode zip countryCode } } } }
          }
        }
      }
    }
  }
}
"""

CUSTOMERS_QUERY = """
query Customers($cursor: String) {
  customers(first: 250, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id legacyResourceId firstName lastName displayName email phone state tags note
      createdAt updatedAt numberOfOrders amountSpent { amount currencyCode }
      defaultAddress { address1 address2 city provinceCode zip countryCode phone }
      addresses { address1 address2 city provinceCode zip countryCode phone }
    }
  }
}
"""

ORDERS_QUERY = """
query Orders($cursor: String) {
  orders(first: 250, after: $cursor, query: "status:any", sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id legacyResourceId name createdAt updatedAt processedAt cancelledAt closedAt
      displayFinancialStatus displayFulfillmentStatus currencyCode email phone tags note
      totalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      customer { id legacyResourceId displayName email phone }
      shippingAddress { firstName lastName company address1 address2 city provinceCode zip countryCode phone }
      billingAddress { firstName lastName company address1 address2 city provinceCode zip countryCode phone }
      lineItems(first: 250) { nodes { id title sku quantity currentQuantity vendor variant { id legacyResourceId sku barcode title } originalUnitPriceSet { shopMoney { amount currencyCode } } } }
      fulfillments(first: 50) { createdAt status trackingInfo { company number url } location { id legacyResourceId name } }
    }
  }
}
"""

COLLECTIONS_QUERY = """
query Collections($cursor: String) {
  collections(first: 250, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes { id legacyResourceId handle title descriptionHtml updatedAt seo { title description } image { url altText } ruleSet { appliedDisjunctively rules { column relation condition } } productsCount { count } }
  }
}
"""

LOCATIONS_QUERY = """
query Locations($cursor: String) {
  locations(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id legacyResourceId name isActive fulfillsOnlineOrders address { address1 address2 city provinceCode zip countryCode phone } }
  }
}
"""


def main() -> int:
    output_arg = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else None
    default = Path.home() / "Downloads" / f"Unite_Shopify_Snapshot_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}"
    out_dir = output_arg or default
    out_dir.mkdir(parents=True, exist_ok=False)
    shop, version, token = token_for_shop()
    manifest = {
        "source": "Shopify Admin GraphQL",
        "shop_domain": shop,
        "api_version": version,
        "read_only": True,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "datasets": {},
    }
    queries = {
        "products": PRODUCTS_QUERY,
        "customers": CUSTOMERS_QUERY,
        "orders": ORDERS_QUERY,
        "collections": COLLECTIONS_QUERY,
        "locations": LOCATIONS_QUERY,
    }
    for name, query in queries.items():
        print(f"Exporting {name}…", flush=True)
        manifest["datasets"][name] = fetch_connection(shop, version, token, name, query, out_dir)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
