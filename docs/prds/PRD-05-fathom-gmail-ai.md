# PRD-05 — Fathom + Gmail AI Brain

**Source:** CTO Brief §5, §9 (Priority #4)
**Owner:** Alex (CTO) + VP Sales as product partner
**Status:** draft
**Depends on:** PRD-01 (Platform), PRD-06 (HubSpot — Fathom action items push to HubSpot)
**Blocks:** nothing critical; unlocks "CEO daily digest"

> "Every call recorded. Every task assigned. CEO daily digest." — Brief §2

---

## 1. North star

Every customer/vendor/rep call is recorded. Every action item is
extracted and assigned. CEO opens email in the morning to a 5-bullet
digest that surfaces the most important things from the previous day,
without having read a single thread.

---

## 2. Current state

- Fathom: **not integrated**. Vision: record Zoom / Google Meet calls,
  extract action items, push to HubSpot
- Gmail: primary email tool. CFO overwhelmed by Shopify order
  notifications (manual cross-reference into QBO Desktop)
- The `services.js` `fathom` stub does a regex action-item extraction
  on transcripts — a starting reference for the real workflow

---

## 3. Scope

### In scope

- Fathom webhook receiver
- Claude-powered transcript parsing (objections, competitive mentions,
  next steps, coaching opportunities)
- Action items push into HubSpot as Tasks (depends on PRD-06)
- Gmail API integration (read scopes only — we don't auto-send from
  team inboxes)
- "Structured order dashboard" replacing the CFO's email-as-inbox
  workflow (depends on PRD-02 so QBO is already populated)
- CEO daily digest — generated nightly, delivered via email at 6am ET
- Google Calendar sync (rep meetings → HubSpot engagements)
- Calendly integration (booked meetings auto-create HubSpot engagements)

### Out of scope

- Real-time call coaching / interruption (post-call analysis only for v1)
- Replacing Gmail (CEO/CFO keep their inboxes; we layer on top)
- Outbound email automation — that's HubSpot + Resend (PRD-06)

---

## 4. Workflows

### 4.1 Fathom call → HubSpot tasks + insights

```
Fathom call ends
    → webhook fires to /hooks/fathom
    → we fetch the transcript + summary
    → Claude pass 1: extract action items as a JSON array of
        { owner_email, due_date, task, related_deal_id?, related_contact_id? }
    → Claude pass 2: extract sales insights:
        { objections[], competitor_mentions[], pricing_discussions[],
          next_steps_summary }
    → HubSpot:
        · create Task per action item, assign to owner_email
        · append Note to the contact/deal with the insights JSON
    → our `activities` table gets one row per call with full
      transcript + extracted JSON for analytics (PRD-12 input)
```

### 4.2 Gmail "structured order dashboard"

The CFO's pain: Shopify sends an order email; she manually re-types
billing data into QBO Desktop.

After PRD-02: orders are already in QBO via API. **This PRD adds the
visual layer**:

- `/admin/orders/inbox` shows: incoming Shopify orders, QBO invoice
  status, payment status, customer balance, one-click "send to
  customer" if action needed
- Gmail integration filters order-notification emails into a label and
  the dashboard reads them as a backup signal (in case Shopify webhook
  ever lags)

### 4.3 CEO daily digest

- Job runs at 5:30am ET every business day
- Reads: yesterday's orders, HubSpot deal stage changes, hot leads,
  low-stock alerts, overdue invoices, Fathom highlights flagged
  "coachable" or "high-priority"
- Claude composes a 5-bullet morning brief with each bullet linked to
  the underlying record (deep link to `/admin/...`)
- Delivered via Resend to `damon@unitemedical.net`
- Same generator powers `/admin` (read view) so CEO can re-read on
  demand

### 4.4 Calendly + Google Calendar

- Calendly webhooks → HubSpot `Meeting` engagement (PRD-06)
- Google Calendar API watches rep calendars (`gmail.readonly` +
  `calendar.readonly`) and writes meetings to HubSpot if Calendly
  isn't used (e.g., reps booking directly in Calendar)

---

## 5. Data contract

```ts
// activities table (already exists, extended)
{
  id:                string,
  kind:              'call' | 'email' | 'meeting' | 'note',
  source:            'fathom' | 'gmail' | 'calendly' | 'calendar' | 'manual',
  external_id:       string | null,     // Fathom call ID, Gmail thread ID, etc.
  who:               string,             // rep email
  org_id:            string | null,
  contact_id:        string | null,
  deal_id:           string | null,      // HubSpot deal ID
  subject:           string,
  body:              text,
  duration_min:      number | null,
  transcript_url:    string | null,
  recording_url:     string | null,
  action_items:      jsonb,
  insights:          jsonb,
  created_at:        timestamptz,
  raw_payload:       jsonb,              // append-only audit
}

// daily_digests
{
  id:               string,
  date:             date,
  recipient:        string,
  bullets:          jsonb,                // [{summary, deep_link, severity}]
  generated_at:     timestamptz,
  delivered_at:     timestamptz | null,
}
```

---

## 6. Phases

### Phase 1 — Fathom webhook + transcript ingest

- Fathom account configured to webhook our `/hooks/fathom`
- Receiver fetches transcript via Fathom API, stores in `activities`
- No Claude pass yet — just raw ingest
- Admin UI: `/admin/crm/calls` shows recent calls + transcripts

**Exit:** Every call recorded in Fathom appears in our DB within 5
minutes of ending.

### Phase 2 — Claude extraction pass

- Implement `claudeClient.extractActionItems(transcript)` and
  `claudeClient.extractInsights(transcript)` — both return validated
  JSON via Anthropic's tool-use feature
- Store results on the activity row
- Admin UI shows the structured extraction next to the transcript

**Exit:** For a manual sample of 20 calls, > 90% of action items
flagged by the rep match the Claude extraction.

### Phase 3 — HubSpot push (depends on PRD-06 Phase 2)

- Action items → HubSpot Tasks (assignee resolved by email)
- Insights → HubSpot Note appended to deal/contact
- "Coaching" tag applied to calls flagged with concerning patterns
  (price objections, competitor mentions in deal stage > X)

**Exit:** A new Fathom call produces matching HubSpot Tasks within 5
minutes. Reps see them in their HubSpot home view.

### Phase 4 — Gmail order inbox

- Google Workspace OAuth: read-only for `info@`, `sales@`,
  `support@unitemedical.net`
- Gmail watch / push notification for new emails matching the
  Shopify-order pattern
- Cross-reference with QBO invoice (PRD-02); render `/admin/orders/inbox`
- One-click resolutions: "QBO invoice exists & paid → mark done";
  "QBO invoice missing → manually post" (rare after PRD-02 is live)

**Exit:** CFO can hit `/admin/orders/inbox` and triage a day's orders
in under 10 minutes (vs. ~2 hours manually today).

### Phase 5 — Daily digest

- Generator job runs at 5:30am ET on weekdays
- Resend template + Claude composition
- A/B with the CEO: he reads it for 2 weeks, gives feedback, we tune
  the prompt + signal sources

**Exit:** CEO reports the digest is reliable enough that he opens it
*before* opening email. 14 consecutive business days delivered with
no missed sends.

### Phase 6 — Calendar / Calendly

- Calendly webhook integration
- Google Calendar `watch` for non-Calendly bookings
- Both surfaces as `activities.kind = 'meeting'` and push to HubSpot

**Exit:** Booking a meeting in Calendly produces a HubSpot engagement
within 60 seconds.

---

## 7. Verifier

`scripts/ai_brain_check.py` (nightly):

- For 10 most recent Fathom calls, assert a corresponding HubSpot
  Task exists for every flagged action item
- For yesterday, assert a daily digest was generated and delivered
- Alert if the digest is missing > 1 weekday in a 30-day window

---

## 8. Open questions

1. **Privacy posture**: customer/vendor consent for recording — Fathom
   does this in-call. Update privacy policy to mention call recording
   for sales/support workflows. PRD-00 doesn't cover this; add a
   follow-up.
2. **Storage policy** for transcripts: how long do we retain? Default:
   3 years for closed deals, indefinite for open ones; document in
   `docs/runbooks/data-retention.md`.
3. **Coaching feedback loop**: does the CEO/VP Sales want a weekly
   "coaching review" page that surfaces patterns across all reps?
   Brief §9 implies yes. Default: add in Phase 3 as a separate
   `/admin/crm/coaching` view.
4. **Personal vs. shared Gmail inboxes**: the brief says all order
   notifications today go to the CFO's inbox. We integrate the
   *shared* `support@` and `sales@` only; CFO's personal inbox is
   untouched.

---

## 9. Out-of-band

- Fathom team plan (or per-rep licensing) — Fathom is per-user
- Anthropic API key + budget cap (digest + extraction usage estimate
  in PRD-11)
- Google Workspace admin to grant OAuth scopes
- Calendly Pro for webhook access
- New env vars: `FATHOM_API_KEY`, `FATHOM_WEBHOOK_SECRET`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CALENDLY_API_TOKEN`

---

## 10. Definition of done

- 14 consecutive weekdays of CEO digest delivered before 6am ET
- A Fathom call produces matched HubSpot Tasks within 5 minutes, >90%
  precision on a sampled audit
- CFO's morning triage takes < 10 minutes (vs. ~2 hours)
- A "coaching review" page shows patterns across the rep network
