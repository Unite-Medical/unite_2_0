# Clean staging test workspace — September 23, 2026

The historical operational workspace was archived through its recovery workflow. Staff access and settings remain active. Shopify is still the live store.

The authenticated staging import loaded batch `clean_pilot_20260923` from the September 8 Shopify export:

| Resource | Loaded |
| --- | ---: |
| Products | 43 |
| Variants | 86 |
| Unite warehouse stock records | 80 |
| Provisional on hand | 4,270 |
| Held / committed in the export | 1 |
| Provisional available | 4,269 |

The counts are source SKU quantities, not a physical inventory count. Six unresolved stock rows stay unloaded and display “Not loaded”; 144 other products remain outside the reviewed batch. No historical customers, orders, payments, activation emails or outbound messages were loaded or sent.

Selection requires complete products with unique nonempty SKUs, positive prices/costs, price at least cost, positive shipping weights, and no barcode collisions. Only active, published products marked Launch in the existing reviewed mapping qualify. Inventory is restricted to numeric, nonnegative, balanced records at Unite Medical Warehouse. Ohio and CATO stock is excluded from this pilot. Product identifiers and barcodes retain their digits after removal of export formatting apostrophes.

The server-only batch and its source hash are stored with the import audit. It is admin/MFA protected, restricted to the exact staging environment and origin, transactional, idempotent and refuses existing row/SKU collisions. Restore refuses to mix an older workspace with newly loaded data.

## Testing now

1. Open `/admin/products`; search a parent or variant SKU, inspect its details and variants.
2. Open `/admin/inventory`; compare on hand, held/committed and available for the SKU. Unknown stock is distinct from zero.
3. Use the small sun/moon button beside the account name. The choice persists through navigation and reload.
4. Have Damon identify one actual customer and confirm their email, delivery address and agreed pricing before customer activation or checkout testing.

The staff shell, home, catalog, inventory and test-data screen use the Intercom-inspired inset-panel design. Shared theme tokens also cover existing administrative pages. The reference review used the authenticated Intercom workspace and the live public Shopify catalog/product flow; Shopify admin in the in-app browser required sign-in.

The September 23 sidebar refinement uses the official transparent colored mark, one navigation column, grouped primary destinations, and a deduplicated More tools disclosure. The single account row opens Settings, View website and Sign out. The appearance control is a compact icon button. Build and targeted lint passed; authenticated browser checks verified the mark against both themes, the account menu and additional tool navigation.

## Verification

405 automated tests pass. Browser verification covers authenticated batch import, catalog search by variant SKU, product details, stock totals, held inventory labels, light/dark rendering and persistence. Unauthenticated access to the import endpoint returns 401. Checkout, charging, shipping, email delivery and production cutover are not part of this verification.

Reload testing exposed an existing race: the restricted warehouse projection could replace full admin products, hiding price, category and variant fields. Admin sessions now use full database hydration; warehouse-only sessions retain the restricted projection. Source product identity is preserved while storefront lookup also accepts its SKU.

Regenerate the reviewed batch with `scripts/prepare_clean_pilot.py --snapshot <private snapshot-prepared.json> --report <review output.json>`. The original Shopify files stay unchanged.
