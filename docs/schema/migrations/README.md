# Database migrations

Canonical, ordered, idempotent SQL migrations. Applied by Drizzle once
PRD-01 lands; until then they are read-only blueprints that other PRDs
reference.

## Conventions

- Filename: `NNNN_<short_name>.sql` (zero-padded sequence number)
- Each file is **idempotent** (`CREATE TABLE IF NOT EXISTS`, etc.) so
  re-running is safe
- Each migration has a `-- PRD-XX` header citing the PRD it derives from
- No data seeding here — that's a separate concern (`docs/schema/seeds/`)

## Current migrations

| # | File | PRD | What it does |
|---|---|---|---|
| 0001 | `0001_core.sql` | PRD-01 | Core tables: organizations, profiles, addresses, audit_log |
| 0002 | `0002_catalog.sql` | PRD-01 / 04 | products, product_variants, categories, pricing |
| 0003 | `0003_inventory.sql` | PRD-04 | warehouses, inventory, lot_tracking |
| 0004 | `0004_orders.sql` | PRD-01 | carts, cart_items, orders, order_items, shipments |
| 0005 | `0005_finance.sql` | PRD-02 / 09 | invoices, payments, qbo_oauth, qbo_invoices, stripe_payments |
| 0006 | `0006_quotes.sql` | PRD-08 | quotes, quote_items |
| 0007 | `0007_vendors.sql` | PRD-07 | vendors, vendor_evidence, product_compliance, compliance_events |
| 0008 | `0008_crm.sql` | PRD-06 | leads, contacts, activities, tasks, hubspot_contacts |
| 0009 | `0009_logistics.sql` | PRD-03 / 04 | flexport_shipments, shipstation_labels |
| 0010 | `0010_ai_usage.sql` | PRD-11 | ai_usage |
| 0011 | `0011_b2b_portal.sql` | PRD-14 | tier_pricing, catalog_visibility, organization_users |
| 0012 | `0012_surplus.sql` | PRD-10 | surplus_submissions, surplus_lines |
| 0013 | `0013_forecast.sql` | PRD-12 | forecasts, reorder_points, forecast_runs, forecast_evals |
| 0014 | `0014_gmail_outbox.sql` | PRD-05 | gmail_outbox, daily_digests |
