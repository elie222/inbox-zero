# Chief of Staff Bot — Architecture Specification

**Author:** Nick Leeke + Claude
**Date:** March 21, 2026
**Status:** Design spec — ready to build
**Purpose:** Real-time email monitoring + Slack-based approval flow for autonomous email and scheduling management

---

## What This Bot Does

A persistent Node.js service that monitors Nick's Gmail inboxes, processes incoming emails using Claude's AI, cross-references scheduling requests against Google Calendar and Acuity, and posts summaries + approval requests to a dedicated Slack channel. Nick approves, edits, or rejects actions from his phone.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     NICK'S PHONE (Slack)                     │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  #chief-of-staff channel                            │     │
│  │  ┌──────────────────────────────────────────────┐   │     │
│  │  │ 📧 New email from Sarah Johnson              │   │     │
│  │  │ Re: Zach's Tuesday session                   │   │     │
│  │  │                                              │   │     │
│  │  │ Category: 🗓️ Scheduling (Reschedule)          │   │     │
│  │  │ Action taken: Rescheduled to Sat 12pm        │   │     │
│  │  │ Confirmation draft ready.                    │   │     │
│  │  │                                              │   │     │
│  │  │ [👍 Approve] [✏️ Edit] [❌ Reject]            │   │     │
│  │  └──────────────────────────────────────────────┘   │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────┬──────────────────────────────┘
                               │ Slack Interactivity Webhook
                               ▼
┌──────────────────────────────────────────────────────────────┐
│              CHIEF OF STAFF BOT (Node.js)                     │
│              Running on: Mac Mini / VPS / Railway             │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Gmail    │  │ Claude   │  │ Calendar │  │ Acuity   │     │
│  │ Listener │→ │ Brain    │→ │ Checker  │→ │ Manager  │     │
│  │(Pub/Sub) │  │(API+Tools│  │(Google   │  │(REST API)│     │
│  │          │  │ calling) │  │ Cal API) │  │          │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│       │              │              │              │          │
│       │              ▼              │              │          │
│       │     ┌──────────────┐       │              │          │
│       │     │ Slack Poster │◄──────┘──────────────┘          │
│       │     │ (Bolt SDK)   │                                 │
│       │     └──────────────┘                                 │
│       │              │                                       │
│       │              ▼                                       │
│       │     ┌──────────────┐                                 │
│       │     │ Action       │ ← Slack button clicks           │
│       │     │ Handler      │ → Send email / execute action   │
│       │     └──────────────┘                                 │
│       │                                                      │
│       │     ┌──────────────┐                                 │
│       └────→│ State Store  │ (SQLite or JSON file)           │
│             │ - processed  │                                 │
│             │   email IDs  │                                 │
│             │ - VIP cache  │                                 │
│             │ - draft map  │                                 │
│             └──────────────┘                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Component | Technology | Package/Service |
|-----------|-----------|-----------------|
| Runtime | Node.js 20+ | — |
| Slack bot framework | Slack Bolt | `@slack/bolt` |
| Claude AI | Anthropic API with tool use | `@anthropic-ai/sdk` |
| Gmail monitoring | Google Pub/Sub push | `googleapis` + `@google-cloud/pubsub` |
| Calendar checking | Google Calendar API | `googleapis` |
| Acuity scheduling | Acuity REST API | `node-fetch` (Basic Auth) |
| State persistence | SQLite | `better-sqlite3` |
| Environment config | dotenv | `dotenv` |
| Process management | PM2 | `pm2` (keeps bot alive) |
| Tunnel (dev) | ngrok or Cloudflare Tunnel | For Slack interactivity URL |

---

## Component Details

### 1. Gmail Listener (Pub/Sub)

Gmail doesn't support direct webhooks. Instead, it uses Google Cloud Pub/Sub as an intermediary.

**Setup once:**
1. Create a Google Cloud project
2. Enable Gmail API + Cloud Pub/Sub API
3. Create a Pub/Sub topic: `projects/YOUR_PROJECT/topics/chief-of-staff-gmail`
4. Grant Gmail publish permission: add `gmail-api-push@system.gserviceaccount.com` as a publisher on the topic
5. Create a push subscription pointing to your bot's `/webhook/gmail` endpoint

**In the bot:**
- On startup, call `gmail.users.watch()` to register for push notifications
- Renew the watch every 6 days (cron job or setInterval)
- When a push arrives, it contains only `emailAddress` + `historyId`
- Use `gmail.users.history.list()` with the historyId to fetch actual new messages
- Deduplicate using the state store (track processed messageIds)

**Multi-inbox support:**
- Call `gmail.users.watch()` for each connected inbox
- Each inbox needs its own OAuth token (stored in the state store)
- The Pub/Sub topic can be shared — the payload includes which email address triggered

**Rate limiting note:** Gmail Pub/Sub is near-real-time (typically < 10 seconds from email arrival to webhook fire).

### 2. Claude Brain (Email Processing)

The brain receives an email's full content and returns: category, action taken (if any), and draft response.

**Implementation:** Use the Anthropic API with custom tools. The system prompt is the Chief of Staff skill's SKILL.md content (ported from the Cowork skill). The tools give Claude access to calendar and Acuity data.

**Tools to define:**

| Tool Name | Purpose | Backed By |
|-----------|---------|-----------|
| `check_calendar` | Query Google Calendar for events in a time range across all calendars | Google Calendar API |
| `check_acuity_availability` | Get open tutoring slots for a date range | Acuity REST API |
| `get_client_history` | Count past bookings for a client (VIP check) | Acuity REST API |
| `reschedule_appointment` | Move an Acuity appointment to a new time | Acuity REST API |
| `cancel_appointment` | Cancel an Acuity appointment | Acuity REST API |
| `book_appointment` | Create a new Acuity appointment | Acuity REST API |
| `create_gmail_draft` | Create a draft email in Gmail | Gmail API |
| `send_gmail` | Send an email (only called after Slack approval) | Gmail API |

**Conversation flow:**
```
1. Bot sends email content + system prompt to Claude
2. Claude categorizes the email
3. If scheduling: Claude calls check_calendar + check_acuity_availability tools
4. Claude returns: { category, summary, action_taken, draft_response, needs_approval }
5. Bot posts result to Slack
```

**Model choice:** `claude-sonnet-4-6` — fast enough for real-time, smart enough for nuanced categorization. Use `claude-opus-4-6` only if sonnet makes categorization errors during testing.

**Cost estimate:** ~$0.01-0.05 per email processed (depending on email length and tool calls). At 30-50 emails/day, roughly $1-2.50/day.

### 3. Calendar Checker

Wraps the Google Calendar API to implement the prefix convention logic.

**Core function: `isSlotAvailable(startTime, endTime)`**

```
For each of the 6 calendar IDs:
  Fetch events overlapping (startTime - 15min) to (endTime + 15min)

  For each event:
    If title starts with "FYI:" → skip
    If title starts with "~" → soft conflict (available but note it)
    If calendar is Nutrition or Workout → soft conflict
    Otherwise → hard block

Return:
  { available: boolean, hardBlocks: [...], softConflicts: [...] }
```

**Calendar IDs** are stored in a config file (same as the system-ids.md reference).

### 4. Acuity Manager

Uses Acuity's REST API instead of browser automation. Much faster and more reliable.

**Authentication:** HTTP Basic Auth with userId:apiKey from Acuity Settings → API & Integrations.

**Key endpoints:**
- `GET /appointments` — list appointments (filter by date, client, status)
- `GET /availability/dates` — get available dates for an appointment type
- `GET /availability/times` — get available times for a specific date
- `POST /appointments` — create new appointment
- `PUT /appointments/:id/reschedule` — reschedule
- `PUT /appointments/:id/cancel` — cancel

**VIP detection:** `GET /appointments?email=parent@email.com` → count results where status is not cancelled. If count >= 5, client is VIP.

### 5. Slack Poster + Action Handler

Uses Slack Bolt to post rich messages and handle button interactions.

**Message format (Block Kit):**

For each processed email, post a message to `#chief-of-staff` with:
- Email metadata (from, subject, time)
- Category badge
- Summary of what the bot did or recommends
- The draft response (in a collapsible section)
- Action buttons: Approve / Edit / Reject

**When Nick taps "Approve":**
1. Bot calls `gmail.users.messages.send()` with the draft
2. Updates the Slack message to show "✅ Sent"
3. Logs the action in state store

**When Nick taps "Edit":**
1. Bot opens a Slack modal with the draft text in an editable text area
2. Nick edits on his phone and submits
3. Bot sends the edited version
4. Updates Slack message to show "✅ Sent (edited)"

**When Nick taps "Reject":**
1. Bot discards the draft
2. Updates Slack message to show "❌ Skipped"

**Batch mode:** If multiple emails arrive at once (e.g., morning batch), post a summary thread:
- Parent message: "📧 Chief of Staff — 7 new emails processed"
- Thread replies: one per email with individual approve/reject buttons

### 6. State Store (SQLite)

Lightweight persistence to track:

| Table | Purpose |
|-------|---------|
| `processed_emails` | messageId, threadId, category, action_taken, status, timestamp |
| `gmail_tokens` | email_address, access_token, refresh_token, expiry |
| `vip_cache` | client_email, booking_count, last_checked |
| `pending_drafts` | slack_message_ts, gmail_draft_id, email_to, subject, body |
| `config` | key-value pairs for runtime settings |

---

## Setup Guide

### Prerequisites
- Node.js 20+
- Google Cloud account (for Pub/Sub — free tier covers this)
- Slack workspace with permission to install apps
- Anthropic API key
- Acuity API credentials

### Step 1: Google Cloud Setup (30 min)

1. Create project at console.cloud.google.com
2. Enable APIs: Gmail API, Google Calendar API, Cloud Pub/Sub API
3. Create OAuth 2.0 credentials (Desktop or Web app type)
4. Download client_secret.json
5. Create Pub/Sub topic: `chief-of-staff-gmail`
6. Add `gmail-api-push@system.gserviceaccount.com` as Publisher on the topic
7. Create a push subscription pointing to `https://YOUR_DOMAIN/webhook/gmail`

### Step 2: Slack App Setup (20 min)

1. Go to api.slack.com/apps → Create New App
2. Name: "Chief of Staff"
3. Bot Token Scopes: `chat:write`, `channels:read`, `channels:history`, `reactions:write`
4. Enable Interactivity → set Request URL to `https://YOUR_DOMAIN/slack/events`
5. Install to workspace → copy Bot Token and Signing Secret
6. Create `#chief-of-staff` channel and invite the bot

### Step 3: Acuity API Setup (5 min)

1. Log into Acuity → Settings → API & Integrations
2. Copy User ID and API Key
3. Store in .env file

### Step 4: Environment Configuration

Create `.env` file:

```
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_CHANNEL_ID=C...

# Google
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_PUBSUB_TOPIC=projects/YOUR_PROJECT/topics/chief-of-staff-gmail

# Acuity
ACUITY_USER_ID=...
ACUITY_API_KEY=...

# Config
TIMEZONE=America/Chicago
TUTORING_RATE=130
VIP_THRESHOLD=5
```

### Step 5: First Run

```bash
npm install
node scripts/setup-oauth.js    # One-time: authorize Gmail + Calendar access
node scripts/setup-watch.js    # Register Gmail push notifications
npm start                      # Start the bot
```

### Step 6: Keep It Running

```bash
npm install -g pm2
pm2 start index.js --name chief-of-staff
pm2 startup                    # Auto-start on Mac boot
pm2 save
```

---

## Project File Structure

```
chief-of-staff-bot/
├── index.js                    # Entry point — starts all services
├── package.json
├── .env                        # Secrets (gitignored)
├── config/
│   ├── calendars.json          # Calendar IDs and prefix rules
│   ├── system-prompt.md        # Chief of Staff instructions (from skill)
│   └── voice-templates.json    # Response tone by venture/category
├── src/
│   ├── gmail/
│   │   ├── listener.js         # Pub/Sub webhook handler
│   │   ├── fetcher.js          # Fetch email content from history
│   │   └── sender.js           # Send/draft emails
│   ├── claude/
│   │   ├── brain.js            # Claude API + tool orchestration
│   │   └── tools.js            # Tool definitions for Claude
│   ├── calendar/
│   │   ├── checker.js          # Multi-calendar availability check
│   │   └── prefix-parser.js    # Parse ~, FYI: conventions
│   ├── acuity/
│   │   ├── client.js           # REST API wrapper
│   │   ├── availability.js     # Slot checking
│   │   └── actions.js          # Book, reschedule, cancel
│   ├── slack/
│   │   ├── poster.js           # Post messages to channel
│   │   ├── blocks.js           # Block Kit message builders
│   │   └── actions.js          # Button interaction handlers
│   └── state/
│       ├── db.js               # SQLite connection
│       └── models.js           # Data access layer
├── scripts/
│   ├── setup-oauth.js          # One-time OAuth authorization
│   ├── setup-watch.js          # Register Gmail push notifications
│   └── renew-watch.js          # Cron-able watch renewal
└── data/
    └── chief-of-staff.db       # SQLite database (gitignored)
```

---

## Cost Breakdown (Monthly Estimate)

| Item | Cost |
|------|------|
| Anthropic API (Claude Sonnet, ~40 emails/day) | ~$30-75/month |
| Google Cloud Pub/Sub (free tier) | $0 |
| Gmail API (free tier) | $0 |
| Google Calendar API (free tier) | $0 |
| Acuity API (included in plan) | $0 |
| Slack (free plan works) | $0 |
| Hosting (if VPS instead of local Mac) | $5-20/month |
| **Total** | **~$30-95/month** |

---

## Scaling Path

**Phase 1 (this spec):** Single inbox (leekenick@gmail.com) → Slack notifications

**Phase 2:** Add nick@smartcollege.com and nick@growwithpraxis.com as additional watched inboxes. Each gets its own OAuth token. The bot routes emails to the right voice/tone based on which inbox received them.

**Phase 3:** Add Asana integration — when an email results in a task (e.g., "I need to prepare materials for Zach"), the bot creates an Asana task in the right project.

**Phase 4:** Add scheduled briefings — the bot posts a morning summary to Slack at 6:30 AM combining the executive-briefing skill's output with overnight email activity.

**Phase 5:** Conversation memory — the bot remembers past interactions with each client and uses that context in drafts (e.g., "Last time Sarah emailed about Zach, it was about schedule flexibility — she may appreciate proactive suggestions").

---

## Security Considerations

- All API keys and tokens stored in `.env` (gitignored) or encrypted at rest
- Gmail OAuth tokens are per-user and scoped to minimum required permissions
- Slack signing secret verification on all incoming webhooks
- The bot never stores email content long-term — only messageIds and metadata
- Acuity API credentials use Basic Auth (HTTPS encrypted in transit)
- If hosting on a VPS, use HTTPS (Let's Encrypt) for all webhook endpoints
- PM2 runs the bot as a non-root user

---

## What the Chief of Staff Skill Gives You

The Cowork skill (chief-of-staff.skill) I've already built contains all the **intelligence**: categorization rules, calendar prefix convention, VIP logic, voice/tone templates, scheduling decision tree, and the graduation system for autonomy levels.

When building this bot, the skill's SKILL.md becomes the `config/system-prompt.md` that gets sent to Claude with every email. The references/ files become the tool definitions and config files. You're not rebuilding the brain — just giving it a body that can listen, act, and talk to Slack.
