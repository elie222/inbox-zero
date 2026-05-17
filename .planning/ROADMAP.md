# Roadmap: Personal Email AI

## Shipped Milestones

- **v1.0** *(2026-04-27 → 2026-05-17, 21 days)* — Three-tier classification pipeline + 9am ET daily digest with Sonnet narrative + production deploy on EC2. 7 of 7 phases complete (4 built, 3 closed by recognizing the spec was already satisfied by upstream features or manual triage). See [`milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md) and [`milestones/v1.0-REQUIREMENTS.md`](milestones/v1.0-REQUIREMENTS.md) for full detail.

## Current Milestone: v1.1 — Calendar-Aware Email

**Goal:** Make the AI email pipeline calendar-aware so upcoming events inform classification, schedulable emails become calendar events automatically, and the daily digest leads with today's agenda.

**Phase numbering continues from v1.0:** v1.1 starts at Phase 8.

### Phase 8: Calendar Context for Classification

**Goal:** Pipe a per-account window of upcoming Google Calendar events into the Haiku/Sonnet classification prompt so the AI knows what's on the user's calendar and uses that to bias urgency.

**Requirements:** CTX-01, CTX-02, CTX-03, CTX-04, OPS-02

**Success criteria:**
1. Classifier receives next-7-days calendar events as structured context on every classification call
2. Events declined or marked tentative are excluded from the context
3. Per-account calendar cache (Redis or in-memory with TTL) keeps Calendar API calls ≤ a few per hour, not per email
4. Emails about events within 24h bias toward Urgent; 1–7d toward Uncertain (visible in `ExecutedRule.reason`)
5. Token cost of new context measured and total AI spend stays ≤ $10/mo

### Phase 9: Auto-Create Events from ICS Invites

**Goal:** When an incoming email carries an `.ics` invite or is recognized by `analyzeCalendarEvent`, write the event to Google Calendar with source-email back-reference and a clear `[AI]` tag.

**Requirements:** EVT-01, EVT-03, EVT-04, EVT-05, EVT-06, OPS-01

**Depends on:** Phase 8 (shares calendar client / OAuth)

**Success criteria:**
1. ICS-bearing emails create matching events on the primary calendar
2. Events include source Gmail thread URL + message ID in description
3. Events visibly tagged (`[AI]` summary prefix or distinct color) so the user can spot/delete AI-created entries
4. Same email reprocessed (replays, history sync) does not duplicate events
5. Calendar API failures log + do not block classification or digest delivery

### Phase 10: AI Appointment Extraction → Auto-Create

**Goal:** For emails without an attached invite (e.g., "Can we meet Tuesday 2pm at the office?"), use the LLM to extract title/start/end/location/attendees and auto-create the event on the primary calendar with the same tagging and dedupe behavior.

**Requirements:** EVT-02

**Depends on:** Phase 9 (reuses event-create + dedupe + tagging code path)

**Success criteria:**
1. Plain-text appointment detection runs only on emails not already handled by Phase 9 (no double-creation)
2. Extracted events include title, start/end time (resolved to user TZ), location when present, and any attendees mentioned
3. Created events carry the same `[AI]` tag + source-email back-reference as Phase 9
4. Extraction confidence is logged so accuracy can be audited from `ExecutedRule` records

### Phase 11: Digest Calendar Enrichment

**Goal:** Lead the 9am ET digest with a calendar agenda section — today + tomorrow morning — so the user opens the digest already oriented to the day.

**Requirements:** DIG-01, DIG-02, DIG-03, DIG-04, DIG-05

**Depends on:** Phase 8 (calendar client / caching) and Phase 9 or 10 (for DIG-05 "events auto-created in last 24h" content)

**Success criteria:**
1. Digest opens with a Today section listing events from 9am ET through end-of-day ET
2. Digest includes a Tomorrow section showing events 6am–noon next day
3. Each item renders time/title/location/conflict indicator
4. Empty days render a friendly fallback rather than a blank section
5. Auto-created events from the last 24h are flagged with their source-email link

---

## Coverage Check

| Category | Reqs | Phase |
|----------|------|-------|
| CTX | CTX-01..04 | 8 |
| EVT | EVT-01, 03, 04, 05, 06 | 9 |
| EVT | EVT-02 | 10 |
| DIG | DIG-01..05 | 11 |
| OPS | OPS-01 | 9 |
| OPS | OPS-02 | 8 |

All 15 v1.1 requirements mapped to a phase.

---

## Backlog (carries forward across milestones)

### Carried-Forward Deferred Items (from v1.0)

- **CLASS-09** — Gmail `CATEGORY_PROMOTIONS` clean-route to Marketing (added 2026-05-08, scope trimmed; pending)
- **FEEDBACK-06** — Inject accumulated feedback into classification prompt. Deferred unless accuracy degrades.
- **LEARN-01..03** — Pattern graduation to native Gmail filters; periodic prompt regeneration from feedback history
- **DEAL-01, DEAL-02** — Per-sender deal thresholds (e.g., Harbor Freight ≥20%, Home Depot power tools only)
- **MON-01, MON-02** — Classification stats dashboard + AI cost alerting

### Carried-Forward Deferred Items (from v1.1)

- Reply-time awareness using calendar availability in AI draft replies
- Meeting briefings emailed to the user (repurpose upstream meeting-briefs system)
- Multi-calendar support beyond primary calendar
- Microsoft / Outlook calendar parity

Promote any of these into a future milestone via `/gsd-new-milestone` or `/gsd-review-backlog`.
