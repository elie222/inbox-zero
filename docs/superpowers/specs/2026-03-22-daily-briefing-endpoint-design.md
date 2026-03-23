# Daily Executive Briefing Endpoint — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Scope:** v1 MVP — Calendar + Gmail + Weather + Claude + Slack

---

## Problem

Nick runs three ventures (Smart College, Praxis, RMS) and needs a synthesized daily briefing in Slack at 6am CT. Currently this only works as an interactive Cowork skill requiring his Mac to be awake. This endpoint runs server-side on Railway so it fires reliably.

## Solution

A new cron-triggered GET endpoint `/api/chief-of-staff/briefing` that:

1. Authenticates via `CRON_SECRET` (existing Bearer pattern)
2. Gathers data from Google Calendar, Gmail, and Open-Meteo weather in parallel
3. Sends gathered data to Claude with a briefing-specific system prompt
4. Posts the formatted briefing to #chief-of-staff via Slack
5. Triggered manually via curl in v1; cron-job.org scheduling in v2

## Architecture

### New Files

```
apps/web/
├── app/api/chief-of-staff/briefing/
│   └── route.ts                          # GET endpoint, Bearer auth
├── utils/chief-of-staff/briefing/
│   ├── gather.ts                         # Parallel data fetching
│   ├── engine.ts                         # Claude synthesis call
│   ├── format-slack.ts                   # Markdown → Slack blocks
│   └── types.ts                          # BriefingData, BriefingSection interfaces
├── config/
│   └── briefing-system-prompt.md         # Briefing generation system prompt
```

### No Schema Changes

Stateless — no DB writes. Gather, synthesize, post, return 200. Reuses existing `postToChiefOfStaff()` from `utils/chief-of-staff/slack/poster.ts`.

## Data Flow

```
cron-job.org (6am CT)
  → GET /api/chief-of-staff/briefing  (Authorization: Bearer CRON_SECRET)
    → gather.ts: Promise.allSettled([calendar, gmail, weather])
    → engine.ts: generateText() with briefing system prompt + gathered data
    → format-slack.ts: convert Claude's markdown output to Slack blocks
    → poster.ts: postToChiefOfStaff() to #chief-of-staff
  ← 200 { ok: true }
```

## Implementation Details

### Route Handler

Follow the existing cron pattern from `watch/all/route.ts`:

- `withError` wrapper (public, no user auth — cron endpoint)
- `hasCronSecret(request)` for Bearer token validation
- `maxDuration: 300` (Vercel convention — on Railway this is a no-op; cron-job.org timeout should be set to 5+ min)
- Single function call: `generateAndPostBriefing()`

### Data Gathering (`gather.ts`)

All data fetched in parallel via `Promise.allSettled`. Each source returns its data or a failure marker — partial results never block the briefing.

**Prerequisites — load credentials once before parallel fetch:**
1. Load EmailAccount (`cmn26fvbx000201o44j5l4wr1`) with relations: `account` (OAuth tokens), `calendarConnections`, `messagingChannels`
2. Get Gmail client via `getGmailClientWithRefresh()` using `account` OAuth tokens (refresh token flow)
3. Get Calendar client via `getCalendarClientWithRefresh()` using `calendarConnections` tokens (separate from Gmail OAuth — different token set with calendar scope)
4. Get Slack credentials from `messagingChannel` where `provider: "SLACK"` and `isConnected: true` — same pattern as `getSlackChannel()` in `cron/route.ts` lines 14-30

**Google Calendar:**
- Single Calendar client queries all 6 calendars via `calendarClient.events.list({ calendarId: '<id>' })` — one client, different `calendarId` params per query
- Query today's events (timeMin/timeMax in RFC3339, `timeZone: "America/Chicago"`):
  - Personal: `leekenick@gmail.com`
  - Smart College: `cde6ed85e994...`
  - RMS Work: `nicholas.leeke@rpsmn.org`
  - Praxis: `4ef466c3edc2...`
  - Workout: `2b8c2dda0d66...`
  - Nutrition: `20f52ebce7cb...`

**Gmail:**
- Run 4 search queries with `maxResults: 10` and `format: 'metadata'` (metadataHeaders: From, Subject, Date) plus snippet — avoids fetching full message bodies
  - `label:Smart-College newer_than:1d`
  - `is:unread newer_than:1d -category:promotions -category:social`
  - `label:to-respond older_than:12h`
  - `label:Smart-College older_than:12h -label:to-respond is:unread`

**Weather:**
- Open-Meteo API (free, no key required), 5-second fetch timeout
- `GET https://api.open-meteo.com/v1/forecast?latitude=44.98&longitude=-93.27&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&current=temperature_2m,weathercode&timezone=America/Chicago&forecast_days=1`
- Minneapolis coordinates (44.98, -93.27)

### Claude Engine (`engine.ts`)

- Model: `claude-sonnet-4-5-20250929` via `@ai-sdk/anthropic` (same as existing COS engine)
- `generateText()` — no tools, just synthesis of pre-gathered data
- System prompt loaded from `config/briefing-system-prompt.md` via `fs.readFileSync` (matches existing COS engine pattern in `system-prompt.ts`)
- Prompt instructs Claude to:
  - Produce a decision-ready morning briefing
  - Organize by venture (Smart College, Praxis, RMS, Personal)
  - Lead with the #1 priority for the day
  - Include today's schedule as a timeline
  - Flag conflicts and time-sensitive items
  - Call out emails needing response
  - Include weather summary
  - Tone: direct, opinionated chief of staff — not a passive assistant

### Slack Formatting (`format-slack.ts`)

Convert Claude's markdown output to Slack Block Kit:
- `header` blocks for section titles
- `section` blocks with mrkdwn for content
- `divider` blocks between sections
- `context` blocks for metadata (generation time, data source status)
- Post via existing `postToChiefOfStaff()` from `slack/poster.ts`

### Error Handling

Principle: a partial briefing with clear gaps is better than no briefing.

| Failure | Behavior |
|---------|----------|
| Calendar API fails | "⚠️ Calendar data unavailable" in schedule section |
| Gmail API fails | "⚠️ Email data unavailable — check Gmail manually" |
| Weather fetch fails | Omit weather line |
| Claude API fails | Post error message to Slack: "Briefing generation failed — [error]" |
| Slack post fails | Log error, return 500 |

## Environment Variables

No new env vars needed. All credentials already exist:
- `CRON_SECRET` — cron auth
- `ANTHROPIC_API_KEY` — Claude API
- Gmail/Calendar OAuth — stored in EmailAccount table
- Slack access token — stored in MessagingChannel table
- `CHIEF_OF_STAFF_SLACK_CHANNEL_ID` — `C0AMZ2Z1LJZ`

## Out of Scope (v2)

- Asana task integration
- Claude/Anthropic news via web search
- Tutoring revenue calculation
- Cross-venture conflict detection
- Full Block Kit polish
- cron-job.org scheduled trigger setup

## Testing

1. Manual trigger via `curl` with CRON_SECRET
2. Unit test `gather.ts` — mock API responses, verify parallel fetch + graceful degradation
3. Unit test `format-slack.ts` — verify Block Kit output structure
4. Failure mode tests — each API individually failing produces partial briefing
