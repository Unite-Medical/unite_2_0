# Damon + Alex Walkthrough Decisions & Punch List

> Live record from the page-by-page product walkthrough. This is the source of
> truth for decisions made in the room. Do not treat previous default choices as
> current when they conflict with this document.

## Flow 1 — Company registration, access, pricing, and payment

**Status:** DECIDED during walkthrough

### Company eligibility

- Registration is for **companies only**.
- Require enough information to establish that the applicant is a real company.
- **Do not require:** EIN, medical license, or manual invitation.
- Automatic approval is acceptable when the business-verification signals pass.
- Applicants that do not pass verification go to manual review.

### Access before approval / verification

An unapproved or unverified company may:

- Browse the catalog, **without prices**.
- Build/request quotes.
- Use a low-friction **Quick Quote** flow when the system can establish a real
  business from company name + business email + website.

An unapproved or unverified company may **not**:

- See product prices.
- Add products to a cart.
- Place an order.

### Quick Quote requirement

- Make requesting a quote possible before full account approval.
- Keep the minimum intake small: business/company, contact name, business email,
  website, products/quantities.
- If business email + website/domain signals establish a real company, allow the
  quote to be generated/submitted immediately.
- Quote activity must create the CRM/company/contact record and a follow-up task.
- Quick Quote must never silently grant ordering or price visibility.

### Initial pricing

- Every newly approved account starts on **retail/default pricing**.
- Negotiated A/B/C/distributor/government pricing is assigned manually later.
- **TODO, launch-critical:** establish and validate the retail/default price for
  every active catalog SKU before enabling account ordering.
- Add an admin report for products missing a valid retail/default price.
- Prevent ordering for any SKU without an approved retail/default price.

### Payment model — supersedes prior card-first decision

- New accounts do **not** receive card-first checkout as the default.
- Historical/default flow: Unite issues an invoice; customer pays from their bank
  (ACH/bank transfer).
- Credit terms are not assumed simply because an account was approved.
- Credit card payment may be offered, but the Stripe processing cost must be
  added/passed through rather than absorbed in Unite's low margin.
- **DECIDED:** pass through the actual applicable Stripe processing fee, with no
  additional Unite markup. Checkout and the invoice must disclose the fee before
  payment. Implementation still requires card-network and state-law validation and
  must disable the surcharge wherever it is not permitted.
- **TODO:** clearly separate:
  1. invoice payable immediately by ACH/bank,
  2. approved pay-later terms (Net-30/Net-60 via credit approval),
  3. optional credit-card payment with disclosed processing surcharge/fee.
- Update registration, checkout, quote, invoice, FAQ, Terms, and account copy so
  they describe one consistent policy.

### Registration fields

Keep required registration lightweight. Add these as explicitly **OPTIONAL**:

- Product categories of interest.
- License or facility type.
- Annual medical spend.

Do not require for now:

- Billing/shipping address at account creation.
- Tax-exempt certificate.
- Resale certificate.
- Purchasing contact.
- Accounts-payable contact.
- Preferred shipping account.

Those can be captured later at quote/order/credit-application time when needed.

### Duplicate organizations

- Separate people may create separate accounts even if they appear to represent
  the same hospital/company.
- Staff may merge the organizations later if appropriate.
- Do not auto-join people solely by email domain.
- **TODO:** provide an admin duplicate-org suggestion/merge workflow with a full
  audit trail and no destructive silent merge.

### Post-approval automation

Every approved account should automatically receive:

- Named sales rep.
- Initial default/retail pricing tier.
- Explicit credit/payment status.
- CRM company/contact records.
- CRM follow-up task.
- Welcome email.
- First-order incentive or onboarding call/task.

### Review SLA

- Keep the one-business-day approval promise.
- Pending manual-review applications must appear in the admin morning brief and
  customer-approval queue.

### Fraud controls

- Rely on Stripe Radar for card-fraud screening when card payment is used.
- No additional first-order/manual-review threshold requested at this time.
- Ordering remains unavailable until the company is approved/verified.

### Quick Quote UX and funnel design

The current scrolling product list is not acceptable as the final experience.
Replace it with an intent/category-led flow:

1. Start with **Why are you here?** choices such as:
   - Restock products I already buy.
   - Find a substitute for a shortage/backorder.
   - Quote diagnostic tests.
   - Quote PPE / American-made products.
   - Quote braces / orthotics / recovery products.
   - Source something not listed.
2. Show attractive category/product cards after the intent selection.
3. Make category switching persistent and easy without losing quote-list state.
4. Anonymous state shows product identity, availability, and quantities, but no
   prices.
5. Add to Quick Quote builds the list; it never adds to an anonymous cart.

### Funnel telemetry — know who came, why, and where they left

Create a `quote_funnel_sessions` model and instrument these stages/events:

- session_started (anonymous session ID, timestamp, referrer/UTM)
- intent_selected (why they came)
- category_viewed / search_performed
- item_added / item_removed / quantity_changed
- noncatalog_item_added
- business_verification_started / passed / failed
- shipping_zip_entered / rate_selected
- tax_exempt_yes_no / certificate_uploaded / certificate_validated
- quote_generated
- account_started / account_completed
- quote_change_requested
- quote_accepted
- order_created
- abandoned (last completed stage + time since last event)

Store business identity only after the visitor voluntarily submits it. Provide an
admin funnel report showing conversion and drop-off by intent, category, source,
and last stage. Add an optional one-click abandonment reason when there is enough
intent to justify asking.

### Business-email verification

- Consumer email providers (Gmail, iCloud, Hotmail, Outlook.com, Yahoo, etc.) do
  not qualify for instant business verification/pricing.
- Those submissions may not proceed through the instant Quick Quote path.
- Show a clear request for a work email and company website rather than silently
  failing.

### Mixed stocked + sourced quote behavior

- Stocked lines receive immediate pricing and may proceed to order.
- Sourced/unstocked lines stay pending and display: **"We'll follow up with
  pricing in 1–2 business days."**
- Buyer can order stocked lines immediately without waiting for sourced lines.
- Preserve the sourced lines as a linked sourcing request and CRM/rep task.

### Shipping pricing and margin

- Ask for shipping ZIP during Quick Quote.
- Show multiple available shipping options.
- Place **Unite preferred** first, while still showing alternatives.
- When package weight/dimensions are known, return a firm delivered quote.
- Add a configurable shipping-and-handling margin. Initial business preference:
  a flat **$15 handling amount** rather than an uncapped percentage.
- Keep the existing configurable percentage capability for distributor-specific
  arrangements, but do not expose raw carrier cost as the customer-facing rate.
- Product/variant/package master data must gain real weight and package
  dimensions; the current code estimates 0.6 lb per unit and has no catalog
  dimensions, which is insufficient for a firm rate.
- WMS/product master owns shippable weight/dimensions and cartonization inputs;
  ShipStation/carrier APIs return rates, labels, and tracking.

### Tax-exempt intake and automation

- Quick Quote/account completion asks **Is this purchase tax exempt? Yes/No.**
- If Yes: certificate upload is mandatory before continuing.
- If No: buyer may continue without upload and applicable tax handling can occur.
- Upload accepts PDF/image of resale/tax-exemption certificate.
- Use OCR + a vision-capable LLM with strict structured output to extract:
  company/legal name, state, certificate/registration ID, effective/expiry dates,
  address, exemption type, signatures, and confidence.
- Validate extracted fields against account data and state-specific rules.
- AI may extract and flag; it must not make the final legal-validity judgment for
  uncertain/low-confidence certificates. Exceptions enter an admin review queue.
- Store the original document, extracted fields, validation result, reviewer,
  and audit history.

### Account completion and order conversion

- Flow order confirmed:
  1. Intent/category selection.
  2. Build Quick Quote list.
  3. Verify company/work email/website.
  4. Enter shipping ZIP; show stocked pricing + shipping options.
  5. Capture tax-exempt status/certificate.
  6. Generate 14-day quote; sourced lines remain pending.
  7. Finish account with contact name, password, phone, optional interests/
     facility type/spend, and tax-exempt record.
  8. Carry quote directly into acceptance.
  9. Accepted stocked lines create order, invoice, inventory reservation, and
     fulfillment pipeline.
- Notify a rep when a sourced/custom line exists, verification fails, the buyer
  requests help, or any Quick Quote is generated. No dollar threshold.
- Add **Request changes** before acceptance. Buyer can add/remove items, change
  quantities, or request human assistance while preserving quote history.

### System ownership clarification

- **Stripe:** card/ACH payment processing and fraud screening (Radar), not
  tracking.
- **WMS:** inventory availability, reservations, lots, package weight/dimensions,
  and fulfillment truth.
- **ShipStation/carrier API:** live shipping rates, labels, tracking events.
- **Fulfillment orchestrator:** connects order → reserve → payment/invoice →
  label → packing slip → notification → delivery status.

### Post-payment lifecycle: observed implementation defects

Code/live review during the walkthrough found these launch-blocking mismatches:

- `runFulfillment()` reserves inventory before collecting/confirming payment.
- ACH/hosted-invoice orders continue into invoice, label, packing, and notification
  steps while funds remain unconfirmed.
- The order-confirmation page claims the order has been picked and tracking issued
  immediately, even when that is not true.
- Label creation currently calls shipment confirmation and decrements inventory
  before a carrier pickup/warehouse ship confirmation.
- Customer tracking contains a demo timer that advances status every 15 seconds
  without a real carrier event.
- Backorder auto-fulfillment commits inventory and marks the backorder shipped
  without a complete replacement shipment/label/tracking/notification path.
- `createReturn()` immediately restocks and refunds when an RMA is created, before
  return receipt, inspection, lot disposition, or approval.
- Customer return initiation is email-only; there is no complete account RMA UI.
- Customer invoice **Pay all** calls a local/QBO payment path and marks invoices
  paid without collecting funds through Stripe.
- Customer/account pages often fall back to the seeded Atlanta Surgical org when
  no authenticated session exists, risking demo/customer-data exposure.
- Tracking links use guessable order IDs without a dedicated secure tracking token.
- The packing-slip download control on tracking has no implemented click handler.

### Checkout, payment, shipping, and fulfillment gating

#### Shipping

- Standard ground is **never free** when billed through Unite.
- Unite-billed parcel shipping uses the selected live carrier rate plus the
  configured shipping-and-handling charge.
- Add **Bill to my UPS/FedEx account** as a third-party shipping option.
- Third-party shipping captures carrier, account number, billing postal code,
  and any carrier-required country/account metadata. Validate before use.
- When successfully billed third party, Unite freight is $0 because the carrier
  charges the customer directly. Do not call the shipment itself free.
- If carrier-account validation or label billing fails, stop the shipment and
  ask the customer to correct the account or choose a Unite-billed rate.
- The existing ShipStation adapter already has a third-party billing seam;
  checkout/WMS UI and validation are still required.

#### Parcel versus pallet classification

- Add shippable package master data to WMS/product variants: unit/case weight,
  dimensions, units per case, cases per pallet, stackability, and special flags.
- Build configurable carrier/service constraints rather than one global cutoff.
- Official USPS baseline confirmed during review: 70 lb maximum; generally 108
  inches length + girth, with 130 inches for Ground Advantage. UPS/FedEx parcel
  services commonly allow larger service-specific limits, which must be kept in
  configuration and verified against the active account/service APIs.
- Cartonize the order using item/case dimensions. If a carton exceeds the
  selected carrier/service limits, or the order crosses configured pallet
  economics/handling thresholds, classify as pallet/LTL and require appropriate
  freight intake.
- Pallet/LTL intake adds dock/receiving hours, appointment, liftgate, pallet
  count, weight, dimensions, stackability, and freight class where needed.
- Small parcel does not ask those pallet-only questions.

#### Smart address and contacts

- Use address autocomplete and carrier-address validation.
- Require one primary recipient/contact.
- Allow additional role-based contacts with prefilled roles, including Buyer,
  Accounts Payable, Receiving, and Order/Shipping Notifications.
- Order confirmation goes to buyer; invoice to AP; tracking to buyer/receiving;
  exceptions and backorders to buyer plus assigned rep.

#### Payment experience

- Replace payment-method buttons with a real Stripe Payment Element / hosted
  invoice experience.
- Offer bank/ACH and card. Label the card method **Credit card**.
- Card shows product/order amount plus the disclosed card processing fee; bank
  shows the order amount without the card fee.
- Stripe keys and webhook secret are present in Unite local and Vercel production
  configuration. Do not copy values from TJS or expose them client-side.
- Existing Stripe backend already supports Customers, hosted invoices,
  PaymentIntents, card/US bank account methods, paid/failed webhooks, and QBO
  reconciliation. Missing work is the real Elements UI and revised orchestration.
- Customer PO number is required for every order.

#### Payment-gated inventory and fulfillment

- No confirmed funds means **no inventory reservation** for prepaid accounts.
- Customer-facing copy says only that the order will proceed when payment is
  confirmed. Do not tell customers "first paid, first served" or expose internal
  inventory-hold language.
- Approved commercial-credit accounts are the explicit exception: they may enter
  fulfillment under their approved terms/limit without cash settlement.
- Create a payment-pending order/checkout record for traceability, but do not run
  reservation, WMS allocation, label creation, or fulfillment for prepaid orders.
- Stripe `invoice.paid` or settled/succeeded payment webhook rechecks availability,
  records payment, and starts allocation/fulfillment.
- Stripe is the preferred automatic verification rail for card, ACH, and bank
  transfer. QBO may mirror/query a recorded Payment or Deposit, but it is not a
  reliable real-time proof that an arbitrary wire/check cleared the bank. Checks
  and off-platform wires require finance confirmation and audit evidence unless a
  verified provider webhook exists.
- Ship available paid quantities immediately. Unavailable lines become linked
  backorder suborders and are not charged or invoiced until each batch is ready.
- Customers do not self-edit or cancel after commitment. A customer PO is a firm
  commitment and sourced/backordered lines have no cancellation-request path.

#### Net terms and commercial credit

- Net 30 is hidden unless explicitly approved after a commercial credit review.
- Do not run a personal consumer-credit "soft pull" by default.
- Candidate business-credit APIs: Creditsafe business data/credit reports,
  Experian Business Information Services, D&B Direct+, and Equifax Commercial.
- Initial preferred evaluation path: Creditsafe for commercial score/report and
  suggested limit, with manual approval/override. If the business has a thin
  file, optionally request bank/cash-flow evidence or a personal guaranty under a
  separate consent-compliant process.

### Sourcing intake and assignment

- All active sourcing demand enters one queue with an immutable source marker:
  Quick Quote non-catalog line, authenticated customer account, work email,
  salesperson entry, phone-call transcript, uploaded document/image, customer PO,
  RFQ, or shortage/backorder request.
- A passive/anonymous website visitor is not a sourcing contact and must not be
  placed in the outreach database. Preserve consent/source evidence for any email
  provider such as Customer.io.
- Link the request to the account and assigned owner. Send the account owner an
  immediate email and dashboard notification. Escalate unowned and overdue items.
- Detect likely duplicates within a configurable time window and reconcile them
  without losing the original source records.
- Price stocked lines immediately. Route substitutable and truly sourced lines to
  sourcing. Start the 1 to 2 business-day response clock.

### Vendor offers and RFQ intelligence

- Accept vendor email, PDF, XLSX, CSV, image, and portal responses in the vendor's
  existing format. Preserve the original artifact.
- Normalize vendor, manufacturer, SKU, description, available quantity, MOQ, unit
  price, currency, Incoterm, origin, lead time, lot/expiration, terms, price-valid-
  until date, freight inclusion, compliance, contact, and extraction provenance.
- Run three independent structured extraction passes and reconcile them. The
  automatic path requires 99% confidence/consensus. Disagreement or lower
  confidence pauses the flow for human correction. Store corrections as future
  evaluation/training examples.
- Check approved/current suppliers first, including Unite's distributor accounts
  and learned cross-reference SKUs. Compare their availability and pricing to the
  customer's target/current price.
- If current suppliers cannot meet the requirement, identify 3 to 5 plausible
  manufacturers/suppliers and give the assigned sales owner contact information,
  an outreach email draft, and a call task. Suggested vendors are prospects until
  they pass vendor approval.
- Preserve historical offers and show price, validity, lead-time, and reliability
  history. Never overwrite an old offer with a new price.
- An approved vendor offer creates a **draft purchase order for review**. Staff can
  review it and click **Send purchase order**. Approval does not silently email or
  commit the PO before that click.

### Landed cost, margin, and cost visibility

- Landed-cost components may be null for a domestic purchase. Populate every
  available component from partner APIs before asking for manual entry. Sources
  include vendor offer data, Flexport, FedEx Freight, exchange-rate services,
  USITC/HTS, GS1/GUDID/openFDA, Stripe, and QBO as applicable.
- Every imported value retains source, provider reference, retrieved-at time,
  validity/expiry, confidence, and manual-override history.
- Vendor/FOB price validity is required when provided. Expired or stale vendor
  pricing blocks automatic quote reuse and triggers refresh.
- The absolute floor is **30% gross margin**, calculated as
  `(sell price - landed cost) / sell price`. Below 30% requires authorized owner/
  manager override with reason and audit record.
- Customer-specific pricing is resolved consistently across every surface.
- Internal vendor identity, vendor cost, landed-cost components, margin, internal
  freight breakdown, and approval notes are protected by server-side permissions,
  not merely hidden in the browser.
- Damon/admin, finance, procurement, and explicitly authorized senior users may
  receive cost visibility. An ordinary/new sales rep receives customer selling
  price, permitted floor/discount authority, and approval status only. Restricted
  fields are removed from API responses, exports, PDFs, search, and logs.

### Quote signer verification and binding acceptance

- A secure link may preview a quote. Final acceptance requires either an
  authenticated authorized account signer or a one-time code sent to the verified
  signer email already associated with the account.
- Immediately before acceptance, show a concise binding disclaimer and require
  affirmative checkboxes confirming that accepted sourced/backordered lines are a
  firm commitment, Unite may issue supplier POs in reliance on the acceptance,
  and committed lines cannot be cancelled.
- Signer enters/confirms legal name, title, and customer PO, then performs one
  clear acceptance action.
- Evidence record contains signer/account identity, verified email/OTP event,
  timestamp, IP, user agent/device metadata, quote ID/revision, immutable accepted
  line snapshot, terms/disclaimer version, and cryptographic hash of the accepted
  quote document. Send a receipt/PDF to both parties.
- This lightweight electronic-signature flow avoids unnecessary DocuSign friction
  while preserving an auditable acceptance record. External e-sign can remain an
  optional future provider for accounts that require it.

### Supplier purchase orders and vendor communication

- The practical vendor cycle is human-assisted: confirm availability, negotiate
  price, confirm quantity and delivery date, then issue the PO.
- PO statuses support draft, approval required, approved, sent, vendor viewed,
  vendor acknowledged, change requested, deposit/payment pending when applicable,
  preparing, ready to ship, in transit, partially received, received, reconciled,
  closed, and cancelled before commitment.
- Use Customer.io for transactional delivery, open, and link-click telemetry plus
  reporting webhooks. Email-open data is directional because privacy proxies can
  preload pixels. An email attachment cannot reliably report that the vendor
  opened it.
- Send a normal PDF attachment for trust plus a secure **Review purchase order**
  link. The hosted review offers **Acknowledge**, **Request changes**, and
  **Cannot fulfill**. The explicit vendor action, not an open pixel, is the proof
  of acknowledgment.
- Approved PO review has a single clear **Send purchase order** action. Record the
  exact PO revision, recipient, sender, Customer.io message ID, sent/delivered/
  opened/clicked events, hosted-view event, acknowledgment, and response.
- Route supplier replies through `suppliers@unitemedical.net` or another dedicated
  procurement inbox. An ingestion agent links mail by PO number and extracts
  acknowledgments, changes, expected ship date, carrier, and tracking number.
- If Unite supplies the carrier account, retain the outbound label/tracking from
  the carrier integration. If vendor freight is included, ask the vendor to put
  the PO number in the subject and tracking in the reply so the agent can capture
  it. The receiving daily log shows expected inbound freight.
- Sales/customer service may create POs. Approval triggers remain new/unapproved
  vendor, prepayment/deposit, margin below policy, compliance exception, quantity
  above customer commitment, price different from accepted offer, and configurable
  dollar threshold.

### PO-only receiving, shortages, and AP

- **No PO means no receipt.** Remove blind receipt from both UI and backend. Goods
  arriving without a valid open PO enter a dock exception with photos/documents
  and remain physically segregated until staff creates/locates and approves the
  correct PO. They do not enter sellable or on-hand inventory.
- A SKU not on the selected PO is also a full stop. Do not provide a bypass that
  converts it to a manual receipt.
- Receive each vendor shipment as its own batch and classify exact, short, over,
  damaged, wrong, unexpected, missing-required lot/expiration, or quality hold.
- Vendor backorder is explicit at the PO-line level. Track ordered, shipped,
  received, accepted, rejected, previously billed, billable received, and still
  outstanding quantities. A partial vendor shipment keeps the PO open.
- Finance receives a shortage/variance notification immediately. The maximum
  payable quantity is accepted received quantity minus quantity already billed.
- If a vendor invoice bills 10 but only 8 acceptable units arrived, approve/pay
  only 8 units plus matching allowed freight/tax. Hold the unmatched 2 and request
  a corrected/partial invoice or retain the unpaid balance against the vendor
  backorder. Never approve the full bill merely because the PO ordered 10.
- Three-way matching is performed per line and per receipt batch across PO,
  accepted receipt, and vendor invoice. QBO receives the approved bill/payment
  amount and the open variance/backorder reference.
- Backorder allocation and `backorder.stock_arrived` notifications run from the
  accepted receipt, not from the vendor's shipping notice.

### Backorders, receiving, and suborders

- A parent order number uses the form `Unite-WMS-000-000`.
- Each separately available/fulfilled batch becomes a suborder:
  `Unite-WMS-000-000-2`, `Unite-WMS-000-000-3`, and so on.
- The original available batch uses the parent order number. Later batches use
  numbered suffixes so staff and customers can see that they belong together.
- Do not charge or invoice backordered lines until that batch is available and
  ready for its payment/shipment step.
- Each suborder receives its own invoice, freight charge, shipment, label,
  tracking number, packing slip, and status history.
- Customer backorder display says **Date pending** until an admin enters an ETA or
  an integrated logistics source provides one.
- Flexport milestones may populate inbound status/ETA for Unite-managed freight
  when a real linked Flexport shipment exists. Do not promise an ETA for an item
  Unite has not sourced yet.
- Receiving must detect when scanned-in inventory satisfies a backorder. It emits
  a durable `backorder.stock_arrived` event that identifies affected parent orders,
  suborders, customers, quantities, and assigned reps.
- That event creates an admin-dashboard notification and email/task for the
  responsible admin/account rep. It does not silently ship the inventory.
- Scan-in and scan-out must be ledger-safe and tied to PO/inbound, lot, owner,
  warehouse, bin, actor, and idempotency key.

### Product tracking policy and scanner hard blocks

- Audio clarification from `Devine Ruedi 6.m4a`: **lot and expiration may never be
  blank on a receipt.** Each field must contain either the actual scanned/manual
  value or an explicit `N/A` attestation. Missing/null values are rejected.
- `N/A` is evidence, not a default. It means a scanner captured no applicable value
  or an identified staff member physically checked the product and attested that the
  field does not exist. Store actor, time, capture method, and reason.
- Product/variant setup controls whether an actual lot/expiration value is mandatory
  or whether an explicit `N/A` attestation is permitted. A required actual value
  cannot be satisfied by `N/A`.
- One SKU may exist in multiple concurrent lots with different expiration dates.
  Keep each SKU + owner + lot + expiration combination separate. Do not overwrite or
  collapse one lot into another.
- Every pick, shipment, sale, return, and recall retains the exact lot allocation and
  quantity. One order line may be fulfilled from multiple lots and must show every
  allocation in internal traceability records.
- Serial and UDI remain separately configurable as Not tracked, Optional, or Required.
- If an actual lot or expiration is required, shipping cannot complete until a valid
  value is captured. There is no warehouse bypass. An authorized manager must correct
  the inventory record.
- Receiving parses GS1/UDI where present and otherwise uses internal barcode,
  photo/OCR confirmation, or flagged manual entry.
- Picking validates product, lot/expiration policy, quantity, and reservation.
- Packing slips never contain pricing.
- Warehouse substitutions do not exist. The customer receives the item selected
  or an explicitly approved alternative from the customer-facing order/reorder
  experience.
- Scanner buy and implementation guide:
  `~/Desktop/Unite_WMS_Scanner_Buy_and_Implementation_Guide.docx`.

### Tracking, LTL, and customer-arranged pickup

- Keep customer tracking simple: real carrier status is emailed and visible in
  the account. Remove demo timers and do not fabricate movement.
- Small parcel is considered picked up when the carrier scan arrives. A separate
  awaiting-carrier customer state is not necessary beyond a normal label-created
  status.
- Customer tracking does not include a return-request link.
- Third-party/customer carrier pickup requires an arrival/pickup notification to
  Unite and must remain visible in the order timeline.
- Unite currently leaves ShipStation, re-enters pallet dimensions/weight in
  LTLSelect, generates labels/BOL, schedules pickup, and manually copies tracking.
  Replace that with one LTL workflow that stores quote, pallet data, booking,
  labels/BOL, pickup confirmation, PRO/tracking, and customer status.
- If Unite schedules LTL, the system should book the carrier and retain tracking.
- If the customer arranges pickup, notify them when freight is ready and include
  pallet count, dimensions, weight, pickup address, reference, and readiness time.
- Customer or distributor selects an available pickup window constrained by warehouse
  hours and cutoff rules. Confirmed pickup window range: **9:00 AM to 4:00 PM**.
- Warehouse receives a daily pickup schedule and arrival notification.
- FedEx Freight became an independent LTL company on June 1, 2026. The
  newly independent FedEx Freight Developer Portal now documents APIs for:
  - Account-specific LTL rates and transit information.
  - Shipment validation/creation.
  - Freight labels and BOL documents.
  - Pickup availability, creation, and cancellation.
  - PRO/tracking events, reference lookup, notifications, and documents.
- LTLSelect has no publicly documented API. Treat it as a web TMS only unless
  Unite receives private partner access. Do not automate its website.
- ShipStation has no documented public LTL commodity/class/NMFC/BOL/PRO booking
  workflow. Keep it as the parcel orchestration layer, not LTL.
- Build a server-side FedEx Freight adapter because the Freight APIs do not permit
  browser CORS calls:
  `rate -> create/validate shipment -> save PRO/BOL/labels -> check pickup ->
  create/cancel pickup -> track`.
- Persist three distinct modes:
  - `FEDEX_FREIGHT_UNITE_BILLED`
  - `FEDEX_FREIGHT_THIRD_PARTY_BILLED`
  - `CUSTOMER_ARRANGED_CARRIER`
- A 9:00 AM to 4:00 PM window can be submitted as package-ready and warehouse-
  close/access times, but display it as requested until carrier confirmation.
- Customer-arranged freight is billed directly by the customer's carrier, not
  described as free. Require carrier/SCAC, booking number, pickup window,
  dispatch contact, BOL/labels, and PRO when available. Mark shipped only after
  signed custody transfer.
- Build against FedEx Freight sandbox first and verify header/endpoint details
  with technical support because the new portal currently contains documentation
  inconsistencies.

### Reorder, substitution offers, and lifecycle marketing

- Reorder is authenticated and always opens a review screen.
- Replacement acceptance is explicit and stored as immutable customer consent.
- Reorders reconfirm PO, address, shipping/carrier account, payment, and expired
  tax documentation.
- AI extraction stores tax-certificate jurisdiction, ID, effective date, expiry,
  and confidence. Send expiry reminders and block the next order until a required
  replacement certificate is uploaded/approved.
- The system may offer a cheaper alternative or disclosed short-dated product
  when it is functionally appropriate. Show exact expiration/remaining shelf life,
  discount, and product difference. Customer must explicitly accept it.
- New product alerts target customers who bought the same category or linked
  sister products. Do not send indiscriminate catalog blasts.
- Reorder cadence can be bootstrapped from historical Shopify/HubSpot order data,
  then updated from Unite orders.
- No automatic order placement initially.

### RMA and returns

- Customer starts an RMA from the original order and provides item, quantity,
  reason, opened/unopened, condition, photos, lot/serial/UDI when applicable, and
  desired refund/exchange.
- Manufacturer defects require documentation/photos and manual review.
- Opened sterile/single-use items are non-returnable except verified manufacturer
  defect. Other approved non-returnable categories remain as decided.
- System generates the RMA number automatically. Staff never hand-assigns it.
- Unite/manufacturer pays return freight only for verified defect, wrong product,
  or Unite shipping error. Customer pays discretionary return freight.
- Discretionary unopened returns within 30 days incur a **15% restocking fee based
  on returned merchandise value**. There is no first-return forgiveness.
- Every return enters quarantine. Restock requires system validation plus human
  inspection/checklist approval.
- Refunds are manually approved in Stripe after inspection and return only to the
  original payment method. Terms accounts use QBO credit memo. Wire/check refunds
  route through accounting.
- RMA routes to the assigned account rep/customer-service owner and appropriate
  admin/returns queue. Customer sees RMA and refund/credit status.

### Roles and account ownership

- Roles are composable. One person may hold warehouse operator, manager, finance,
  sales, or admin permissions as assigned.
- Finance may post controlled inventory adjustments only through count/
  reconciliation workflows with reason and audit trail. The warehouse physical
  count/change feeds the financial inventory consequence. No direct unlogged
  quantity edit exists.
- Add a **Sales / Customer Service** role with permission to create customer
  orders, create purchase orders, adjust pricing within assigned authority, follow
  and process the order end to end, and see assigned-account shipments/exceptions.
- Pricing changes and PO/order actions retain actor, reason, previous value, and
  audit history. Larger discounts can still require approval policy.
- Every customer account has an assigned account owner/customer-service rep plus
  optional signer/approver contacts.
- RMA, backorder arrival, payment exception, shipment exception, reorder signal,
  and account tasks route to that owner.
- Unified exception logic distinguishes prepaid orders from approved credit-term
  accounts. A credit account is not incorrectly reported as blocked merely because
  payment has not yet occurred.

### CRM ownership and communication systems — QUESTION 8 APPROVED

- Unite is the operational customer system of record: account owner, authorized
  signers, Buyer/AP/Receiving contacts, credit and pricing authority, tax status,
  quotes, orders, backorders, RMAs, exceptions, and reorder/demand signals.
- Keep HubSpot for the current sales workflow and historical CRM during launch:
  leads, opportunities, pipeline stages, rep activity, migration history, and sales
  reporting. Review replacement only after observing Jacoby's real workflow; do not
  remove it during warehouse/accounting launch stabilization.
- Customer.io owns transactional and permissioned lifecycle communication including
  sourcing assignments, quote/PO events, shipment/delivery, backorder arrival,
  certificate expiration, reorder reminders, relevant product alerts, RMA updates,
  and payment/AR reminders.
- Fathom remains the meeting-recording source. Phone, email, and meeting events attach
  to the same Unite account timeline and route material follow-up to the owner.
- Every account has an assigned owner. Open sourcing, RMA, backorder, payment,
  shipment, and reorder work follows reassignment to the new owner.
- Operational email does not require marketing consent. Promotional messages do.
  Passive/scraped visitors are never silently inserted into Customer.io.
- Opens are directional only. Explicit clicks, hosted actions, acknowledgments, and
  completed business events are stronger evidence.

### Distributor-owned stock, settlement, and pickups — QUESTION 9 CORRECTED

- Two distinct distributor flows must remain separate:
  1. The distributor buys Unite inventory and may ask Unite to blind-ship to the
     distributor's customer.
  2. The distributor owns inventory physically stored at Unite, and Unite sells that
     owner-isolated stock to a Unite customer.
- In flow 2, the distributor **must never receive or view the Unite customer PO**.
  Do not expose the Unite customer order, customer pricing, margin, or customer
  documents through the distributor portal, API, exports, email, or settlement PO.
- When Unite sells distributor-owned stock, send the distributor an owner-scoped
  stock-depletion notification only: distributor SKU, Unite SKU mapping when allowed,
  lot/expiration, quantity sold, remaining inventory, event time, warehouse, and the
  settlement PO reference. Customer identity remains hidden unless a separate,
  explicitly approved fulfillment instruction requires destination disclosure.
- Store the agreed settlement unit price and its effective dates on the distributor
  product/ownership agreement. It is not inferred from the Unite customer sell price.
- A sell-through event creates a draft supplier/settlement PO from Unite to the
  distributor for the exact units sold at the agreed settlement price. Staff reviews
  and sends it through the normal PO approval/acknowledgment path. The movement is not
  marked settled merely because stock was decremented.
- Distributor dashboard shows only that owner's inventory, available/reserved units,
  exact lots/expirations, stock movements, service history, trailing run rate, days of
  cover, reorder threshold, open settlement POs, and settlement/payment status.
- Low-stock notifications go to the distributor by dashboard and email, using that
  owner's run rate and agreed threshold. They do not silently create replenishment or
  transfer ownership.
- Audio clarification from `Devine Ruedi 7.m4a`: for distributor-originated blind-ship
  orders, the distributor may provide its third-party carrier/account or request a
  courier/pickup. The request must alert Unite warehouse/admin staff.
- Pickup is a stateful custody workflow: requested, reviewed, confirmed, ready,
  arrived, handed off, cancelled, or no-show. A requested window is not confirmed
  until Unite validates warehouse readiness/cutoff and acknowledges it. Mark shipped
  only after documented custody transfer.
- For a distributor-originated blind shipment, the distributor may see all destination
  and contact fields required to ship to its own customer.
- Unite does not communicate directly with the distributor's customer. Unite sends the
  tracking number to the distributor's designated point of contact and adds it to the
  distributor portal/order record. The distributor or its brand owns all tracking
  communication to the end customer.
- Distributor pickup hours are **9:00 AM to 4:00 PM**. A request remains pending until
  Unite confirms warehouse readiness.
- Capture the courier, driver, BOL, label, and custody fields required by the selected
  carrier/shipping-label workflow. Do not invent extra custom driver fields that the
  carrier does not require. Shipment still requires evidence of carrier pickup or
  custody transfer before it is marked shipped.
- **RESOLVED FLOW DISTINCTION:** distributor-scheduled blind shipments in flow 1 do
  not create settlement POs. Flow 2 does exist: Unite may sell inventory owned by a
  distributor and then owes that distributor for the units sold. For flow 2 only,
  Unite creates the supplier/settlement PO at the stored agreed price so the liability
  can enter AP and close against payment evidence.
- **DECIDED:** distributor-owned sell-through settlement is created **per sale**. The
  exact event boundary, AP timing, aggregation behavior for a single sale, and exception
  handling will be reconciled from Damon's forthcoming recording before final wiring.

### Anonymous catalog → Quick Quote flow

- Replace anonymous **Add to cart** and generic **Request quote** controls with
  **Add to Quick Quote**.
- Anonymous visitors can build a temporary multi-product quote list with
  quantities.
- The Quick Quote list supports free-text **Add another item** rows for products
  not in the catalog.
- Product and source context must persist through business verification and
  account creation. A buyer must never rebuild the list after signing up.
- Collect company name, contact name, business email, website, and shipping ZIP
  only after the buyer finishes the quote list.
- Once company/email/website verification passes:
  - Stocked products receive instant default/retail pricing.
  - Sourced/custom/unstocked products route to staff review.
- Collect shipping ZIP and query Unite's shipping/rate account to show shipping
  when a real rate is available.
- Quote validity: **14 days**.
- After quote generation, primary next action is **Create/finish account and
  continue to order**, not "wait for a salesperson."
- Once account creation completes, carry the quote directly into acceptance and
  order flow.
- Goal: reduce salesperson lift for straightforward stocked-product quotes and
  let staff focus only on sourced/custom exceptions.

**Integration dependency:** live shipping pricing requires the direct
ShipStation/carrier-rate credentials. Until configured, show shipping as
"calculated after account/address confirmation" rather than inventing a rate.

**Observed anonymously on `/portal/quote` (2026-07-03):**

- The self-serve quote portal displays list prices to anonymous visitors.
- It allows quantity entry and includes a free-text sourced-item request, which
  are useful building blocks for the approved Quick Quote design.
- It does not verify company/email/website before revealing pricing.
- It does not collect shipping ZIP or calculate shipping.
- It does not persist the quote through account completion into order flow.
- It only offers a generic sign-in prompt for negotiated pricing.

### Live defects observed during walkthrough

**Observed anonymously on `/catalog` (2026-07-03):**

- Product prices are visible to a logged-out visitor.
- Add-to-cart buttons are active for a logged-out visitor.
- The anonymous cart displays 36 seeded items.
- An ADMIN link is visible in the public utility bar.

These are launch-blocking relative to the access model above. Anonymous state
must be genuinely empty and must not expose ordering controls or demo state.

### Implementation test cases

1. Logged-out visitor sees catalog products but no prices and no add-to-cart.
2. Logged-out/unapproved visitor can complete Quick Quote with business email +
   website.
3. Quick Quote creates CRM company/contact/task but does not grant account access.
4. Strong business registration auto-approves and starts at retail/default tier.
5. Weak business signals route to manual review within the one-day SLA.
6. Newly approved account sees only validated retail/default prices.
7. SKU without a retail/default price cannot be ordered.
8. Default payment path creates invoice payable by bank/ACH.
9. Pay-later terms require separate credit approval.
10. Card option visibly adds the approved processing surcharge and Stripe Radar
    evaluates the payment.
11. Same-domain registrations remain separate until staff chooses to merge.
12. Approval assigns rep, credit status, CRM task, welcome email, and onboarding
    task/incentive.

## Compound founder decision round — questions 10 through 16

### Question 10 — quality, expiration, and recall control — PARTIALLY APPROVED

- FEFO is mandatory for expiring products.
- Expired stock automatically enters quality hold and cannot allocate or ship.
- Unite has no universal short-dated threshold. Customer tolerance varies. Every
  short-dated offer must disclose the exact expiration and remaining shelf life and
  retain that customer's explicit acceptance. Do not silently impose one global number.
- Damaged, wrong, suspect, recalled, and returned stock enters quarantine.
- Only Damon or another Admin may release quarantine.
- Jacoby, VP of Sales, receives and owns all recall matters at present.
- Damon already has a recall system/workflow. **OPEN ITEM:** inspect and simulate that
  existing system before replacing it or freezing new recall routing, notification,
  blocking, and disposition rules.
- Keep evidence for product disposal and return to vendor. Unite does not operate an
  in-house destruction workflow. Expired product is disposed of, with actor, date,
  quantity, lot/expiration, reason, and evidence retained.

### Question 11 — AP, AR, QBO, settlement, and cash release — APPROVED

- QBO owns accounting truth. Unite owns operational quantity and workflow state.
- A supplier bill requires a matching supplier PO, accepted receipt, and vendor
  invoice.
- Short receipts approve only accepted quantity plus matching permitted freight and
  tax. Rejected, missing, unexpected, previously billed, or price-variance amounts
  remain held.
- Approved distributor settlement POs become QBO vendor bills.
- Settlement movements close only after matched vendor-bill payment evidence.
- Off-platform check or wire release requires finance evidence and an audited action.
- Refunds return through the original payment rail when possible.
- Manual write-offs, credit releases, and payments above a defined threshold require
  a second approver.
- **DECIDED FOR NEW ORDERS:** a new order over **$10,000** requires Damon's approval
  before the order may be released or sent onward. The precise downstream release
  boundary and any additional rules will be reconciled from Damon's forthcoming
  recording.
- **STILL OPEN PENDING RECORDING:** whether the same $10,000 threshold also governs
  manual write-offs, credit releases, refunds, and off-platform payment releases.

### Question 12 — customer exception desk and service recovery — APPROVED

- One exception queue covers payment, sourcing, backorder, pickup, carrier,
  delivery, RMA, tax, credit, and supplier failures.
- Every exception has an owner, severity, due time, customer-impact status, and next
  action.
- The assigned account owner receives the first task. Warehouse, finance, or sourcing
  receives the specialist task when applicable.
- Unowned or overdue work escalates to Damon.
- Customer-impacting exceptions receive a same-business-day update.
- Sending an email does not mark an exception resolved.
- Credits, replacements, and concessions require a reason, actor, and appropriate
  approval authority.

### Question 13 — roles, privacy, and server-side access — APPROVED

- Roles are composable: Sales / Customer Service, Warehouse Operator, Warehouse
  Manager, Finance, Sourcing, Admin, Distributor, and Customer Signer.
- Ordinary sales users receive sell price, available discount authority, and approval
  status, but not internal cost or vendor identity unless separately authorized.
- Warehouse users receive inventory, lot, location, and fulfillment data, but not
  customer pricing.
- Distributor access is owner-scoped at the API and database-projection boundary.
- Sensitive actions require server-issued identity and authorization, not a
  browser-local role.
- Admin, finance, and manager accounts require MFA.
- Pricing, PO, inventory, refund, credit, role, and settlement changes are audited.
- Raw database synchronization is unavailable to ordinary browser roles.

### Question 14 — compliance, documents, and retention — APPROVED

- Preserve quote acceptance, customer PO, supplier PO, acknowledgments, receipts,
  lot genealogy, shipping evidence, invoices, payment evidence, RMAs, credits, and
  recall records.
- Tax-certificate records retain the source document, extracted fields, reviewer,
  validation state, and expiration.
- Supplier approval retains compliance evidence and history.
- Do not collect patient information unless an explicitly approved workflow requires
  it.
- Legal hold prevents deletion.
- Customer and distributor exports exclude internal cost and unrelated account data.
- **DECIDED:** retain these operational and compliance records for **3 years**. Legal
  hold still prevents deletion. Accounting/legal review may require a longer period
  for a specific record class, but never a shorter default without a new decision.

### Question 15 — integration failures and recovery — APPROVED

- Stripe owns payment events. QBO owns accounting records. Customer.io owns
  communication delivery metrics. HubSpot owns the current sales workflow. WMS owns
  inventory and lot movements. Carrier systems own labels and tracking.
- Every webhook is authenticated, idempotent, retried, and written to an exception
  queue after final failure.
- Integration failure never creates a false success state.
- Manual fallback requires actor, evidence, reason, and later reconciliation.
- Admin integration health shows last success, last failure, queued retries, and
  unresolved exceptions.

### Question 16 — launch cutover and daily operating control — OPEN SCENARIO WORK

Do not freeze this question from a checklist alone. Alex and Damon want to simulate the
full operation and compare different scenarios first. The scenario program must include:

- Opening physical inventory by owner, warehouse, bin, lot, and expiration.
- Catalog price and package-data exceptions.
- Distributor agreements, settlement prices, sell-through, low stock, and payment.
- Vendor, customer, signer, carrier, tax, and notification contacts.
- Role and access combinations.
- Stripe, QBO, Customer.io, HubSpot, parcel, and LTL failures and recovery.
- A stocked order, sourced order, partial receipt, backorder, distributor-owned sale,
  blind-ship pickup, RMA, refund, recall, and manual-continuity drill.
- Go-live authority, rollback, and the daily operating brief.

Question 16 remains an explicit walkthrough TODO until those simulations show which
launch controls and daily views are actually needed.
