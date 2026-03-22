# Chief of Staff Pipeline — Design Specification

**Author:** Nick Leeke + Claude
**Date:** 2026-03-21
**Status:** Approved — ready for implementation planning
**Foundation:** Fork of [elie222/inbox-zero](https://github.com/elie222/inbox-zero)

---

## 1. Overview

A Chief of Staff email processing pipeline built as an additive layer on top of Inbox Zero. It runs parallel to Inbox Zero's existing rule engine without modifying it. The pipeline monitors Gmail inboxes, categorizes emails using Claude AI with custom tools (Acuity Scheduling, Google Calendar with prefix conventions), and posts summaries with approve/edit/reject buttons to a dedicated Slack channel for mobile-first approval.

### What Inbox Zero Provides (Already Exists)

| Component | Status |
|-----------|--------|
| Gmail Pub/Sub webhook with retry logic | Production-ready |
| AI/Claude integration via AI SDK with tool calling | Production-ready |
| Gmail API (fetch, draft, send) | Production-ready |
| Slack integration (Web API, Block Kit, OAuth) | Production-ready |
| Google Calendar (multi-provider, availability) | Production-ready |
| Database (Prisma + Postgres) | Production-ready |
| MCP extensibility framework | Production-ready |
| OAuth flows and token management | Production-ready |

### What This Pipeline Adds

1. Pre-filter engine — blocks junk before Claude, handles shipping calendar events
2. Claude processing engine — Chief of Staff system prompt with custom tools
3. Acuity Scheduling REST API integration — availability, booking, VIP detection
4. Calendar prefix convention — `~` (soft), `FYI:` (ignore), no prefix (hard block)
5. Slack Block Kit approval flow — approve/edit/reject buttons with edit modals
6. Multi-inbox routing with per-venture voice/tone
7. Graduation system — configurable autonomy levels per email category
8. Client grouping — resilient VIP detection across name/email variations

### Hosting

Railway (or equivalent always-on VPS). Not Vercel — serverless timeout limits conflict with long AI tool-calling chains. Railway provides stable public URLs for Slack interactivity webhooks and Gmail Pub/Sub push subscriptions.

### Phasing

- **Phase 1:** leekenick@gmail.com + nick@smartcollege.com connected. Full Acuity/calendar/Slack pipeline.
- **Phase 2:** Add nick@growwithpraxis.com when Praxis ramps up.
- **Phase 3:** Asana task creation integration.

---

## 2. Architecture — Pipeline Integration

The Chief of Staff pipeline hooks into Gmail Pub/Sub independently of Inbox Zero's existing webhook handler. A second Pub/Sub push subscription delivers notifications to a separate endpoint.

```
Gmail Pub/Sub push
       |
       |---> /api/google/webhook        (Inbox Zero -- rules, labels, archive)
       |
       \---> /api/chief-of-staff/webhook (Chief of Staff pipeline)
                    |
                    v
            Fetch email via history.list()
                    |
                    v
            Pre-filter (Stage 1 & 2)
                    |
              +-----+------+
              |             |
           skip/batch    process
              |             |
              v             v
        Log to DB     Claude Engine
        (+ shipping      |
         calendar)        v
                    Check autonomy level
                       |
                +------+-------+
                |              |
          auto-handle    draft+approve
                |              |
                v              v
          Execute action   Create Gmail draft
          (Acuity, send)   (append signature)
                |              |
                v              v
          Post notification  Post to Slack
          to Slack           with buttons
          (no buttons)         |
                               v
                         Wait for Nick
                         (approve/edit/reject)
```

**Failure isolation:** If the Chief of Staff pipeline crashes, Inbox Zero's existing processing is completely unaffected, and vice versa.

**Deduplication:** The Chief of Staff tracks processed message IDs in its `ProcessedEmail` table to avoid reprocessing. Gmail Pub/Sub may redeliver notifications — the webhook checks for an existing `ProcessedEmail` record before processing.

**Error handling and retry strategy:**
- The webhook returns 200 immediately and processes asynchronously (using Next.js `after()` API, matching Inbox Zero's pattern). This prevents Pub/Sub redelivery storms.
- On partial failure (e.g., Claude succeeds but Slack fails), the `ProcessedEmail` record is marked `failed` with the failure stage noted. A periodic retry job (every 5 minutes) re-attempts failed emails from the last failed stage.
- Idempotency is guaranteed by the `ProcessedEmail.messageId` unique constraint — duplicate Pub/Sub deliveries are no-ops.
- After 3 failed retries, the email is marked `dead_letter` and a Slack alert is posted: "Chief of Staff: failed to process email from [sender] after 3 attempts."

**Webhook authentication:** The Pub/Sub push subscription sends a JWT bearer token in the `Authorization` header. The webhook verifies this token using Google's OAuth2 token verification, matching the expected service account audience. Requests without a valid token are rejected with 401.

---

## 3. Pre-Filter Engine

**Location:** `apps/web/utils/chief-of-staff/pre-filter.ts`

**Input:** Gmail message metadata (sender, subject, labels, category, headers)
**Output:** `process` | `skip` | `batch-summary` | `create-calendar-event`

### Filter Chain (evaluated in order, first match wins)

1. **Gmail category check** — promotions, social, forums -> `skip`
2. **Sender blocklist** — configurable list of domains/patterns (stored in DB) -> `skip`
3. **Mailing list headers** — `List-Unsubscribe` or `List-Id` header present -> `skip`
4. **Bounce/delivery status** — `Content-Type: multipart/report` or mailer-daemon sender -> `skip`
5. **Shipping/delivery emails** — subject contains shipped/delivery/tracking/out for delivery, or sender matches ups.com/fedex.com/usps.com/amazon shipment patterns -> `create-calendar-event`
6. **Gmail "updates" category** (remaining) — receipts, confirmations -> `batch-summary`
7. **Everything else** -> `process` (sent to Claude)

### Shipping Calendar Events

When a shipping email is detected, the pre-filter creates an all-day Google Calendar event on the Personal calendar (leekenick@gmail.com):

- **Title:** `Shipping: [Item/Seller]` (parsed from subject line with heuristics)
- **Description:** Link to the Gmail message
- **No Claude call required** — pure metadata parsing + Google Calendar API

### Configuration

- Sender blocklist editable via web UI
- Override rules supported (e.g., "always process emails from @smartcollege.com even if they have list headers")
- Every filtered email logged to `FilteredEmail` table (messageId, sender, filter_reason, timestamp) for auditing

### Batch Summary Handling

Emails categorized as `batch-summary` (receipts, confirmations, non-shipping updates) are logged to `FilteredEmail` with `filterReason: batch_summary`. Every 4 hours (or at end of day), a lightweight Slack message is posted to #chief-of-staff summarizing batched items as a simple list — no buttons, no drafts:

```
Batch Summary (4 items since 12pm):
- Amazon order confirmation: Wireless mouse ($24.99)
- Stripe receipt: Monthly hosting ($20.00)
- Google Workspace: Storage usage alert
- DoorDash: Delivery confirmation
```

No Claude call needed — subject line + sender parsing only.

### Cost Impact

Estimated 50 emails/day -> ~10-15 reach Claude after filtering. ~$0.15-0.75/day instead of $2.50.

---

## 4. Claude Processing Engine

**Location:** `apps/web/utils/chief-of-staff/engine.ts`

### System Prompt

The Chief of Staff SKILL.md content serves as the base system prompt, with dynamic sections injected at runtime:

- Current autonomy levels per category (queried from `AutonomyLevel` table)
- Venture context: which inbox received the email + corresponding voice/tone profile
- Current date/time in America/Chicago timezone
- Day protection rules: "Tuesday is a protected recovery day — never suggest tutoring on Tuesdays. Friday is a protected non-tutoring day — only suggest Friday tutoring for VIP clients (5+ past bookings)."

### Model

`claude-sonnet-4-6` via Inbox Zero's existing AI SDK integration. Falls back to the configured default if needed.

### Tools (defined via AI SDK `tool()` with Zod schemas)

| Tool | Purpose | Backed By |
|------|---------|-----------|
| `check_calendar` | Query all 6 Google Calendars for a time range, apply prefix convention, enforce day protections | Google Calendar API (existing) + prefix logic (new) |
| `check_acuity_availability` | Get open tutoring slots for a date range | Acuity REST API (new) |
| `get_client_history` | Count past bookings for VIP check, using client group aggregation | Acuity REST API (new) + ClientGroup lookup |
| `book_appointment` | Create a new Acuity appointment | Acuity REST API (new) |
| `reschedule_appointment` | Move an existing Acuity appointment | Acuity REST API (new) |
| `cancel_appointment` | Cancel an Acuity appointment | Acuity REST API (new) |
| `create_gmail_draft` | Create a draft email in Gmail with signature appended | Gmail API (existing) |

**Note:** There is no `send_gmail` tool for Claude. Claude only creates drafts — never sends directly. Sending happens exclusively through the Slack approval flow, where the action handler calls `gmail.users.drafts.send()` (see Section 7).

### Structured Response

Claude returns:

```json
{
  "category": "scheduling | client_parent | business | urgent | notification | low_priority",
  "summary": "One-line summary for Slack",
  "action_taken": "What the bot did (if auto-handle) or null",
  "draft": {
    "to": "email@example.com",
    "subject": "Re: Subject",
    "body": "Draft body text",
    "gmail_draft_id": "draft_abc123"
  },
  "needs_approval": true,
  "conflicts": ["~Grocery run (Sat 11:30am-12:30pm)"],
  "is_vip": false,
  "vip_group_name": null
}
```

### Email Categorization

| Category | Icon | Default Autonomy | Behavior |
|----------|------|-------------------|----------|
| Scheduling (standard) | calendar | Auto-Handle | Execute reschedules/bookings, send confirmations, report |
| Scheduling (cancellations) | calendar | Draft + Approve | Draft cancellation, wait for approval |
| Client/Parent | family | Draft + Approve | Draft response, present for approval |
| Business | briefcase | Draft + Approve | Draft response, present for approval |
| Urgent | alert | Flag Only | Never auto-handle, always escalate |
| Notification | bell | Auto-Handle | Log and summarize silently |
| Low Priority | mailbox | Auto-Handle | Summarize and suggest archive |

### Same-Day Escalation

If someone requests a session for today or tomorrow, the email escalates to Urgent regardless of other factors.

---

## 5. Calendar Checker with Prefix Convention

**Location:** `apps/web/utils/chief-of-staff/calendar/checker.ts`

### `check_calendar` Tool Implementation

For a given time range, queries all 6 Google Calendars (with 15-minute buffer on each side):

| Calendar | ID | Default Treatment |
|----------|----|-------------------|
| Personal (primary) | `leekenick@gmail.com` | Prefix convention applies |
| Smart College | `cde6ed85...@group.calendar.google.com` | Prefix convention applies |
| RMS Work | `nicholas.leeke@rpsmn.org` | Always hard block during school hours |
| Praxis | `4ef466c3...@group.calendar.google.com` | Prefix convention applies |
| Nutrition | `20f52ebc...@group.calendar.google.com` | Always treated as soft/movable |
| Workout | `2b8c2dda...@group.calendar.google.com` | Always treated as soft/movable |

### Prefix Convention

| Prefix | Meaning | Scheduling Impact |
|--------|---------|-------------------|
| *(none)* | Hard block | Slot unavailable |
| `~` | Soft/movable | Slot available but note the overlap |
| `FYI:` | Informational | Completely ignored |

### Day Protection Rules

- **Tuesday:** Always returns unavailable for tutoring. No override, not even for VIPs.
- **Friday:** Returns unavailable for tutoring. Overridable for VIP clients only (`is_vip: true` parameter).

### Return Format

```json
{
  "available": true,
  "hardBlocks": [],
  "softConflicts": [
    { "title": "Grocery run", "calendar": "Personal", "start": "11:30", "end": "12:30" }
  ]
}
```

Claude never sees raw calendar events — the prefix logic is pre-processed.

---

## 6. Acuity REST API Client

**Location:** `apps/web/utils/chief-of-staff/acuity/`

### Authentication

HTTP Basic Auth with `ACUITY_USER_ID:ACUITY_API_KEY` (base64-encoded). Credentials stored in `.env`.

**Base URL:** `https://acuityscheduling.com/api/v1`

### Files

**`client.ts`** — Thin HTTP wrapper
- `acuityFetch(method, path, body?)` — single entry point for all requests
- Handles 429 rate limiting with exponential backoff
- Typed error handling

**`availability.ts`** — Slot checking
- `getAvailableDates(appointmentTypeId, month)` -> `GET /availability/dates`
- `getAvailableTimes(appointmentTypeId, date)` -> `GET /availability/times`
- Session limits enforced by Acuity's configured windows — no custom enforcement needed

**`actions.ts`** — Booking operations
- `bookAppointment(typeId, datetime, clientInfo)` -> `POST /appointments`
- `rescheduleAppointment(appointmentId, datetime)` -> `PUT /appointments/:id/reschedule`
- `cancelAppointment(appointmentId)` -> `PUT /appointments/:id/cancel`
- `getClientAppointments(email)` -> `GET /appointments?email=...`

### VIP Detection

`getClientAppointments` returns all past bookings for an email. Count non-cancelled results. If >= 5, client is VIP.

**Client group aggregation:** When checking VIP status, look up the email in `ClientGroupMember`, find all emails in that group, sum bookings across all of them. This handles the case where parents book under their own name or their student's name with different emails.

**Caching:** VIP results cached in `VipCache` table, refreshed every 24 hours.

### VIP Privileges

- If no standard-window slots work, check slots 1 hour before and 1 hour after normal tutoring windows
- Friday tutoring protection can be overridden for VIPs
- Warmer language in drafts: "I can make this work for you"

---

## 7. Slack Approval Flow

**Location:** `apps/web/utils/chief-of-staff/slack/` and `apps/web/app/api/chief-of-staff/slack/`

### Message Format (Block Kit)

**Draft + Approve messages:**

```
mail New email from Sarah Johnson
Re: Zach's Tuesday session
------
Category: calendar Scheduling (Reschedule)
Inbox: Smart College
VIP: check (12 past sessions -- Johnson family)

Summary: Sarah wants to move Zach from Wednesday 3pm
to Saturday. Rescheduled to Sat 12pm in Acuity.
Confirmation draft ready.

warning Soft conflict: ~Grocery run (Sat 11:30am-12:30pm)

> View draft                    [expand/collapse]
------
[Approve]  [Edit]  [Reject]
```

**Auto-handle messages (no buttons):**

```
check Auto-handled: Rescheduled Zach's session
Moved Wed 3pm -> Sat 12pm. Confirmation sent to Sarah.
```

### Batch Mode

If 3+ emails arrive within a 2-minute window:
- Parent message: "mail Chief of Staff -- 5 new emails processed"
- Thread replies: one per email with individual approve/reject buttons

### Button Interactions

**API route:** `POST /api/chief-of-staff/slack/interactions`
- Registered as Slack's Interactivity Request URL
- Verifies Slack signing secret using `crypto.timingSafeEqual` (not Slack Bolt — Bolt's HTTP server conflicts with Next.js routing)
- Uses `@slack/web-api` for posting messages and opening modals

| Button | Behavior |
|--------|----------|
| **Approve** | Send the Gmail draft via `gmail.users.drafts.send()`. Update Slack message to "Sent". Update `PendingDraft` status. |
| **Edit** | Open Slack modal with draft body in editable text area. On submit, update draft and send. Update message to "Sent (edited)". |
| **Reject** | Delete the Gmail draft. Update message to "Skipped". Log to DB. |

### Gmail Signatures

Gmail API does not auto-append signatures. The pipeline handles this:

1. Fetch signature via `gmail.users.settings.sendAs.get(userId, sendAsEmail)`
2. Cache per inbox in `ChiefOfStaffConfig.signatureHtml`
3. Refresh cache daily
4. Append cached signature to every draft body before calling `drafts.create`

Each inbox (Personal, Smart College) gets its own signature.

---

## 8. Multi-Inbox Routing & Voice/Tone

### Phase 1 Inboxes

| Inbox | Venture | Voice |
|-------|---------|-------|
| leekenick@gmail.com | Personal | Casual, direct |
| nick@smartcollege.com | Smart College | Warm, professional, first-name basis with parents |

### Venture Detection Logic (evaluated in order)

1. **Which inbox received it?** — nick@smartcollege.com -> Smart College, nick@growwithpraxis.com -> Praxis (Phase 2), leekenick@gmail.com -> continue
2. **Sender domain** — @smartcollege.com -> Smart College, @growwithpraxis.com -> Praxis
3. **Client group lookup** — sender email in a ClientGroup associated with Acuity bookings -> Smart College
4. **Default** -> Personal

### Voice/Tone Injection

The detected venture determines a voice profile injected into Claude's system prompt:

**Smart College:**
> Warm but professional. First-name basis with parents. Reference the student by name when possible. Keep it concise.
> Example: "Hi Sarah -- great news, I was able to move Zach's session to Saturday at noon. He's all set!"

**Personal:**
> Direct and casual. Nick's personal voice.

**Praxis (Phase 2):**
> More formal, forward-looking, solution-oriented. Express interest in partnerships, suggest calls.

Voice/tone profiles stored in `ChiefOfStaffConfig.voiceTone` as JSON, editable via web UI without redeploying.

---

## 9. Graduation System

Autonomy levels stored in the `AutonomyLevel` database table and injected into Claude's system prompt at runtime so the AI knows its boundaries.

### Default Levels

| Category | Mode | Behavior |
|----------|------|----------|
| Scheduling (standard) | Auto-Handle | Execute and report |
| Scheduling (cancellations) | Draft + Approve | Draft, wait for approval |
| Client/Parent | Draft + Approve | Draft, wait for approval |
| Business | Draft + Approve | Draft, wait for approval |
| Urgent | Flag Only | Never auto-handle |
| Notification | Auto-Handle | Log silently |
| Low Priority | Auto-Handle | Summarize, suggest archive |

### Changing Levels

Autonomy levels can be changed via:
- Web UI settings page
- Slack command (future): "promote client emails to auto-handle"

The DB is the source of truth. Current levels are templated into the system prompt on every Claude call.

---

## 10. Data Model (Prisma Schema Additions)

All new models. No modifications to existing Inbox Zero models.

### ChiefOfStaffConfig

Per-inbox configuration.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| emailAccountId | String | FK to EmailAccount |
| venture | Enum | smart_college, praxis, personal |
| voiceTone | Json | Tone guidelines for this venture |
| signatureHtml | String? | Cached Gmail signature |
| signatureLastFetched | DateTime? | Cache refresh timestamp |
| enabled | Boolean | Toggle processing on/off |

**Constraints:** `@@unique([emailAccountId])` — one config per inbox. `@relation` to `EmailAccount`.

### AutonomyLevel

Graduation system configuration.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| emailAccountId | String | FK to EmailAccount |
| category | Enum | scheduling, scheduling_cancel, client_parent, business, urgent, notification, low_priority |
| mode | Enum | auto_handle, draft_approve, flag_only |

**Constraints:** `@@unique([emailAccountId, category])` — one autonomy level per category per inbox. `@relation` to `EmailAccount`.

### PendingDraft

Links Slack messages to Gmail drafts.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| slackMessageTs | String (unique) | Slack message timestamp |
| slackChannelId | String | Channel ID |
| gmailDraftId | String | Gmail draft ID |
| gmailThreadId | String | Gmail thread ID (needed to thread replies correctly) |
| emailAccountId | String | FK to EmailAccount |
| toAddress | String | Recipient |
| subject | String | Email subject |
| bodyHtml | String | Draft content |
| category | Enum | Chief of Staff category |
| status | Enum | pending, approved, edited, rejected |
| claudeResponse | Json | Full engine response for auditing |
| processedEmailId | String? | FK to ProcessedEmail (inverse relation) |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### ProcessedEmail

Tracks all emails that entered the Claude processing pipeline. Used for deduplication and auditing.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| messageId | String (unique) | Gmail message ID — deduplication key |
| threadId | String | Gmail thread ID |
| emailAccountId | String | FK to EmailAccount |
| category | Enum? | Chief of Staff category (null if failed before categorization) |
| status | Enum | processing, completed, failed, dead_letter |
| failedStage | String? | Which stage failed (e.g., "claude", "slack_post", "draft_create") |
| retryCount | Int | Number of retry attempts (max 3) |
| actionTaken | String? | What the bot did |
| pendingDraftId | String? | FK to PendingDraft (one-to-one, navigable both directions) |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### VipCache

Cached Acuity VIP lookups.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| clientEmail | String | Client's email |
| clientGroupId | String? | FK to ClientGroup |
| bookingCount | Int | Non-cancelled bookings |
| isVip | Boolean | bookingCount >= 5 |
| lastChecked | DateTime | Refresh after 24 hours |

**Constraints:** `@unique` on `clientEmail`.

### ClientGroup

Groups related Acuity clients into a family unit.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| primaryName | String | Display name (e.g., "Johnson family") |
| createdAt | DateTime | |

### ClientGroupMember

Members of a client group.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| clientGroupId | String | FK to ClientGroup |
| email | String | Email address |
| name | String | Name as it appears in Acuity |
| source | Enum | auto, manual |

**Constraints:** `@unique` on `email` — a single email can only belong to one client group.

Auto-grouping heuristics: same email domain + same last name, or same phone number across Acuity records. Manual override via web UI.

### FilteredEmail

Lightweight log of pre-filtered emails.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| messageId | String (unique) | Gmail message ID — prevents duplicate records on Pub/Sub redelivery |
| sender | String | Email address |
| filterReason | Enum | gmail_category, blocklist, mailing_list, bounce, shipping, batch_summary |
| emailAccountId | String | Which inbox |
| timestamp | DateTime | |

### ShippingEvent

Tracks shipping calendar events created.

| Field | Type | Purpose |
|-------|------|---------|
| id | String (cuid) | Primary key |
| messageId | String | Gmail message ID |
| emailAccountId | String | FK to EmailAccount |
| calendarEventId | String | Google Calendar event ID |
| itemDescription | String | Parsed item/seller name |
| timestamp | DateTime | |

---

## 11. File Structure (New Code)

```
apps/web/
  app/api/chief-of-staff/
    webhook/
      route.ts                    # Gmail Pub/Sub endpoint
      process.ts                  # Fetch email, run pipeline
    slack/
      interactions/
        route.ts                  # Button clicks + modal submissions
  utils/chief-of-staff/
    engine.ts                     # Claude processing with system prompt + tools
    pre-filter.ts                 # Junk/shipping detection before Claude
    tools.ts                      # Tool definitions (Zod schemas)
    system-prompt.ts              # Dynamic prompt builder
    types.ts                      # Shared types
    acuity/
      client.ts                   # HTTP wrapper with retry
      availability.ts             # Slot checking
      actions.ts                  # Book, reschedule, cancel
    calendar/
      checker.ts                  # Multi-calendar query + prefix convention
      day-protection.ts           # Tuesday/Friday rules
    slack/
      poster.ts                   # Block Kit message construction + posting
      blocks.ts                   # Block Kit builders
      actions.ts                  # Approve/edit/reject handlers
      batch.ts                    # Batch mode (3+ emails)
    routing/
      venture-detector.ts         # Inbox -> venture mapping
      voice-tone.ts               # Voice/tone profile injection
    signatures/
      fetcher.ts                  # Gmail signature fetch + cache
    vip/
      detector.ts                 # VIP check with client group aggregation
      client-grouper.ts           # Auto-grouping heuristics
    jobs/
      retry-failed.ts             # Retry failed ProcessedEmail records (every 5 min)
      batch-summary.ts            # Post batch summary to Slack (every 4 hours)
      refresh-signatures.ts       # Refresh cached Gmail signatures (daily)
      refresh-vip-cache.ts        # Refresh expired VipCache entries (daily)
  app/api/chief-of-staff/
    cron/
      route.ts                    # Single cron endpoint, dispatches jobs by type
  prisma/
    (additions to existing schema.prisma)
  config/
    system-prompt.md              # Chief of Staff skill content (from SKILL.md)
```

---

## 12. Extension Point — Asana (Phase 3)

Not built in Phase 1. Documented hook location:

After Claude engine returns its response and before posting to Slack, an extension point exists for additional integrations. Asana task creation would be implemented as either:

- A new Claude tool: `create_asana_task(project, title, description, due_date)` using workspace GID `1204909498385762` and the appropriate project
- Or an MCP server using Inbox Zero's existing MCP framework

Decision deferred to Phase 3.

---

## 13. Configuration Summary

### Environment Variables (additions to .env)

```
# Acuity Scheduling
ACUITY_USER_ID=...
ACUITY_API_KEY=...

# Chief of Staff
CHIEF_OF_STAFF_SLACK_CHANNEL_ID=C...
CHIEF_OF_STAFF_TIMEZONE=America/Chicago
CHIEF_OF_STAFF_TUTORING_RATE=130
CHIEF_OF_STAFF_VIP_THRESHOLD=5
```

### Scheduled Jobs

A single cron API route (`/api/chief-of-staff/cron`) is called by Railway's cron scheduler (or an external cron service). The `type` query parameter selects which job to run:

| Job | Schedule | Purpose |
|-----|----------|---------|
| `retry-failed` | Every 5 minutes | Retry `ProcessedEmail` records with status `failed` (max 3 retries) |
| `batch-summary` | Every 4 hours | Post batch summary of filtered update emails to Slack |
| `refresh-signatures` | Daily at 6am CT | Refresh cached Gmail signatures |
| `refresh-vip-cache` | Daily at 6am CT | Refresh expired VipCache entries |

### Slack Channel Setup

`CHIEF_OF_STAFF_SLACK_CHANNEL_ID` should point to a **private** `#chief-of-staff` channel. The Slack bot must be invited to this channel. Create the channel manually in Slack before deploying.

### Key Rules

- **Tuesday:** Protected recovery day. No tutoring, no VIP override.
- **Friday:** Protected non-tutoring day. VIP override allowed.
- **Timezone:** Always America/Chicago for all calendar and scheduling operations.
- **Tutoring rate:** $130/session.
- **VIP threshold:** 5+ past bookings (aggregated across client group).
- **Same-day requests:** Escalate to Urgent regardless of category.
- **Session limits:** Enforced by Acuity's configured availability windows, not by the bot.
- **Back-to-back sessions:** Deferred — Acuity handles session limits. If needed later, can be added as a `consecutiveSessionWarning` field in the `check_calendar` return format.
- **Signatures:** Fetched from Gmail API, cached per inbox, appended to every draft.

---

## 14. What We Are NOT Touching

- Inbox Zero's rule engine
- Existing webhook handler (`/api/google/webhook`)
- Web UI pages (dashboard, settings, analytics)
- Newsletter/unsubscriber features
- Tinybird analytics
- Lemon Squeezy payments
- Any existing Prisma models

---

## 15. Document Supersession

This design spec supersedes the earlier `chief-of-staff-bot-architecture.md` in the project root, which described a standalone Node.js service with SQLite and PM2. Key differences:

| Original Architecture Doc | This Design Spec |
|--------------------------|-----------------|
| Standalone Node.js service | Additive layer on Inbox Zero (Next.js) |
| SQLite + better-sqlite3 | Postgres + Prisma (Inbox Zero's stack) |
| PM2 process management | Railway deployment |
| Build everything from scratch | Leverage existing Gmail, AI, Calendar, Slack integrations |
| Phase 1: leekenick@gmail.com only | Phase 1: leekenick@gmail.com + nick@smartcollege.com |

The old architecture doc should be archived or annotated with a deprecation notice pointing to this spec.
