# The Damon Audit — Founder Time Capture & AI Leverage Program

> **Goal:** Damon's time is the scarcest asset in the company, and today it's
> spread across non-sales work. This program captures what his days actually
> look like, converts that into a ranked map of where software/AI can absorb
> the load, and ends with (a) a buy/build decision list and (b) a standing
> "Chief-of-Staff agent" that takes real work off his plate.
>
> Owner: Alex. Subject: Damon. Duration: 2 weeks capture → 1 day analysis →
> rolling build. Created 2026-07-03.

---

## 1. The design in one picture

```
  CAPTURE (2 weeks, passive + 3 interviews)
  ├── Plaud wearable → transcripts of calls/meetings/errands
  ├── Digital exhaust → email volume, calendar, admin usage, CRM touches
  └── Structured intake interviews (3 × 60-90 min, scripts below)
        │
        ▼
  PROCESS (automated — scripts in this repo)
  transcripts + exhaust ──▶ Claude activity classifier ──▶ time ledger
        │                    (taxonomy §4)                  (minutes/category/day)
        ▼
  ANALYZE (one afternoon, Alex + Damon)
  time ledger ──▶ leverage matrix: frequency × duration × delegability
        │
        ▼
  ACT (ranked)
  ├── ELIMINATE  — stop doing it (no software needed)
  ├── AUTOMATE   — build: agent/workflow on our platform
  ├── BUY        — off-the-shelf tool covers it
  ├── DELEGATE   — human (rep/VA/ops) with a playbook
  └── KEEP       — genuinely founder-only work (sales, relationships, judgment)
        │
        ▼
  THE DAMON AGENT — standing chief-of-staff automation (§7)
```

**The core measurement question:** for every recurring block of Damon's time —
*"does this require Damon's judgment, Damon's relationships, or just Damon's
hands?"* Hands → automate/delegate. Judgment → put an agent underneath it that
does the prep and drafts the output so judgment takes 5 minutes, not 50.

---

## 2. Capture layer

### 2.1 Plaud (or equivalent recorder) — the passive backbone
- **Buy:** Plaud Note ($159, card-shaped, MagSafe) or Plaud NotePin (wearable).
  Either exports transcripts; both do speaker separation well enough.
- **Protocol:** Damon wears/carries it for **10 working days**. Records: sales
  calls, vendor calls, internal check-ins, warehouse walk-throughs, windshield
  time voice notes. NOT recorded: anything he flags private + anything with a
  counterparty who hasn't consented (see §2.4).
- **The habit that makes it work:** after each call/meeting he says one
  sentence to the recorder: *"That was [who], about [what], I now have to
  [follow-up]."* That single sentence is worth more to the classifier than the
  whole call, because it names the **task debt** each interaction creates.
- **Export:** transcripts out of Plaud daily (their app exports .txt/.srt;
  auto-sync to a shared folder `~/damon-audit/transcripts/`).

### 2.2 Digital exhaust — the honest witness
People misreport their time; systems don't. Pull for the same 10 days:
- **Email**: sent-mail count + recipients + subject lines per day (Gmail API,
  read-only, one OAuth consent — the platform already has the flow coded).
- **Calendar**: every event with duration + attendees.
- **Platform usage**: our own admin audit_log already stamps every admin
  action with actor + timestamp — free data, zero setup.
- **Phone log** (optional): call durations from his carrier export/iPhone.

### 2.3 The three intake interviews (scripts in §5)
Recording alone misses the work that happens in his head and the work he's
*not* doing. Three structured sessions, recorded on the Plaud:
1. **The Day Tour** (day 1) — walk yesterday hour by hour, then a "typical"
   Monday and a "typical" Thursday.
2. **The Pain Census** (day 5) — every recurring task, scored live.
3. **The Wish List** (day 10) — what he'd do with 15 recovered hours; what
   only-Damon work is currently starved.

### 2.4 Consent & hygiene (non-negotiable)
- Two-party consent applies to call recording in several states (GA is
  one-party, but counterparties may be elsewhere). Rule: **external calls get
  the voice-note summary treatment, not raw recording, unless the counterparty
  consents.** Internal meetings: blanket team consent up front.
- Transcripts live in the shared folder, retention 90 days, then purged.
- Damon can delete anything before processing, no questions asked.

---

## 3. Processing pipeline (what Alex builds — ~1 day)

`scripts/damon_audit/` in this repo:

1. **`ingest.py`** — pulls transcripts folder + Gmail sent-items metadata +
   calendar export + admin audit_log into one normalized `events.jsonl`
   (timestamp, source, duration_est, raw_text).
2. **`classify.py`** — Claude (strict JSON schema, same pattern as the
   platform's `src/lib/ai/`) tags each event against the taxonomy in §4:
   `{category, subcategory, minutes_est, delegability: hands|judgment|relationship,
   energy: drain|neutral|charge, task_debt: [follow-ups created]}`.
3. **`ledger.py`** — aggregates into the **time ledger**: minutes per category
   per day, interruption counts, task-debt backlog, top-N recurring loops.
4. **`report.py`** — renders the one-page leverage matrix (frequency ×
   duration × delegability) + the ranked opportunity list, as docx/HTML.

Cost: pennies of Claude per day of transcripts. All local, nothing leaves the
machine except the LLM calls (no customer PII in prompts — classifier sees
redacted text; `ingest.py` strips emails/phones).

---

## 4. Activity taxonomy (what everything gets tagged as)

| Category | Examples | Default disposition |
|---|---|---|
| **SELL** — revenue conversations | prospect calls, demos, negotiations, key-account love | KEEP (protect & expand) |
| **SOURCE** — vendor/supply work | vendor emails, price-sheet wrangling, PO chasing, freight escalations | AUTOMATE (PRD-32 pipeline + agent) |
| **QUOTE** — pricing & quoting | building quotes, margin decisions, follow-ups on sent quotes | AUTOMATE prep (engine exists) / KEEP margin judgment |
| **OPS** — fulfillment & warehouse | order exceptions, shipping issues, inventory questions | DELEGATE + agent triage |
| **MONEY** — AR/AP/books | chasing payments, invoice questions, QBO cleanup | AUTOMATE (dunning agent exists, needs key) |
| **COMPLY** — regulatory/docs | PDAC questions, doc requests, FDA/GUDID chores | AUTOMATE (platform has the pipelines) |
| **ADMIN** — email triage, scheduling, data entry | inbox grooming, calendar tetris, retyping things between systems | ELIMINATE/AUTOMATE ruthlessly |
| **MANAGE** — people & partners | rep check-ins, warehouse lead, Restore/TJS relationship | KEEP core / agent-prep the rest |
| **BUILD** — product/strategy with Alex | roadmap, decisions, reviews | KEEP |
| **FIREFIGHT** — unplanned interrupts | "quick question" calls, escalations | measure hard — this is usually the biggest hidden tax |

Two cross-tags matter more than the categories:
- **Delegability**: `hands` (anyone/anything could do it) · `judgment` (needs
  his brain, but prep can be automated) · `relationship` (needs HIM).
- **Task debt**: follow-ups each event creates — the invisible second job.
  The audit counts them; the agent (§7) is designed to absorb exactly these.

---

## 5. Interview scripts (run these, record on the Plaud)

### Session 1 — The Day Tour (60–90 min, day 1)
Warm-up framing to say out loud: *"Nothing here is judgment. We're hunting for
work that's beneath you so we can buy it back."*

1. Walk me through yesterday, from first work touch to last. Hour by hour.
   (Don't let him summarize — "then what?" until the day is empty.)
2. Same for a typical Monday. Same for a typical Thursday.
3. Open your phone: last 10 calls — who, what, how long, and what follow-up
   did each create?
4. Open your sent mail from yesterday: for each email — could anyone else have
   sent it? What did you need to know to write it?
5. What do you do every single day no matter what? Every week? Every month?
6. Where does your day leak? What interrupts you most often, and who's it from?
7. When you're driving/at the warehouse, what work piles up that only you can
   unstick later?
8. What did you NOT get to yesterday that mattered?

### Session 2 — The Pain Census (60 min, day 5)
Build the list live in a spreadsheet, one row per recurring task:
1. Name every recurring task you can think of. (Prompt from the categories in
   §4 — "what vendor stuff eats time? what money stuff?…")
2. For each: **F**requency (per week) · **D**uration (minutes) · **P**ain
   (1–5, how much you hate it) · **S**kill (hands / judgment / relationship).
3. The two magic questions per task:
   - *"If a smart assistant did this and you just approved the result in 2
     minutes, would that work — or does it fail in ways only you can see?"*
   - *"What information do you need in front of you at the moment you do this?"*
     (That answer is the agent's context spec.)
4. What tasks do you do because nobody else knows how — where the knowledge is
   only in your head? (These become playbooks/SOPs whether or not we automate.)
5. What do you re-type, re-explain, or re-look-up more than once a week?

### Session 3 — The Wish List (45 min, day 10)
1. The audit will find you 10–15 hours/week. Spend them out loud: what do you
   do with them, specifically? (This ranks the *value* of recovered time.)
2. What sales motions are you not running because there's no time? (More
   at-bats? GPO outreach? Gov bids? Restore expansion?)
3. What would a *great* chief of staff take off your plate in month one?
4. What must you personally touch forever, no matter how good the tools get?
5. Anything the recorder captured this week that made you think "why am I
   still doing this"?

---

## 6. Analysis → the leverage matrix (the one-afternoon session)

Plot every recurring task: **x = hours/month, y = delegability**, dot size =
pain score. Read the map:

```
 judgment │  QUOTE margins      SELL prep        ◀ agent does the PREP,
          │  vendor picks       gov bid/no-bid     Damon does the 5-min call
          │
    hands │  AR chasing         email triage     ◀ automate outright
          │  PO status checks   quote follow-ups   (highest ROI corner)
          │  data re-entry      doc requests
          └──────────────────────────────────────▶
              occasional              constant     hours/month
```

Output artifacts (from `report.py` + the session):
1. **Time ledger** — where the hours actually went (vs. where he thinks).
2. **Ranked opportunity list** — each with disposition (eliminate / automate /
   buy / delegate / keep) and est. hours recovered per week.
3. **Buy-vs-build calls** — e.g. scheduling → Calendly (have it), call notes →
   Plaud itself stays, vendor sheets/quote follow-ups/AR → build on platform
   (the rails exist; see PRD-30/32 + fulfillment/finance modules).
4. **SOP debt list** — knowledge only in Damon's head → written playbooks.

Success bar: **10+ hours/week identified, ≥5 recovered in the first month.**

---

## 7. The Damon Agent (the endgame)

Not one monolith — a **chief-of-staff layer** of standing agents on the
platform rails we already run, each review-gated, each killing one category
from the audit. Build order follows the audit ranking, but the near-certain
top five (they match the platform's existing plumbing):

| Agent | Eats (taxonomy) | Rails that already exist |
|---|---|---|
| **Morning Brief+** | ADMIN/triage | `/admin/digest` is live — extend with audit-informed sections: today's calls w/ prep notes, task-debt list, waiting-on list |
| **Quote Chaser** | QUOTE follow-ups | quotes have status + expiry; agent drafts day-3/day-10 follow-ups into the outbox for one-click send |
| **AR Collector** | MONEY | `/admin/finance` dunning is built; agent runs nightly aging → drafts reminders → escalates 60+ to the brief |
| **Vendor Desk** | SOURCE | PRD-32 ingestion + RFQ engine; agent triages vendor email, parses sheets, drafts replies + POs |
| **Inbox Chief-of-Staff** | ADMIN/FIREFIGHT | Gmail OAuth (coded); agent triages to categories, drafts routine replies, surfaces only judgment items |

Each agent ships with: a review queue (nothing external sends unapproved for
the first 60 days), an audit-log trail, and a weekly "hours absorbed" counter
so we can prove the recovery against the baseline ledger.

**The compounding trick:** the Plaud doesn't retire after the audit. Damon's
one-sentence post-call summaries keep flowing to the classifier forever —
task debt auto-lands in the Morning Brief+, and every quarter we re-run the
ledger to find the next automation target. The audit becomes a permanent
instrument, not a one-off study.

---

## 8. Shopping list & setup checklist

- [ ] Plaud Note or NotePin (~$159; Pro plan for transcription volume ~$99/yr)
- [ ] Shared folder `~/damon-audit/` (transcripts + exports)
- [ ] Gmail read-only OAuth for exhaust pull (platform flow exists)
- [ ] Calendar export (one click)
- [ ] `scripts/damon_audit/` pipeline (Alex builds — ~1 day)
- [ ] Book the 3 interviews (day 1 / day 5 / day 10)
- [ ] Consent brief for the team + external-call rule agreed with Damon
- [ ] Baseline week chosen (a NORMAL week — not launch week)

---

## 9. What we will NOT do

- Record external parties without consent (voice-note summaries instead).
- Ship any agent that sends customer-facing anything unreviewed in its first
  60 days.
- Treat "Damon is busy" as the finding. The finding is the ranked list with
  hours attached — measured, not vibes.
- Let the audit become surveillance. It runs on Damon's terms, he deletes
  freely, and the deliverable belongs to him.
