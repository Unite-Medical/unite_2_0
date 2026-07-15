# The Damon Weekend Audit — Founder Time Capture in 2–3 Days

> **Constraint:** Damon is here in person for a weekend (2–3 days), not two
> weeks. So we flip the design: instead of passively recording his life for 10
> days and analyzing later, we run an **intensive extraction weekend** — deep
> structured interviews + live artifact review + same-day analysis — and the
> Plaud goes home WITH him as the ongoing instrument. We leave the weekend
> with the leverage map built and the first agent turned on.
>
> Owner: Alex · Subject: Damon · When: his visit · Created 2026-07-03.

---

## 0. The weekend at a glance

```
        DAY 1 (≈4h of audit time)          DAY 2 (≈4h)                DAY 3 / dep.
 ┌──────────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────┐
 │ S1 Day Reconstruction  90min │   │ S3 Artifact Autopsy 90min│   │ Review the map   │
 │    (3 real days, hour by     │   │    (his ACTUAL inbox,    │   │ 60min: agree the │
 │     hour, from his calendar/ │   │     sent mail, call log, │   │ top-5 automations│
 │     phone — not memory)      │   │     camera roll, notes)  │   │ + kill list      │
 │                              │   │                          │   │                  │
 │ S2 Pain Census        60min  │   │ S4 Wish List +           │   │ Turn ON agent #1 │
 │    (task inventory, scored   │   │    Delegation Test 60min │   │ (Morning Brief+) │
 │     live in the sheet)       │   │                          │   │ before he leaves │
 └──────────────────────────────┘   └──────────────────────────┘   │                  │
   Alex runs classifier overnight      Alex builds leverage map    │ Plaud goes home  │
   on Day-1 transcripts                overnight                   │ with him (§6)    │
                                                                   └──────────────────┘
 Everything is recorded on the Plaud from minute one — the interviews themselves
 are the first transcripts through the pipeline.
```

Total ask of Damon: **~9 hours across the weekend**, interleaved with the site
walkthrough sessions (the Test Book work). Audit sessions fit in mornings;
walkthrough in afternoons, or vice versa.

---

## 1. Before he arrives (Alex prep — 2 hours)

- [ ] **Plaud Note arrives before the weekend** (order NOW: ~$159 + Pro plan).
      If it can't arrive in time: iPhone Voice Memos + Whisper transcription is
      a fine fallback for the weekend itself; Plaud still goes home with him.
- [ ] Print/pre-load the **Pain Census sheet** (template §3.2).
- [ ] Ask Damon to bring (or have access to): his **calendar** (last 2 weeks),
      **phone call log**, **sent mail**, **camera roll** (warehouse people
      photograph problems — his camera roll is an ops diary), any notebooks.
- [ ] Stand up `scripts/damon_audit/` skeleton: `ingest.py` (transcripts → 
      events.jsonl) + `classify.py` (Claude tagger, same strict-schema pattern
      as `src/lib/ai/`). One evening of work; must be ready Day 1 night.
- [ ] Book the four sessions on the shared calendar so the weekend has a spine.

---

## 2. Day 1 — extract the reality

### Session 1 — Day Reconstruction (90 min, recorded)
Not "describe your typical day" (people narrate their ideal selves). Instead:
**reconstruct three REAL days** using evidence — his calendar, call log, and
sent mail open on the table.

Script:
1. Open his calendar to **last Tuesday**. "Walk me through it. What's not on
   the calendar that happened anyway?" (The gaps ARE the finding — untracked
   work is usually the automatable kind.)
2. For every block: *what triggered it? what did it produce? who was waiting
   on it? could it have happened without you?*
3. Open the **call log for the same day**: every call — who, what, minutes,
   and **what follow-up did it create** (the task-debt question).
4. Open **sent mail for the same day**: for each email — *"could anyone else
   have sent this? what did you need to know to write it? where did that
   knowledge live?"*
5. Repeat compressed for **last Friday** and **the worst day in the last two
   weeks** ("which day made you angriest? walk me through it").
6. Close: "What did you NOT do those days that a CEO should have been doing?"

### Session 2 — Pain Census (60 min, live spreadsheet)
Build the recurring-task inventory together, one row per task. Columns:
**Task · Freq/wk · Minutes · Pain 1–5 · Skill (hands/judgment/relationship) ·
Trigger · Information needed at the moment of doing it**.

Prompt through every category so nothing hides:
vendors/sourcing → quoting/pricing → orders/warehouse → money (AR/AP/QBO) →
compliance/docs → email/scheduling → people (reps, warehouse lead, partners)
→ firefighting ("who interrupts you most, about what?").

The two magic questions per row:
- *"If a smart assistant did this and you approved the result in 2 minutes,
  does that work — or does it fail in ways only you can see?"* → hands vs judgment.
- *"What do you need in front of you at the moment you do this?"* → literal
  context spec for the future agent.

**Day 1 night (Alex):** run the two session transcripts through
`classify.py`; produce the first-cut time ledger + the task inventory typed up.

---

## 3. Day 2 — verify with artifacts, then aim

### Session 3 — Artifact Autopsy (90 min, recorded)
Self-report lies; artifacts don't. With his laptop on the table:
1. **Inbox triage live**: take his ACTUAL current inbox, top 20 threads. For
   each: keep-for-Damon / draftable-by-agent / delegate / delete. Count the
   split — that ratio is the Inbox agent's business case.
2. **Sent-mail archaeology**: filter sent items for the last full week. Bucket
   by category, count. (This is the ground truth against yesterday's self-report
   — expect a gap; the gap is the insight.)
3. **Camera roll + notes app**: warehouse photos, screenshots, scribbles —
   each one is a workflow with no system behind it. List them.
4. **The re-typing hunt**: "show me the last thing you copied from one system
   into another." (Vendor sheet → email? QBO → spreadsheet? These are pure
   automation targets.)

### Session 4 — Wish List + Delegation Test (60 min, recorded)
1. "The audit will find you 10–15 hrs/week. Spend them, specifically." (Ranks
   the VALUE of recovered time — more sales calls? gov bids? Restore expansion?)
2. **The delegation test**: for the top-10 painful tasks from the census,
   run each through: *"If I hired you a sharp EA tomorrow, could they do it
   with a one-page playbook? If yes → why haven't we written the playbook?
   If no → what exactly do they lack: knowledge, authority, or relationship?"*
3. "What must remain yours forever, no matter how good the tools get?"
4. Consent + habits talk for the take-home Plaud protocol (§6).

**Day 2 night (Alex):** merge everything → build the **leverage matrix** +
ranked opportunity list (template §5). Draft the top-5 automation cards.

---

## 4. Day 3 (or departure morning) — decide and ship

### Session 5 — The Map Review (60 min)
Walk the leverage matrix together. For each of the top opportunities, force
one of five dispositions — no "later" bucket:

| Disposition | Meaning | Exit artifact |
|---|---|---|
| **ELIMINATE** | Stop doing it. Nobody misses it | dead-list entry |
| **AUTOMATE** | Build on our rails (agents/platform) | automation card w/ owner+date |
| **BUY** | Off-the-shelf covers it | tool + budget line |
| **DELEGATE** | Human + playbook | playbook owner + draft date |
| **KEEP** | Genuinely founder work | protected-time note |

### Ship agent #1 before he leaves
**Morning Brief+** is the guaranteed first win — `/admin/digest` already
exists and is AI-live. Extend it same-day with the audit's findings:
- his **waiting-on list** (task debt captured during the weekend),
- today's calls with one-line prep notes,
- AR items over threshold, quotes expiring within 3 days.
Damon opens it Monday morning at home: the weekend visibly already paid.

---

## 5. The leverage matrix (what the weekend produces)

```
 judgment │  QUOTE margin calls     SELL prep / gov bids   ◀ agent preps, Damon
          │  vendor selection       partner negotiations     decides in minutes
          │
    hands │  AR chasing             email triage           ◀ automate outright —
          │  quote follow-ups       PO status checks         the money corner
          │  data re-entry          doc requests
          └──────────────────────────────────────────────▶
             occasional                     constant          hours/month
   dot size = pain score · red dots = creates task-debt for others when delayed
```

Deliverables leaving the weekend:
1. **Time ledger v1** — evidence-based (artifacts + reconstruction), not vibes.
2. **Ranked opportunity list** with hours/week attached and dispositions.
3. **Top-5 automation cards** (each: trigger, context needed, draft output,
   review gate, hours saved) → these become the agent build queue.
4. **SOP debt list** — knowledge only in Damon's head → playbooks to write.
5. **Morning Brief+ live** — first agent shipped.
6. **The take-home protocol** running (§6).

Success bar for the weekend itself: **≥10 hrs/week of opportunity identified,
agent #1 live, and Damon bought-in enough to run the take-home protocol.**

---

## 6. The take-home protocol (the Plaud leaves with him)

The weekend builds the map; the ongoing feed keeps it honest. Damon takes the
Plaud home with **one habit only** (habits fail in bundles):

> After every call or meeting, one sentence to the recorder:
> **"That was [who], about [what], I now need to [follow-up]."**

- Transcripts auto-sync; `ingest.py` pulls them nightly; the classifier files
  the task debt straight into his Morning Brief+ ("yesterday you promised…").
- No always-on recording of external parties (GA is one-party but
  counterparties travel — voice-note summaries sidestep consent entirely).
- Delete anything, any time, no questions.
- Re-run the ledger monthly (10 minutes, automated) → each month surfaces the
  next automation target. The audit becomes an instrument, not an event.

---

## 7. The agent build queue (post-weekend, in expected order)

| # | Agent | Kills (from taxonomy) | Rails that already exist |
|---|---|---|---|
| 1 | **Morning Brief+** (ships during the weekend) | ADMIN triage, task-debt tracking | `/admin/digest` live today |
| 2 | **Quote Chaser** | QUOTE follow-ups (day-3/day-10 nudges, expiry saves) | quote statuses + outbox |
| 3 | **AR Collector** | MONEY chasing | `/admin/finance` dunning built; needs Resend key |
| 4 | **Inbox Chief-of-Staff** | ADMIN email, FIREFIGHT filtering | Gmail OAuth flow coded |
| 5 | **Vendor Desk** | SOURCE (sheet parsing, RFQ, PO chasing) | PRD-32 pipeline |

Rules for all: review-gated for 60 days (drafts, never auto-sends external),
audit-log trail, weekly "hours absorbed" counter measured against the weekend's
baseline ledger — we PROVE the recovery, not assert it.

---

## 8. Shopping list

- [ ] Plaud Note (~$159) + Pro plan (~$99/yr) — **order today** so it arrives
      before the visit (fallback: iPhone Voice Memos + Whisper)
- [ ] Shared folder `~/damon-audit/`
- [ ] Pain Census spreadsheet template
- [ ] `scripts/damon_audit/` ingest+classify skeleton (Alex, one evening)
- [ ] 5 calendar holds on the visit weekend (S1–S5)
- [ ] Gmail read-only OAuth consent from Damon (5 min, during S3)

## 9. What we will NOT do
- Record external counterparties without consent (summaries instead).
- Let any agent auto-send externally in its first 60 days.
- Accept "Damon is busy" as a finding — the finding is hours, ranked, with
  dispositions and owners.
- Turn the audit into surveillance: his device, his delete button, his data.
