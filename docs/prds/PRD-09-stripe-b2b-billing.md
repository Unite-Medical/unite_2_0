# PRD-09 — Stripe B2B Billing (Net-30/60 + ACH)

**Source:** CTO Brief §4 (Priority #8)
**Owner:** Alex (CTO) + CFO as product partner
**Status:** draft
**Depends on:** PRD-01 (Platform), PRD-02 (QBO reconciliation), PRD-14 (Portal payment status visibility)
**Blocks:** rep commission payouts (Phase 5)

> "Net-30/60 automation. ACH. Auto-collections. CFO no longer chases payments." — Brief §2

---

## 1. North star

Large B2B customers (hospitals, CVS, GoPuff, distributors) are billed
automatically per their terms: invoice issued, dunning sequences fire,
ACH or card collected, payment reconciles to QBO. The CFO doesn't
chase payments and doesn't manually post them.

---

## 2. Current state

- Stripe used as a basic payment processor
- Reactive + manual — customers pay when they want to
- No automated Net-30 / Net-60 billing
- No ACH for large hospital / retail customers
- `src/lib/services.js` `stripe` stub covers `createPaymentIntent` and
  `confirmPaymentIntent` only

---

## 3. Scope

### In scope

- Stripe Billing for Net-30 / Net-60 invoicing
- Auto-dunning sequences (configurable per customer tier)
- ACH bank transfer + card payment methods
- Webhooks for payment events → QBO reconciliation (PRD-02)
- Customer portal: invoice list, "pay now", payment history
- Stripe Connect for 1099 rep commission payouts (Phase 5)
- Auto-reconciliation: Stripe `invoice.paid` → QBO `Payment` → our
  `invoices.status = paid` → customer notified

### Out of scope

- International payment methods (US-only for v1)
- Crypto / alternative payment rails
- Lockbox / paper check ingestion (CFO continues that workflow in
  QBO; we reconcile after)

---

## 4. Customer payment terms matrix

| Customer tier | Default terms | Payment methods | Dunning |
|---|---|---|---|
| New account (any) | Card or ACH only | Stripe card, Stripe ACH | n/a (paid up-front) |
| A-tier (large hospital, gov) | Net-30 or Net-60 (per contract) | Stripe ACH (preferred), card backup | Day 0 receipt, Day 28 reminder, Day 35 escalation, Day 45 CFO notification |
| A-tier (large retail: CVS, GoPuff, etc.) | Per contract | EDI or wire | Manual |
| B-tier (mid ASC, regional dealer) | Net-30 (if approved credit) | Stripe ACH, card | Day 0, Day 25, Day 32 |
| C-tier (small clinic) | Card up front | Stripe card | n/a |
| Distributor | Net-60 (volume) | Stripe ACH | Day 0, Day 55, Day 65 |

New accounts start at "card up front" until they apply for credit and
pass `evaluateAccount` (`src/lib/accountApproval.js`, already in repo).
PRD-14 surfaces the credit application form.

---

## 5. Workflows

### 5.1 Invoice issue → payment → reconciliation

```
Order placed via portal
    → QBO Invoice created (PRD-02)
    → Stripe Invoice created with same line items, due date per terms
    → Stripe sends invoice email to billing contact
    → Customer pays via portal link (ACH or card)
    → Stripe webhook 'invoice.paid' fires
    → /hooks/stripe enqueues a reconciliation job
    → QBO Payment posted against the matching invoice
    → our `invoices.status = 'paid'`
    → customer notification email
    → if customer has a "thank you" sequence configured, fire
```

### 5.2 Dunning

```
Day 0:    Invoice email
Day -5:   "Coming due" reminder (if Net-30+)
Day +1:   Past-due notice
Day +7:   Past-due notice #2
Day +14:  Final notice + CFO Slack alert
Day +21:  Auto-pause new orders for that customer (configurable)
Day +30:  Account flagged in HubSpot; sales rep notified to call
```

Dunning sequences are template-driven; CFO can edit copy in
`/admin/settings/dunning`.

### 5.3 Rep commission payouts (Stripe Connect)

```
Monthly:
    Commission run computes payout per rep (PRD-06 Phase 6)
    For each rep with Connect onboarded:
        Stripe Transfer to their connected account
    For reps without Connect:
        ACH file generated, CFO uploads to bank
```

Connect onboarding: rep clicks "Set up payouts" in their HubSpot rep
portal (PRD-06) → Stripe Connect Express flow → done.

---

## 6. Data model

```ts
// invoices table (extends current shape)
{
  id:                  string,        // ours
  order_id:            string,
  customer_id:         string,
  qbo_invoice_id:      string | null,
  stripe_invoice_id:   string | null,
  amount:              number,
  due_date:            Date,
  terms:               'card' | 'ach' | 'net30' | 'net60' | 'wire' | 'edi',
  status:              'draft' | 'open' | 'paid' | 'past_due' | 'void' | 'uncollectible',
  paid_at:             Date | null,
  payment_method:      string | null,
  dunning_sequence_id: string | null,
  dunning_stage:       string | null,  // 'day_0' / 'day_25' / ...
}

// payment_methods (Stripe payment methods linked to customers)
{
  id:                 string,
  customer_id:        string,
  stripe_pm_id:       string,
  kind:               'card' | 'us_bank_account',
  is_default:         boolean,
  last4:              string,
  brand_or_bank:      string,
  added_at:           Date,
}
```

---

## 7. Phases

### Phase 1 — Real Stripe client + cards

- `stripeClient` replaces `services.js` stub
- Existing card-payment flow runs on real Stripe (likely already is —
  audit the production deployment)
- All Stripe webhook events received at `/hooks/stripe` with
  signature validation

**Exit:** Card payments in production work end-to-end and webhooks
arrive within 30 seconds of payment.

### Phase 2 — Stripe Billing for Net-30 / Net-60

- Stripe Invoices created on order placement for net-terms customers
- Default `collection_method = send_invoice`
- Auto-dunning rules configured per tier
- `payment_methods` (ACH) added in customer portal (PRD-14)

**Exit:** A test Net-30 order produces a Stripe invoice, customer
receives it, can pay via ACH, payment reconciles to QBO without
manual intervention.

### Phase 3 — Dunning + auto-pause

- Dunning template editor in admin
- Auto-pause: customer with > 21 days past-due automatically
  loses "ability to place new orders" status (portal check at order
  placement)
- Slack alert to CFO for any account hitting Day +14

**Exit:** Synthetic 30-day-past-due account triggers the full
dunning sequence; auto-pause activates correctly.

### Phase 4 — Customer-portal billing UI (depends on PRD-14)

- `/account/invoices` shows: open invoices, history, "Pay now",
  payment-method management
- Per-invoice deep link from email lands here

**Exit:** Customers self-serve payments without contacting Unite.

### Phase 5 — Rep commission payouts (Stripe Connect)

- Connect Express onboarding flow in `/rep/payouts`
- Monthly Transfer batch runs on the 5th of each month
- Audit log + receipt per rep

**Exit:** First commission run pays at least 3 reps via Connect with
full reconciliation against PRD-06's commission calculator.

### Phase 6 — Large-retail EDI (deferred decision)

- For CVS / Publix / GoPuff: payment is typically per their AP system
  via EDI 810/820
- Build minimal EDI 820 receiver to recognize payments → reconcile
  to QBO + our invoices
- This is genuinely complex; phase only happens if a contract
  requires it

**Exit:** TBD per real customer demand.

---

## 8. Verifier

`scripts/billing_check.py` (daily):

- Random-sample 20 paid invoices from last 7 days; assert Stripe
  Payment ID matches QBO Payment + our `invoices.status = paid`
- Assert no invoice has been in `past_due` > 45 days without CFO
  alert in the audit log
- Assert no auto-paused customer has placed an order

---

## 9. Open questions

1. **Sales tax**: who computes? Stripe Tax is simplest; QBO has its
   own. Default: Stripe Tax for the customer-facing portal, QBO
   handles back-office. CFO sign-off needed.
2. **Wire payments**: ach + card cover most cases; large hospital
   wires happen. Default: accept manually entered wires in QBO;
   verifier alerts if a wire arrives for an invoice still `open` in
   our DB > 24h.
3. **Refund flow**: from our portal or QBO? Default: from our portal
   (admin only); we post the refund + QBO `CreditMemo`.
4. **Auto-pause exceptions**: brief implies large accounts can be
   exempted ("CVS doesn't get auto-paused"). Default: `customers.never_pause = true`
   flag, manually managed for top accounts.

---

## 10. Out-of-band

- Stripe Connect application (Damon signs, federal EIN, etc.)
- Stripe Billing add-on (per Stripe pricing — usually free for net-30
  invoicing, pay-as-you-go for ACH)
- New env vars: `STRIPE_SECRET_KEY` (already exists), `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_CONNECT_CLIENT_ID`

---

## 11. Definition of done

- Net-30 / Net-60 invoices issued + collected without CFO touching
  them
- Dunning runs on schedule for all tiers
- 30 consecutive days where ≥ 95% of payments reconcile to QBO
  within 60 seconds
- First commission payout to ≥ 3 reps via Stripe Connect
- CFO confirms: they no longer chase payments day-to-day
