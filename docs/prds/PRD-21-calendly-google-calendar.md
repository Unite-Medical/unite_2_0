# PRD-21 — Calendly + Google Calendar Integration

**Source:** CTO Brief §5 — "A 1099 rep books a call via Calendly → Fathom records it → AI extracts action items → tasks pushed to HubSpot"
**Owner:** Alex (CTO)
**Status:** draft
**Depends on:** PRD-01, PRD-05 (Fathom + Gmail), PRD-06 (HubSpot)
**Blocks:** full 1099 rep activity visibility

> "A 1099 rep books a call via Calendly → Fathom records it → AI extracts action items → tasks pushed to HubSpot → manager sees all rep activity from home office" — Brief §1

---

## 1. North star

Every meeting — booked by a customer, rep, or vendor — flows through a single calendar system that syncs to HubSpot, triggers Fathom recording, and produces an auditable activity trail. The VP Sales sees every rep's calendar from the home office without asking.

---

## 2. Current state

- Calendly is mentioned in the brief but has zero implementation in the codebase
- No `calendly.js` client exists in `src/lib/external/`
- Google Calendar API is referenced in PRD-05 as a single phase (Phase 6) but with minimal detail
- No calendar UI exists in the admin panel
- No rep scheduling workflow exists
- Fathom integration (PRD-05) is ready to receive call data but has no trigger mechanism

---

## 3. Scope

### In scope

- **Calendly API integration** — read event types, scheduled events, invitees; receive webhooks for booking/cancellation/rescheduling
- **Google Calendar API integration** — read/write events, sync rep calendars to HubSpot, check availability
- **Rep scheduling workflow**: customer → books meeting via Calendly link → event created in Google Calendar → Fathom auto-joins → post-call: AI extracts tasks → HubSpot engagement created
- **Manager visibility**: `/admin/calendar` shows all rep meetings across the organization
- **Customer booking**: B2B portal includes "Schedule a call with your rep" button (uses Calendly embed)
- **Meeting-to-deal linking**: every meeting is associated with a HubSpot deal/contact

### Out of scope

- Replacing Google Calendar with another calendar system
- Building a custom scheduling widget (Calendly does this)
- Meeting room booking (no physical offices beyond warehouse)
- Video conferencing integration (reps use Zoom/Google Meet directly)

---

## 4. The complete meeting lifecycle

```
Customer/vendor clicks Calendly link
       │
       ▼
Calendly → books meeting
       │
       ▼
Calendly webhook → /hooks/calendly
       │
       ├── Creates Google Calendar event (if not auto-synced)
       ├── Creates HubSpot Engagement (meeting type)
       ├── Associates with Contact + Deal
       ├── Notifies rep via email/Slack
       └── Fathom auto-records (if Zoom/GMeet link present)
       
       [Meeting happens]
       
Fathom webhook → /hooks/fathom (PRD-05)
       │
       ├── Claude extracts action items + insights
       ├── Creates HubSpot Tasks for each action item
       ├── Updates the meeting engagement with summary
       └── Feeds into CEO daily digest
```

---

## 5. Calendly API contract

Base URL: `api.calendly.com`
Auth: Personal access token or OAuth 2.0

Key endpoints:
- `GET /event_types` — list all booking types (Sales Call, Demo, Vendor Review)
- `GET /scheduled_events` — list upcoming/past events
- `GET /scheduled_events/{uuid}/invitees` — who's attending
- Webhooks: `invitee.created`, `invitee.canceled`, `routing_form_submission.created`

### Event types to create in Calendly:

| Event type | Duration | Who books | Calendar |
|---|---|---|---|
| Sales Discovery Call | 30 min | Customer/lead | Rep's calendar |
| Product Demo | 45 min | Customer/lead | Rep's calendar |
| Vendor Review | 30 min | Vendor | Damon's calendar |
| Rep 1:1 | 30 min | Manager | Rep's calendar |
| Customer QBR | 60 min | Rep (on behalf of customer) | Rep's calendar |

---

## 6. Google Calendar API contract

Base URL: `googleapis.com/calendar/v3`
Auth: OAuth 2.0 with Google Workspace

Key endpoints:
- `GET /calendars/{id}/events` — list events
- `POST /calendars/{id}/events` — create event
- `GET /freeBusy` — check availability across multiple calendars
- `PATCH /calendars/{id}/events/{eventId}` — update event

Scopes: `calendar.readonly`, `calendar.events`

---

## 7. Data model additions

```sql
-- Migration: 0018_calendar.sql

CREATE TABLE IF NOT EXISTS calendar_events (
  id                TEXT PRIMARY KEY,
  calendly_event_id TEXT UNIQUE,
  google_event_id   TEXT,
  hubspot_engagement_id TEXT,
  event_type        TEXT NOT NULL,          -- 'sales_call', 'demo', 'vendor_review', etc.
  title             TEXT NOT NULL,
  scheduled_at      TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER NOT NULL,
  rep_id            TEXT REFERENCES profiles(id),
  customer_org_id   TEXT REFERENCES organizations(id),
  contact_email     TEXT,
  contact_name      TEXT,
  deal_id           TEXT,                   -- HubSpot deal ID
  meeting_link      TEXT,                   -- Zoom/GMeet link
  fathom_recording_id TEXT,                 -- linked after call completes
  status            TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_calendar_rep ON calendar_events(rep_id, scheduled_at);
CREATE INDEX idx_calendar_customer ON calendar_events(customer_org_id);
CREATE INDEX idx_calendar_date ON calendar_events(scheduled_at);
```

---

## 8. Phases

### Phase 1 — Calendly API client + webhook receiver

- Build `src/lib/external/calendly.js` with `realOrStub()` pattern
- Endpoints: `listEventTypes()`, `listScheduledEvents()`, `getEventInvitees()`
- Webhook receiver at `/hooks/calendly` for `invitee.created`, `invitee.canceled`
- Store events in `calendar_events` table

**Exit:** A Calendly booking creates a record in our system within 30 seconds.

### Phase 2 — HubSpot meeting sync

- On Calendly booking: create HubSpot Engagement (meeting type)
- Associate with Contact (match by email) + Deal (if identifiable)
- On cancellation: update HubSpot engagement status
- On completion (post-Fathom): attach recording summary to engagement

**Exit:** Every Calendly booking appears as a HubSpot meeting engagement on the correct contact record.

### Phase 3 — Google Calendar sync

- Build `src/lib/external/googleCalendar.js`
- Bidirectional sync: Calendly → Google Calendar (already native) + our events → Google Calendar
- Availability check via `freeBusy` API for rep scheduling
- Read rep calendars to populate `/admin/calendar` view

**Exit:** Admin can see all rep calendars in a unified view.

### Phase 4 — Customer portal integration

- "Schedule a call" button on customer dashboard (PRD-14)
- Calendly embed pre-filled with customer's assigned rep
- Booking confirmation in customer's portal view
- Pre-meeting prep: system generates a one-pager for the rep (customer's recent orders, open quotes, account health)

**Exit:** Customer books a meeting from the portal → rep gets the meeting + a prep sheet.

### Phase 5 — Manager dashboard + rep activity

- `/admin/calendar` page: unified calendar view across all reps
- Filters: by rep, event type, date range
- Activity metrics: meetings/week per rep, no-show rate, conversion from meeting → deal
- Integration with Fathom data: meetings with recordings vs. without

**Exit:** VP Sales can see "Marcus had 12 sales calls this week, 3 resulted in quotes, 1 converted."

---

## 9. Verifier

`scripts/calendar_check.py`:

- Assert every Calendly booking has a matching `calendar_events` record
- Assert every completed meeting has a HubSpot engagement
- Assert no meetings older than 24 hours are in 'scheduled' status without a completion/cancellation update

---

## 10. Open questions

1. **Calendly plan**: which Calendly tier supports webhooks + API access? Teams plan ($16/user/mo). Confirm we're on it.
2. **Google Workspace**: do 1099 reps get Google Workspace accounts or do they use personal calendars? Recommendation: Google Workspace accounts for consistency.
3. **Fathom auto-join**: does Fathom auto-join all meetings on the calendar or only explicitly tagged ones? Recommendation: all meetings — opt-out rather than opt-in.

---

## 11. Out-of-band

- Calendly Teams plan subscription
- Calendly API key or OAuth app registration
- Google Workspace admin consent for Calendar API access
- New env vars: `CALENDLY_API_KEY`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`

---

## 12. Definition of done

- Every Calendly booking syncs to our system, HubSpot, and Google Calendar within 60 seconds
- VP Sales sees a unified calendar of all rep activity
- Customer portal has "Schedule a call" with Calendly embed
- Fathom recordings are linked to calendar events
- Meeting → deal conversion metrics are visible in admin
