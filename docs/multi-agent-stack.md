# The Unite Medical multi-agent stack

> **Internal strategy doc · v0.1 · 2026-Q2**
> Author: Engineering · Owner: Damon Reed
> Status: planning

## TL;DR

Damon wants to run a $30M-GMV medical-supply distributor with as few employees as possible. Today the typical headcount for a business this size is ~13 FTE; with the agent stack below it's ~4. The architecture is 7 specialist agents + 1 orchestrator, sitting on top of a typed tool layer that wraps every external API the business already uses (Cin7, ShipStation, QBO, HubSpot, Flexport, openFDA, USITC, etc.). The admin dashboard becomes a cockpit for exceptions, not a workspace for execution.

**Cost**: ~$150K/yr in API + infra
**Replaces**: ~$1.1M/yr in headcount
**Target rollout**: ~6 months, agent-by-agent

---

## The thesis

Today every workflow in this business is **80% deterministic glue + 20% judgment**.

- *Glue* = move data from System A to System B, draft an email, run a calculation, file a piece of paperwork.
- *Judgment* = does this lead matter? Does this exception need a human?

SaaS already automates *within* a workflow. What it doesn't solve is **the seams between workflows** — and the seams are where ~90% of headcount lives. We're not replacing ShipStation with an agent; we're replacing *the person who logs into ShipStation, then QuickBooks, then Gmail, then HubSpot* with an agent that calls all four through tools.

The orchestrator on top of the agent fleet means Damon doesn't manage seven agents — he manages one agent that manages seven agents. End state: he opens his laptop, sees five decisions that need a human, makes them, and the company runs itself for another day.

---

## The 7 specialist agents

Each agent is an LLM with a focused system prompt, a curated tool set, a confidence threshold, and a queue. Below the threshold, the agent drafts and a human approves; above it, the agent executes autonomously.

### 1. Quoting Agent

| | |
|---|---|
| **Owns** | Vendor sheet → customer PDF in 14 seconds |
| **Replaces** | Sales analyst (1.0 FTE) |
| **APIs / tools** | openFDA · USITC HTS · Flexport · Anthropic · Gmail · DocuSign |
| **Trigger** | New email attachment from a vetted vendor (Gmail filter), or manual upload via `/quote` |
| **Output** | Customer-ready PDF + AI cover letter, stored in `quotes` table, ready to send |
| **Status** | Already 80% built — see `src/lib/quoting.js` |

### 2. Procurement Agent

| | |
|---|---|
| **Owns** | Watches inventory, drafts POs at reorder threshold, vets new vendors, monitors lead times |
| **Replaces** | Buyer (1.0 FTE) |
| **APIs / tools** | Cin7/NetSuite · Flexport · Shanghai supplier email/WhatsApp · openFDA registration · GS1/GUDID · SAM.gov |
| **Trigger** | Inventory crosses reorder threshold, or weekly forward-demand forecast |
| **Output** | Draft PO with vendor, qty, FOB, ETA — drops into `/admin/inbox` for one-click approval |
| **Confidence threshold** | 95% (medical inventory mistakes are expensive) |

### 3. Logistics Agent

| | |
|---|---|
| **Owns** | Order placed → label printed → carrier picked → customer ETA email → tracking watched → exception escalated |
| **Replaces** | Ops coordinator (1.5 FTE) |
| **APIs / tools** | ShipStation · FedEx/UPS APIs · Cin7 · Gmail · Twilio (SMS to driver) · 17track / aftership |
| **Trigger** | New `orders` row with `status='pending'` |
| **Output** | Picked DC, generated label, carrier handoff, customer notification, tracking watcher |
| **Escalates** | Stuck-in-transit > 48h, address validation failure, claim event |

### 4. Compliance Agent

| | |
|---|---|
| **Owns** | New product/vendor → FDA + 510(k) check, country-of-origin docs, PDAC tracking, MSPV listing audits |
| **Replaces** | Compliance specialist (1.0 FTE) |
| **APIs / tools** | openFDA · CBP ACE · GUDID · NPPES · SAM.gov · DocuSign · Anthropic |
| **Trigger** | New `products` or `vendors` row, monthly audit cycle, federal RFP intake |
| **Output** | Compliance certificate stored in `vendors` / `products` table, MSPV submission package |
| **Escalates** | Anything that touches a recall, an FDA warning letter, or a Berry-compliance attestation |

### 5. AR / Collections Agent

| | |
|---|---|
| **Owns** | Invoices flow → 28-day polite nudge → 35-day firm nudge → 45-day human escalation → autopay reconciliation |
| **Replaces** | A/R clerk (0.5 FTE) |
| **APIs / tools** | QuickBooks Online · Stripe · Gmail · Plaid · DocuSign |
| **Trigger** | Daily QBO sync — invoices crossing aging buckets |
| **Output** | Drafted email, optional Stripe autopay link, escalation ticket if no response |
| **Confidence threshold** | 99% — never sends a "where's my money?" to a paid customer |

### 6. Sales SDR Agent

| | |
|---|---|
| **Owns** | Inbound lead → enrich → score → personalized first email → book Calendly meeting → hand to human |
| **Replaces** | SDR (1.0 FTE) |
| **APIs / tools** | HubSpot · Apollo / Clearbit · Gmail · Calendly · LinkedIn (via Phantombuster) · Anthropic |
| **Trigger** | New `leads` row from form submission, MSPV match, partner referral |
| **Output** | Enriched contact, segment-fit score, drafted personalized email, booked meeting |
| **Confidence threshold** | 80% (low-stakes — a missed lead is recoverable) |

### 7. Support Agent

| | |
|---|---|
| **Owns** | Replies to "where's my order", "do you have X SKU", "send me the W9", "what's my net-30 balance"; escalates anything else |
| **Replaces** | Tier-1 support (1.5 FTE) |
| **APIs / tools** | Gmail · Cin7 · QBO · ShipStation · the in-house DB · Anthropic · vector DB of past tickets |
| **Trigger** | Inbound email to `support@unitemedical.net` |
| **Output** | Drafted reply, sent autonomously above threshold, queued for human review below |
| **Confidence threshold** | 92%, but with a hard rule: anything mentioning a recall / injury / regulator → instant human escalation |

---

## The orchestrator (agent #8)

| | |
|---|---|
| **Name** | **Operations Copilot** ("Damon Agent") |
| **Owns** | Pulls from every other agent's exception queue. Summarizes overnight activity. Surfaces the *top 5 decisions only Damon should make today*. Drafts one-line answers. Executes whichever Damon approves. |
| **Why it matters** | Without it, the agent fleet just generates a different kind of inbox hell. With it, Damon's morning is a 10-minute coffee + 5 decisions + 6 hours of strategy. |

This is the agent Damon actually talks to. The other 7 are workers; this one is the chief of staff.

---

## Architecture in 4 layers

```
+----------------------------------------------------------------------+
|  LAYER 4 — Orchestrator + UI                                         |
|                                                                      |
|  Operations Copilot --> /admin/inbox · /admin/agents · /admin/audit  |
+----------------------------------------------------------------------+
                                  |
                                  v
+----------------------------------------------------------------------+
|  LAYER 3 — Agents (durable workflows on Temporal / Inngest)          |
|                                                                      |
|  Quoting · Procurement · Logistics · Compliance ·                    |
|  Collections · Sales SDR · Support                                   |
+----------------------------------------------------------------------+
                                  |
                                  v
+----------------------------------------------------------------------+
|  LAYER 2 — Tool layer (typed wrappers, retry, audit)                 |
|                                                                      |
|  openFDA · USITC HTS · Flexport · ShipStation · Cin7 · QBO ·         |
|  HubSpot · Stripe · Gmail · Anthropic / OpenAI / Gemini ·            |
|  DocuSign · Slack · Twilio · CBP ACE · GUDID · NPPES · SAM.gov       |
+----------------------------------------------------------------------+
                                  |
                                  v
+----------------------------------------------------------------------+
|  LAYER 1 — Data substrate                                            |
|                                                                      |
|  Postgres (products / orders / customers / inventory)                |
|  Vector store (vendor docs / past tickets / call notes)              |
+----------------------------------------------------------------------+
```

### Layer 1 — Data substrate

- **Postgres** for the system of record (products, orders, customers, inventory). Today this is `src/lib/db.js` against `localStorage`; production swaps to Supabase or RDS without code changes (the schema is intentional).
- **Vector store** for unstructured memory: Turbopuffer, Pinecone, or Postgres `pgvector`. Stores every customer email, every vendor objection, every quote that won and lost. Agents query it before drafting.

### Layer 2 — Tool layer

- Each external API has a typed wrapper in `src/lib/services.js` (already started for `openfda`, `hts`, `flexport`, `claude`).
- Every tool returns a `{ ok, data, error }` envelope so agents can reason about failure.
- Every tool call is logged to an immutable `audit_log` table — required for SOC 2 and FDA traceability.
- Health checks on `/admin/tools` so Damon can see at-a-glance which integrations are red.

### Layer 3 — Agents

- **Durable execution engine** = [Temporal](https://temporal.io/) or [Inngest](https://www.inngest.com/). Agents don't run inside HTTP requests — they run as long-lived workflows that survive restarts and retry on API failure.
- **LLM substrate** = pick per-task:
  - **Anthropic** (Claude) for drafting (best at the medical-compliance tone)
  - **OpenAI** (GPT-5 family) for tool use (function calling is most reliable)
  - **Gemini** for cheap classification at volume
- **Confidence thresholds** are per-agent and per-task-type. Below threshold → drop into `/admin/inbox`. Above → execute and log.

### Layer 4 — Orchestrator + UI

- **Operations Copilot** runs on a 5-minute cron, surveys all agent queues, drafts the morning briefing.
- **Admin pages** become the cockpit — see the next section.

---

## Where this lives in the admin dashboard

Building on the admin we already have at `/admin/*`:

| Path | Purpose |
|---|---|
| **`/admin/inbox`** | The single human-in-the-loop queue. Every agent's "I need a human" decision lands here. One row = one decision. Click to approve / reject / edit-and-execute. **This is Damon's home page.** |
| **`/admin/agents`** | Fleet status. Each agent: running / idle / error · tasks today · escalations today · $ value handled · % autonomous (target: 90%+). Per-agent kill switch. |
| **`/admin/agents/:id`** | Per-agent control panel: system prompt editor · tool whitelist · confidence thresholds · cost ceiling · transcript playback (every conversation it had today, every tool call, what it cost). |
| **`/admin/audit`** | Append-only log of every action every agent took. Searchable. Required for SOC 2 and FDA traceability. Every action has a `replay()` button so you can re-run a workflow with edited inputs. |
| **`/admin/runbooks`** | Human-readable workflow templates that agents follow. Editable in markdown. "When inventory hits reorder threshold for a Cin7-managed SKU…" → step-by-step. Editing the runbook updates the agent's behavior. |
| **`/admin/tools`** | Inventory of every external API wrapper, with health checks and a "test connection" button. Becomes the inventory of agent capabilities. |

---

## Phasing roadmap

Don't deploy 8 agents on day one. The risk of a bad agent quietly emailing 200 vendors at 3 AM is too high. Phase it.

### Week 1–4 — Foundation (no agents yet)

- Build the **tool layer** properly. Every external API gets a typed wrapper with retry, dead-letter queue, and audit logging.
- Build `/admin/audit` and `/admin/inbox`. The inbox is the most important page in the whole product — agents are useless without it.
- Stand up Temporal / Inngest. Wire one heartbeat agent that does nothing but prove the durable-workflow story works.

### Month 2 — Agent #1: Quoting

- Already 80% there (`src/lib/quoting.js`). Turn it into a durable workflow.
- Add: parse vendor email attachments automatically (Gmail tool), draft cover letter (Anthropic), send via Gmail with one-click human approval.
- **Success metric**: 50% of quotes go out without a human typing.

### Month 3 — Agent #2: Procurement

- Highest ROI per FTE replaced.
- Watch Cin7, draft POs, send to vendors via Gmail / WhatsApp, file with Flexport, hand off to a human at sign-off only.
- **Success metric**: 90% of reorder POs draft themselves; human just clicks "send."

### Month 4–5 — Agents #3 + #4: Logistics + Compliance

- Logistics is glue work — moving data between ShipStation / Cin7 / Gmail. Easy to automate, high time savings.
- Compliance is paperwork — perfect agent fodder. Every new product gets its FDA registration check, country-of-origin docs, PDAC tracking automatically.

### Month 6 — Agent #5: AR / Collections

- Plug into QBO. Polite-firm-escalate ladder.
- Saves a lot of awkward phone calls + speeds up cash flow.

### Quarter 3 — Agents #6 + #7: Sales SDR + Support

- These are the highest-stakes (customer-facing). Build last, behind the most aggressive human-in-the-loop guardrails.
- Pair every agent reply with a **"Damon reviews before send"** mode for the first 90 days, then graduate to "sample 10% for review."

### Quarter 4 — Agent #8: Operations Copilot

- The orchestrator only makes sense once 7 agents are producing exception queues. Build it last.

---

## Headcount math

| Role | Today | With stack | Replaced by |
|---|---|---|---|
| Founder / CEO | 1 | 1 | — (Damon stays) |
| Sales / SDR | 4 | 1 | Sales SDR Agent + Quoting Agent |
| Buyer / procurement | 1 | 0 | Procurement Agent |
| Ops coordinator | 1.5 | 0.5 | Logistics Agent |
| Warehouse picker | 2 | 2 | (still need humans here) |
| A/R clerk | 1 | 0 | Collections Agent |
| Compliance specialist | 1 | 0 | Compliance Agent |
| Support tier 1 | 1.5 | 0 | Support Agent |
| Marketing | 0.5 | 0 | Content Agent (Tier 2, future) |
| **Total** | **~13 FTE** | **~4 FTE** | **9 FTE replaced (~$1.1M / yr)** |

### Stack cost at this scale

| Line item | Monthly | Annual |
|---|---|---|
| LLM API spend (Anthropic + OpenAI + Gemini) | ~$8–15K | ~$140K |
| Tool API spend (HubSpot Sales, Apollo, Calendly, etc.) | ~$2–3K | ~$30K |
| Infra (Temporal, vector DB, Postgres, observability) | ~$1.5K | ~$18K |
| **Total** | **~$12–20K** | **~$190K** |

**Net**: ~$190K spend vs ~$1.1M saved → **~5–7× ROI**, before counting throughput gains (more quotes/day, faster fill rates, lower DSO).

---

## Why this is defensible (the moat)

A competitor can buy ShipStation. They can't buy:

1. **The runbook library** — the codified judgment of how Unite Medical handles every weird case (PDAC paperwork on a re-fitted brace, Berry-compliance attestation for a federal customer, lot-traceability for a recall). That library *is* the company's IP after 6 months.
2. **The vector store** — three years of every customer email, every vendor objection, every quote that won and lost. Agents read it before drafting. Day-2 outputs are dramatically better than day-1.
3. **The orchestrator's exception map** — knowing which 5 things in your business need a human eye on Tuesday morning is itself a learned skill the orchestrator builds over months.

The advantage compounds. This is why we do it now and not in 18 months when it's commodity.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Agent sends wrong email to wrong customer | Confidence threshold + human-in-the-loop until 90+ days of clean data; per-agent dry-run mode for the first month of every new agent |
| LLM hallucinates a price / SKU / HCPCS code | Every output passes a deterministic schema validator before being sent; "fact" fields (price, SKU, HCPCS) must come from a tool call, never from LLM free generation |
| API outage knocks an agent offline | Durable workflow engine retries with backoff; degrades to inbox if outage > 30 min |
| Cost runaway from a looping agent | Per-agent monthly cost ceiling; hard kill above ceiling |
| Audit / compliance review (FDA, SOC 2, MSPV) | Append-only audit log on every tool call; runbooks are versioned in git; every agent decision has a replayable trace |
| Agent makes a regulatory misstep (recall, FDA warning) | Hard rules: anything mentioning recall / injury / regulator skips agent and goes straight to human |
| Vendor lock-in on one LLM provider | Tool layer abstracts LLM; switch from Anthropic to OpenAI to Gemini at the call site, not in 50 places |

---

## Appendix A — APIs we'll integrate

| Domain | Service | Used by |
|---|---|---|
| Inventory & ops | Cin7 / NetSuite | Procurement, Logistics, Support |
| Shipping | ShipStation, FedEx, UPS, USPS | Logistics |
| Tracking | 17track / Aftership | Logistics |
| Freight (international) | Flexport | Quoting, Procurement |
| Customs | CBP ACE | Compliance |
| Compliance lookup | openFDA, GUDID, NPPES | Compliance, Procurement |
| Federal procurement | SAM.gov | Compliance, Sales SDR |
| Tariff & duty | USITC HTS | Quoting |
| Accounting | QuickBooks Online | Collections, Logistics |
| Payments | Stripe, Plaid | Collections |
| CRM | HubSpot | Sales SDR, Support |
| Sales enrichment | Apollo, Clearbit | Sales SDR |
| Calendar | Calendly, Google Calendar | Sales SDR |
| Email (send + parse) | Gmail / Microsoft Graph | All agents |
| SMS / voice | Twilio | Logistics, Support |
| Documents | DocuSign | Quoting, Compliance, Collections |
| Internal comms | Slack | Orchestrator (notify Damon) |
| LLM | Anthropic, OpenAI, Gemini | All agents |

## Appendix B — Tech stack (proposed)

| Layer | Choice | Why |
|---|---|---|
| App framework | Existing React + Vite (this repo) | Already deployed |
| Backend | Node.js (TypeScript) on Vercel functions or Cloudflare Workers | Same language as the React app, easy mental model |
| Durable workflows | **Temporal** or **Inngest** | Industry standard; survives restarts; replayable |
| DB | Postgres (Supabase or RDS) | Schema in `src/lib/db.js` already maps cleanly |
| Vector store | Turbopuffer, Pinecone, or `pgvector` | Pick `pgvector` first — same DB, lower ops |
| LLM clients | Anthropic SDK, OpenAI SDK, Google AI SDK | Multi-provider abstraction in tool layer |
| Agent framework | LangGraph (TS) or hand-rolled | Hand-rolled is fine at 7 agents; revisit at 20+ |
| Observability | Langfuse or Helicone | Cost + latency + trace per LLM call |
| Job runner | Inngest (if used as workflow engine, dual-purpose) | Cron + retry built-in |
| Auth | Clerk or Auth.js | Drop-in for the admin |

## Appendix C — Concrete next moves

The two highest-ROI commits, in order:

1. **Build the inbox + audit pages** (`/admin/inbox`, `/admin/audit`) so we have the surface area to receive agent output.
2. **Build a "tool registry" page** (`/admin/tools`) showing every external API the system can call, with health checks and a "test connection" button.
3. **Wire one mock agent end-to-end** — pick the **Procurement Agent** because it's pure read-and-draft, lowest risk. Have it scan the inventory table every 60 seconds and create draft POs in the inbox. Real agent loop, mock LLM call (Anthropic stub returns canned text).

After that, swap the mock LLM for a real Anthropic call and the system is alive.

---

*Maintained in `docs/multi-agent-stack.md`. Update when the architecture or agent roster changes.*
