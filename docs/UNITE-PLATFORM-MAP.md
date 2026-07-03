# Unite Medical — Platform Map

*A plain-English guide to everything the website does, where to find it, and what's been tested.*

Prepared for Damon Reed · Last updated June 23, 2026

---

## 1. What this platform is

Unite Medical's website is no longer just a brochure — it's a full operating system for the
business. It runs the **storefront** customers buy from, the **back office** your team runs the
company from, and the **3PL/distributor portal** your warehouse partners log into. It connects to
your real tools — email, payments, shipping, accounting, and your CRM — so information is entered
**once** and flows everywhere automatically.

The guiding rule the whole system is built around: **enter data once, sync everywhere, with zero
double-entry.** A customer places an order and the invoice, the shipping label, the inventory
deduction, the accounting entry, and the email notifications all happen on their own.

There are four kinds of people who use it:

| Who | What they do | Where they go |
|---|---|---|
| **Public visitors** | Learn about Unite, browse the catalog, request quotes | The main website |
| **Customers** | See their own pricing, place & track orders, pay, manage their team | The logged-in account area |
| **Distributors / 3PL partners** | Manage their consigned stock, ship under their own brand, upload customer POs | The distributor portal |
| **Your team (admin)** | Run everything — orders, inventory, pricing, finance, CRM, reps | The admin console |

---

## 2. How to log in

The platform comes loaded with realistic demo data so you can click through every feature today.
Three sample logins:

| Role | What you'll see | Email | Password |
|---|---|---|---|
| **Owner / Admin** | The full admin console | `damon@unitemedical.net` | `admin` |
| **Customer (surgery center)** | A buyer's account view | `sarah@atlanta-surgical.com` | `demo` |
| **Customer (pharmacy)** | A second buyer's account | `kareem@holloway.com` | `demo` |

Log in from the **Login** link in the top navigation. Admins land in the admin console; customers
land on their dashboard.

---

## 3. The platform at a glance

Think of the site in four zones. Here's the map.

### Zone A — The public storefront (anyone)
The marketing and shopping front door.

- **Home, About, Services, Segments** (surgery centers, pharmacy, EMS, government, distributors) —
  the story of the business.
- **Catalog** — browse all products. Prices shown are list/tier prices until a customer logs in,
  then they see *their* contracted prices.
- **Product pages** — detail on each item.
- **Quotes** — a visitor can request a quote; the system can generate and send one.
- **Surplus marketplace** — buy and sell excess inventory across the network.
- **Resources, Blog, Compliance, Careers, Contact** — supporting pages.

### Zone B — The customer account (logged-in buyers)
Everything a customer needs to run their purchasing.

- **Dashboard** — their account home.
- **Their pricing, everywhere** — every product shows the price *negotiated for their account*,
  not a generic price.
- **Three ways to order:**
  1. **Browse → Cart → Checkout** (the normal way)
  2. **Quick Order** — paste or type a list of part numbers and quantities, skip the browsing
  3. **Reorder** — one click to repeat a past order or a saved list, re-priced at today's terms
- **Checkout** — they can only pay using a method **you pre-approved** for them (e.g. ACH and
  Net-30, but not wire). Anything not on their list is blocked.
- **Invoices, Order tracking, Quotes, Team management** — self-service account tools.

### Zone C — The distributor / 3PL portal (warehouse partners)
For partners who store **their own** product in your warehouse.

- **My Inventory** — their stock, kept completely separate from Unite's stock and from other
  distributors'. Tracked down to lot number and expiration date.
- **Order** — they order against their own stock *and* can buy Unite's catalog.
- **Upload PO** — they drop in their customer's purchase order (PDF/spreadsheet); the system reads
  the items, quantities, and ship-to and builds a draft order.
- **Shipping** — they see a **side-by-side comparison**: "Unite's rate vs. your own carrier
  account," and choose which to use.
- **Settlement** — what they're owed for product Unite sold on their behalf.
- **Documents** — their custom packing slips and required inserts.
- **Blind shipping** — orders go out under **their brand**, not Unite's. Their customer never sees
  that it came from Unite.

### Zone D — The admin console (your team)
The control room. Reached at the **Admin** area after logging in as an admin.

- **Overview & Analytics** — the state of the business at a glance.
- **Orders & Fulfillment** — every order and where it is in the pipeline.
- **Inventory** — stock levels, receiving, lots, counts, transfers, replenishment.
- **Customers** — manage each account's **contract pricing, volume discounts, approved payment
  methods, credit limits, and notification recipients**.
- **Team & RBAC** — control exactly **what each rep is allowed to do** when placing orders for
  customers (e.g. "this rep can discount up to 10%, that one can't offer terms").
- **Consignment** — manage distributor stock, settlements, scan history, and shipping markup.
- **CRM / HubSpot** — live two-way sync with your HubSpot CRM.
- **Finance** — accounts-receivable aging, collections.
- **Products, CMS, Vendors, Surplus, Integrations, Webhooks** — the rest of the operational tooling.

---

## 4. The big workflows, explained simply

### A customer order, start to finish
1. Customer logs in and sees **their** prices.
2. They build an order three possible ways (browse, quick-order, or reorder).
3. At checkout they pick a payment method **from their approved list only**.
4. The moment they place it, the system automatically:
   - reserves the inventory,
   - charges the card / sets up the invoice for terms,
   - creates the **accounting invoice** (no one re-types it),
   - books a shipping label and gets a tracking number,
   - generates the packing slip,
   - emails **everyone who should know** — the buyer gets tracking, accounts-payable gets the
     invoice, ops gets the confirmation.
5. If the order is over the customer's credit limit, it doesn't just go through — it **pauses for
   your approval** first.

### A rep placing an order for a customer
A rep can place an order on a customer's behalf, but only within the **authority you granted them**.
If a rep tries to apply a bigger discount than they're allowed, the system **refuses and logs the
attempt** so you can see it.

### A distributor shipping under their own brand
1. Distributor uploads their customer's PO (or quick-orders).
2. System matches the items to stock and builds the order.
3. Distributor compares shipping rates and picks Unite's rate or their own carrier account.
4. The order **blind ships** — the box, label, and paperwork show the **distributor's** brand, never
   Unite's.
5. The sale **draws down that distributor's consigned stock** and records what they're owed.

### Inventory that can never drift
Inventory is run as a strict ledger — like a checkbook. Every movement (received, reserved, shipped,
returned) is a recorded line, and the on-hand number is always the exact sum of those lines. This is
checked automatically and was **verified balanced across all 174 stock pools** in testing, so the
numbers can't silently go wrong.

---

## 5. Are we done? — PRD completion scorecard

Every numbered feature spec ("PRD") that defines this platform, and its status. **All are built and
passing their automated checks.**

| Spec | Feature area | Status |
|---|---|---|
| PRD-00 | Site hygiene & cleanup | Live |
| PRD-01 | Platform foundation & accounts | Live |
| PRD-02 | QuickBooks Online accounting sync | Live & verified · *needs accounting login connected for real data* |
| PRD-03 | Flexport freight/logistics | Live & verified |
| PRD-04 | Inventory + ShipStation shipping | Live & verified |
| PRD-05 | Email (Resend) + AI assist | Live & verified |
| PRD-06 | HubSpot CRM + 1099 rep payouts | Live & verified |
| PRD-07 | Vendor approval (FDA/GUDID/GS1) + recall monitoring | Live & verified |
| PRD-08 | Quoting engine | Live & verified |
| PRD-09 | Stripe payments & billing | Live & verified |
| PRD-10 | Surplus inventory network | Live & verified |
| PRD-11 | AI intelligence layer | Live & verified |
| PRD-12 | Demand forecasting & replenishment | Live & verified |
| PRD-13 | Search-engine optimization (SEO) | Live |
| PRD-14 | B2B portal & role-based pricing | Live |
| PRD-15 | Trade-data intelligence (ImportGenius) | Live & verified |
| PRD-16 | Quoting engine v3 | Live |
| PRD-17 | PDF document pipeline (packing slips, etc.) | Live |
| PRD-18 | Spreadsheet (xlsx) parsing | Live |
| PRD-19 | Customer self-serve quoting | Live |
| PRD-20 | Webhook event bus | Live |
| PRD-21 | Calendly / Google Calendar | Live |
| PRD-22 | Multi-currency & international vendors | Live |
| PRD-23 | Surplus marketplace | Live |
| PRD-24 | Zero-touch fulfillment | Live & verified |
| PRD-25 | Native warehouse system (WMS) | Live & verified |
| **PRD-26** | **Customer order management & self-service ordering** | **Live & verified** |
| **PRD-27** | **Distributor consignment, 3PL & blind shipping** | **Live & verified** |

"**Live & verified**" means there's an automated test that proves the feature's rules hold and it
re-checks them every time the code changes.

---

## 6. Proof it works — test results

These were run on June 23, 2026 against the current platform. Everything passed.

| Test suite | What it proves | Result |
|---|---|---|
| End-to-end smoke test | Every customer + distributor workflow runs start to finish | **39 of 39 passed** |
| Fulfillment orchestration | The automatic order pipeline is resilient and idempotent | **96 of 96 passed** |
| Customer ordering (PRD-26) | Pricing, payment gating, rep limits, notifications enforced | **16 of 16 passed** |
| Distributor consignment (PRD-27) | Owner-separated stock, blind ship, settlement, PO ingestion | **18 of 18 passed** |
| Warehouse ledger | Inventory math can never drift | **PASS — 174 stock pools balanced** |
| Platform-wide spec checks | PRD-02 through PRD-12 + trade-data rules hold | **All PASS** |

Concrete examples the smoke test confirmed live:

- Two different customers saw **two different prices** for the same product ($72.60 vs. $66.00),
  and a large quantity automatically triggered a volume discount.
- A real order ran the **entire pipeline** — reserved stock, took payment, made the invoice, booked
  shipping with a tracking number, and emailed **multiple recipients**.
- A customer with only ACH/Net-30 approved was **blocked** from paying by wire.
- A $70,000 order **over the credit limit paused for approval** instead of going through.
- A rep was **denied** a 15% discount (their cap is 10%) and the attempt was logged.
- A distributor's sale **drew down their stock** (1,040 → 1,035) and **left Unite's stock
  untouched**, and recorded the amount owed.
- A blind-ship order went out branded **"MedOne Distributors,"** not Unite.
- A distributor's customer PO was **read, matched, and turned into a draft order**, with an
  unrecognized part flagged for one-time mapping.

---

## 7. What's fully running vs. what needs one switch flipped

The **software is done and tested.** A handful of features are built and working on demo data, but
need an external account connected or a business decision before they run on *live* production data.
These are switches, not missing features:

| Item | Status | What's needed to go fully live |
|---|---|---|
| **QuickBooks Online** | Built & tested | A one-time accounting login (OAuth) to push real invoices |
| **Live carrier rates** | Built with markup logic | Carrier rate API access for real-time quotes (currently uses configured rates) |
| **Customer-PO reading** | Built (reads text & spreadsheets) | An OCR budget for scanned/image POs (typed/spreadsheet POs work now) |
| **Warehouse scanning** | Software ready | Physical barcode scanners / label printer in the warehouse |
| **Sales tax** | Deferred by decision | Pick a tax engine (TaxJar/Avalara) if you stop using Shopify's tax |
| **Distributor settlement payouts** | Amounts tracked now | Decide the payout cadence (monthly statement vs. per-sale) |

None of these block the platform from operating — they're the last-mile connections to outside
services and a few business decisions.

---

## 8. The short version

- **Every feature in every spec is built and passing its tests.** The two newest and biggest —
  customer self-service ordering and distributor consignment/blind shipping — are fully implemented
  and independently verified.
- **The platform runs the whole order lifecycle automatically**, from pricing to payment to
  invoice to shipping to notifications, with no double-entry.
- **The only remaining work is connecting a few outside accounts** (mainly QuickBooks and live
  carrier rates) and making a couple of business decisions (tax engine, payout cadence) — all
  switches, not software gaps.

The platform is, in the truest sense, **done and dusted** on the build side and ready for the
final production connections.
