# Requirements — Milestone v1.1: Calendar-Aware Email

**Goal:** Make the AI email pipeline calendar-aware so upcoming events inform classification, schedulable emails become calendar events automatically, and the daily digest leads with today's agenda.

**Constraints carried from v1.0:**
- AI cost ≤$10/mo additional total
- Single tenant (rebekah@trueocean.com)
- Minimally invasive to upstream fork
- Calendar context must ride the Haiku tier wherever possible (Sonnet only for digest narrative + true escalations, same policy as v1.0)

---

## v1.1 Requirements

### CTX — Calendar Context for Classification

- [ ] **CTX-01** — The classification pipeline has access to upcoming Google Calendar events (next 7 days) as context when evaluating each incoming email
- [ ] **CTX-02** — Emails referring to events on the user's calendar (by sender match, subject keyword match, or AI extraction) are biased toward `Urgent` when the event is within 24h, or `Uncertain` when within 7d
- [ ] **CTX-03** — Calendar events the user has declined or marked tentative do not bias classification toward urgency
- [ ] **CTX-04** — Calendar context is fetched at most once per N minutes and cached per email-account so per-email classification does not hit Calendar API for every message

### EVT — Auto-Create Calendar Events from Emails

- [ ] **EVT-01** — `.ics` invites attached to incoming emails auto-create events on the user's primary Google Calendar (uses existing `analyzeCalendarEvent` parser)
- [ ] **EVT-02** — AI-detected appointments in plain-text email bodies (e.g. "Let's meet Tuesday 2pm at the office") auto-create events on the primary calendar with extracted title, start/end time, location, and attendees
- [ ] **EVT-03** — Auto-created events include a back-reference to the source email (Gmail thread URL + message ID) in the event description
- [ ] **EVT-04** — Auto-created events are tagged on the calendar (event color or summary prefix like `[AI]`) so the user can identify and delete AI-created entries
- [ ] **EVT-05** — Re-processing the same email (replays, history syncs) does not create duplicate events — dedupe by message ID + extracted event signature
- [ ] **EVT-06** — Event creation failures (API errors, quota, conflicts) do not block email classification or digest delivery — failure is logged and the email still gets classified

### DIG — Digest Enrichment with Calendar

- [ ] **DIG-01** — The 9am ET daily digest opens with a "Today" section showing all events from 9am ET through midnight ET that day
- [ ] **DIG-02** — The digest also includes a "Tomorrow" section showing events from 6am–noon next day (so morning meetings aren't a surprise)
- [ ] **DIG-03** — Each agenda item shows start time (ET), end time, title, location (if any), and a conflict indicator when two events overlap
- [ ] **DIG-04** — When the day is empty, the digest renders a friendly fallback ("Nothing on the calendar today") rather than an empty section
- [ ] **DIG-05** — Events that were auto-created by the AI in the last 24h are flagged in the digest with the source email link so the user can audit

### OPS — Operational Resilience

- [ ] **OPS-01** — Calendar API failures (rate limit, expired token, network) degrade gracefully — classification runs without calendar context, digest ships without agenda section, errors are logged with enough detail to debug
- [ ] **OPS-02** — Token cost of the new calendar context in the classification prompt is measured and stays within the existing AI budget (≤$10/mo additional total); if measurement shows otherwise, calendar context is gated or trimmed before milestone close

---

## Future Requirements (Deferred)

- Reply-time awareness using calendar availability (e.g., "propose Tuesday 2pm" in AI draft replies) — out of v1.1 scope
- Meeting briefings emailed to the user (repurpose upstream meeting-briefs system) — out of v1.1 scope
- Multi-calendar support beyond primary calendar — single-calendar only for v1.1
- Microsoft / Outlook calendar — Google only

## Out of Scope

- Calendar OAuth flow (already connected for rebekah@trueocean.com)
- Calendar event editing/cancellation from email — only create, never modify
- Sending invites on behalf of the user — read + create only, no outbound invites
- Sharing or multi-tenant calendar features

## Traceability

| REQ-ID | Phase |
|--------|-------|
| CTX-01 | 8 |
| CTX-02 | 8 |
| CTX-03 | 8 |
| CTX-04 | 8 |
| EVT-01 | 9 |
| EVT-02 | 10 |
| EVT-03 | 9 |
| EVT-04 | 9 |
| EVT-05 | 9 |
| EVT-06 | 9 |
| DIG-01 | 11 |
| DIG-02 | 11 |
| DIG-03 | 11 |
| DIG-04 | 11 |
| DIG-05 | 11 |
| OPS-01 | 9 |
| OPS-02 | 8 |
