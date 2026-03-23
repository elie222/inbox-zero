# Daily Executive Briefing Endpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cron-triggered API endpoint that gathers Calendar, Gmail, and weather data, synthesizes a daily briefing via Claude, and posts it to Slack.

**Architecture:** Pre-gather all data in parallel via `Promise.allSettled`, pass to Claude for synthesis (no tool-use), format as Slack blocks, post to #chief-of-staff. Stateless — no DB writes.

**Tech Stack:** Next.js API route, Google Calendar/Gmail APIs (existing OAuth), Open-Meteo weather API, Vercel AI SDK (`generateText`), Slack Block Kit (`@slack/web-api`)

**Spec:** `docs/superpowers/specs/2026-03-22-daily-briefing-endpoint-design.md`

---

## File Structure

```
apps/web/
├── app/api/chief-of-staff/briefing/
│   └── route.ts                          # GET endpoint with cron auth
├── utils/chief-of-staff/briefing/
│   ├── types.ts                          # BriefingData interface and sub-types
│   ├── gather.ts                         # Parallel data fetching (calendar, gmail, weather)
│   ├── engine.ts                         # Claude synthesis call
│   └── format-slack.ts                   # Markdown → Slack Block Kit blocks
├── config/
│   └── briefing-system-prompt.md         # System prompt for briefing generation
```

Existing files reused (not modified):
- `utils/cron.ts` — `hasCronSecret()`
- `utils/middleware.ts` — `withError()`
- `utils/gmail/client.ts` — `getGmailClientWithRefresh()`
- `utils/calendar/client.ts` — `getCalendarClientWithRefresh()`
- `utils/chief-of-staff/slack/poster.ts` — `postToChiefOfStaff()`
- `utils/chief-of-staff/types.ts` — `CALENDAR_IDS`, `TIMEZONE`

---

### Task 1: Types

**Files:**
- Create: `apps/web/utils/chief-of-staff/briefing/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
export interface CalendarEvent {
  calendarName: string;
  end: string;
  start: string;
  summary: string;
}

export interface GmailThread {
  date: string;
  from: string;
  query: string;
  snippet: string;
  subject: string;
}

export interface WeatherData {
  currentTemp: number;
  highTemp: number;
  lowTemp: number;
  description: string;
  precipitation: number;
}

export interface GatheredData {
  calendar: { status: "ok"; events: CalendarEvent[] } | { status: "failed"; error: string };
  gmail: { status: "ok"; threads: GmailThread[] } | { status: "failed"; error: string };
  weather: { status: "ok"; data: WeatherData } | { status: "failed"; error: string };
  generatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/utils/chief-of-staff/briefing/types.ts
git commit -m "feat(briefing): add types for gathered briefing data"
```

---

### Task 2: Data Gathering

**Files:**
- Create: `apps/web/utils/chief-of-staff/briefing/gather.ts`
- Reference: `apps/web/utils/chief-of-staff/types.ts` (CALENDAR_IDS, TIMEZONE)
- Reference: `apps/web/utils/gmail/client.ts` (getGmailClientWithRefresh)
- Reference: `apps/web/utils/calendar/client.ts` (getCalendarClientWithRefresh)
- Reference: `apps/web/app/api/chief-of-staff/webhook/process.ts:40-170` (credential loading pattern)

- [ ] **Step 1: Create gather.ts with credential loading and parallel fetch**

```typescript
import type { gmail_v1 } from "@googleapis/gmail";
import type { calendar_v3 } from "@googleapis/calendar";
import prisma from "@/utils/prisma";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getCalendarClientWithRefresh } from "@/utils/calendar/client";
import { CALENDAR_IDS, TIMEZONE } from "@/utils/chief-of-staff/types";
import { createScopedLogger } from "@/utils/logger";
import type {
  CalendarEvent,
  GatheredData,
  GmailThread,
  WeatherData,
} from "./types";

const logger = createScopedLogger("briefing:gather");

const EMAIL_ACCOUNT_ID = "cmn26fvbx000201o44j5l4wr1";

const CALENDAR_NAMES: Record<string, string> = {
  [CALENDAR_IDS.personal]: "Personal",
  [CALENDAR_IDS.smartCollege]: "Smart College",
  [CALENDAR_IDS.rmsWork]: "RMS Work",
  [CALENDAR_IDS.praxis]: "Praxis",
  [CALENDAR_IDS.nutrition]: "Nutrition",
  [CALENDAR_IDS.workout]: "Workout",
};

const GMAIL_QUERIES = [
  { label: "Smart College (24h)", query: "label:Smart-College newer_than:1d" },
  {
    label: "Unread direct (24h)",
    query: "is:unread newer_than:1d -category:promotions -category:social",
  },
  { label: "Overdue to-respond", query: "label:to-respond older_than:12h" },
  {
    label: "Overdue Smart College",
    query: "label:Smart-College older_than:12h -label:to-respond is:unread",
  },
];

const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=44.98&longitude=-93.27&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&current=temperature_2m,weather_code&timezone=America/Chicago&temperature_unit=fahrenheit&forecast_days=1";

// WMO weather code descriptions (subset)
const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

interface Clients {
  gmail: gmail_v1.Gmail;
  calendar: calendar_v3.Calendar;
  slack: { accessToken: string; channelId: string };
}

export async function loadClients(): Promise<Clients> {
  const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
    where: { id: EMAIL_ACCOUNT_ID },
    include: {
      account: {
        select: { access_token: true, refresh_token: true, expires_at: true },
      },
      calendarConnections: {
        where: { provider: "google", isConnected: true },
        take: 1,
      },
      messagingChannels: {
        where: { provider: "SLACK", isConnected: true },
        take: 1,
      },
    },
  });

  if (!emailAccount.account?.refresh_token) {
    throw new Error("Missing Gmail OAuth refresh token");
  }

  const gmail = await getGmailClientWithRefresh({
    accessToken: emailAccount.account.access_token,
    refreshToken: emailAccount.account.refresh_token,
    expiresAt: emailAccount.account.expires_at?.getTime() ?? null,
    emailAccountId: EMAIL_ACCOUNT_ID,
    logger,
  });

  const calConn = emailAccount.calendarConnections[0];
  if (!calConn?.refreshToken) {
    throw new Error("Missing Calendar OAuth refresh token");
  }

  const calendarClient = await getCalendarClientWithRefresh({
    accessToken: calConn.accessToken,
    refreshToken: calConn.refreshToken,
    expiresAt: calConn.expiresAt?.getTime() ?? null,
    emailAccountId: EMAIL_ACCOUNT_ID,
    logger,
  });

  const slackChannel = emailAccount.messagingChannels[0];
  if (!slackChannel?.accessToken) {
    throw new Error("No connected Slack channel found");
  }

  const channelId = process.env.CHIEF_OF_STAFF_SLACK_CHANNEL_ID;
  if (!channelId) {
    throw new Error("CHIEF_OF_STAFF_SLACK_CHANNEL_ID not set");
  }

  return {
    gmail,
    calendar: calendarClient,
    slack: { accessToken: slackChannel.accessToken, channelId },
  };
}

export async function gatherBriefingData(clients: {
  gmail: gmail_v1.Gmail;
  calendar: calendar_v3.Calendar;
}): Promise<GatheredData> {
  const now = new Date();
  const generatedAt = now.toLocaleString("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const [calendarResult, gmailResult, weatherResult] =
    await Promise.allSettled([
      gatherCalendar(clients.calendar),
      gatherGmail(clients.gmail),
      gatherWeather(),
    ]);

  return {
    calendar:
      calendarResult.status === "fulfilled"
        ? { status: "ok", events: calendarResult.value }
        : { status: "failed", error: String(calendarResult.reason) },
    gmail:
      gmailResult.status === "fulfilled"
        ? { status: "ok", threads: gmailResult.value }
        : { status: "failed", error: String(gmailResult.reason) },
    weather:
      weatherResult.status === "fulfilled"
        ? { status: "ok", data: weatherResult.value }
        : { status: "failed", error: String(weatherResult.reason) },
    generatedAt,
  };
}

async function gatherCalendar(
  calendarClient: calendar_v3.Calendar,
): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(
    now.toLocaleDateString("en-US", { timeZone: TIMEZONE }),
  );
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const calendarIds = Object.entries(CALENDAR_IDS);
  const results = await Promise.allSettled(
    calendarIds.map(([, calId]) =>
      calendarClient.events.list({
        calendarId: calId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        timeZone: TIMEZONE,
      }),
    ),
  );

  const events: CalendarEvent[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled") {
      logger.warn("Calendar fetch failed", {
        calendarId: calendarIds[i][1],
        error: String(result.reason),
      });
      continue;
    }

    const calId = calendarIds[i][1];
    const calName = CALENDAR_NAMES[calId] ?? "Unknown";
    for (const event of result.value.data.items ?? []) {
      if (!event.summary) continue;
      events.push({
        summary: event.summary,
        calendarName: calName,
        start: event.start?.dateTime ?? event.start?.date ?? "",
        end: event.end?.dateTime ?? event.end?.date ?? "",
      });
    }
  }

  // Sort by start time
  events.sort((a, b) => a.start.localeCompare(b.start));
  return events;
}

async function gatherGmail(gmail: gmail_v1.Gmail): Promise<GmailThread[]> {
  const threads: GmailThread[] = [];

  const queryResults = await Promise.allSettled(
    GMAIL_QUERIES.map(async ({ label, query }) => {
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 10,
      });

      const messageIds = (listRes.data.messages ?? [])
        .map((m) => m.id)
        .filter(Boolean) as string[];

      const messages = await Promise.allSettled(
        messageIds.map((id) =>
          gmail.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
          }),
        ),
      );

      for (const msg of messages) {
        if (msg.status !== "fulfilled") continue;
        const headers = msg.value.data.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
            ?.value ?? "";

        threads.push({
          query: label,
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: msg.value.data.snippet ?? "",
        });
      }
    }),
  );

  for (const result of queryResults) {
    if (result.status === "rejected") {
      logger.warn("Gmail query failed", { error: String(result.reason) });
    }
  }

  return threads;
}

async function gatherWeather(): Promise<WeatherData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(OPEN_METEO_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

    const data = await res.json();
    return {
      currentTemp: Math.round(data.current.temperature_2m),
      highTemp: Math.round(data.daily.temperature_2m_max[0]),
      lowTemp: Math.round(data.daily.temperature_2m_min[0]),
      description:
        WEATHER_CODES[data.current.weather_code as number] ?? "Unknown",
      precipitation: data.daily.precipitation_sum[0],
    };
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/utils/chief-of-staff/briefing/gather.ts
git commit -m "feat(briefing): add parallel data gathering for calendar, gmail, weather"
```

---

### Task 3: Briefing System Prompt

**Files:**
- Create: `apps/web/config/briefing-system-prompt.md`

- [ ] **Step 1: Create the system prompt file**

```markdown
You are Nick Leeke's Chief of Staff AI. Your job is to synthesize raw data from his calendars, email, and weather into a concise, opinionated daily briefing.

Nick runs three ventures simultaneously:
- **Smart College** — ACT/SAT tutoring business (his primary revenue source)
- **Praxis Education** — EdTech SaaS platform for special education
- **RMS** — Special education teaching position at Robbinsdale Middle School

## Output Format

Structure your briefing EXACTLY as follows using markdown. Every section is required (use the unavailable note if data is missing).

### 1. Top Priority
One sentence: the single most important thing Nick should focus on today and why.

### 2. Weather
One line: current temp, high/low, conditions. Example: "Currently 42°F, high 55°F / low 38°F. Partly cloudy, no precipitation expected."

### 3. Today's Schedule
A chronological timeline of all events across all calendars. Format each as:
- **HH:MM AM/PM** — Event Name _(Calendar)_

Group by morning/afternoon/evening if there are 5+ events. Flag any conflicts (overlapping times) with ⚠️.

### 4. Email Digest
Organize by venture, then by urgency:

**Smart College**
- Emails needing response (from "to-respond" and "overdue" queries)
- New activity (from "newer_than:1d" query)

**Praxis / Personal / Other**
- Emails needing response
- New unread highlights (skip routine notifications)

For each notable email: `From: Subject — one-line summary of what it needs`

### 5. Action Items
Numbered list of concrete next actions derived from the schedule and emails. Be specific ("Reply to Jane Doe about Thursday reschedule") not vague ("Check email").

## Rules
- Be direct and opinionated. Say "You should..." not "You might consider..."
- If data is unavailable for a section, write: "⚠️ [Data source] unavailable — check manually."
- All times in Central Time (America/Chicago)
- Keep the entire briefing under 800 words
- Do not invent information — only synthesize what is provided
- Flag anything time-sensitive or requiring same-day action with 🔴
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/config/briefing-system-prompt.md
git commit -m "feat(briefing): add system prompt for daily briefing generation"
```

---

### Task 4: Claude Engine

**Files:**
- Create: `apps/web/utils/chief-of-staff/briefing/engine.ts`
- Reference: `apps/web/utils/chief-of-staff/engine.ts` (existing pattern)
- Reference: `apps/web/utils/chief-of-staff/system-prompt.ts` (file loading pattern)

- [ ] **Step 1: Create the briefing engine**

```typescript
import fs from "node:fs";
import path from "node:path";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { TIMEZONE } from "@/utils/chief-of-staff/types";
import { createScopedLogger } from "@/utils/logger";
import type { GatheredData } from "./types";

const logger = createScopedLogger("briefing:engine");

let systemPromptCache: string | null = null;

function getSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = path.join(
    process.cwd(),
    "config",
    "briefing-system-prompt.md",
  );
  systemPromptCache = fs.readFileSync(promptPath, "utf-8");
  return systemPromptCache;
}

function formatGatheredDataForPrompt(data: GatheredData): string {
  const sections: string[] = [];

  sections.push(`# Daily Briefing Data — ${data.generatedAt}`);
  sections.push("");

  // Calendar
  sections.push("## Calendar Events (Today)");
  if (data.calendar.status === "ok") {
    if (data.calendar.events.length === 0) {
      sections.push("No events scheduled today.");
    } else {
      for (const event of data.calendar.events) {
        const startTime = event.start.includes("T")
          ? new Date(event.start).toLocaleTimeString("en-US", {
              timeZone: TIMEZONE,
              hour: "numeric",
              minute: "2-digit",
            })
          : "All day";
        sections.push(
          `- ${startTime} — ${event.summary} (${event.calendarName})`,
        );
      }
    }
  } else {
    sections.push(`⚠️ Calendar data unavailable: ${data.calendar.error}`);
  }
  sections.push("");

  // Gmail
  sections.push("## Email Summary");
  if (data.gmail.status === "ok") {
    if (data.gmail.threads.length === 0) {
      sections.push("No notable emails.");
    } else {
      // Group by query label
      const byQuery = new Map<string, typeof data.gmail.threads>();
      for (const thread of data.gmail.threads) {
        const existing = byQuery.get(thread.query) ?? [];
        existing.push(thread);
        byQuery.set(thread.query, existing);
      }

      for (const [queryLabel, threads] of byQuery) {
        sections.push(`### ${queryLabel} (${threads.length} messages)`);
        for (const t of threads) {
          sections.push(`- **From:** ${t.from}`);
          sections.push(`  **Subject:** ${t.subject}`);
          sections.push(`  ${t.snippet}`);
        }
        sections.push("");
      }
    }
  } else {
    sections.push(`⚠️ Email data unavailable: ${data.gmail.error}`);
  }
  sections.push("");

  // Weather
  sections.push("## Weather (Minneapolis)");
  if (data.weather.status === "ok") {
    const w = data.weather.data;
    sections.push(
      `Current: ${w.currentTemp}°F — ${w.description}`,
    );
    sections.push(`High: ${w.highTemp}°F / Low: ${w.lowTemp}°F`);
    if (w.precipitation > 0) {
      sections.push(`Precipitation: ${w.precipitation} mm`);
    }
  } else {
    sections.push(`⚠️ Weather data unavailable: ${data.weather.error}`);
  }

  return sections.join("\n");
}

export async function generateBriefing(data: GatheredData): Promise<string> {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const model = anthropic("claude-sonnet-4-5-20250929");

  const systemPrompt = getSystemPrompt();
  const userMessage = formatGatheredDataForPrompt(data);

  logger.info("Generating briefing", {
    calendarStatus: data.calendar.status,
    gmailStatus: data.gmail.status,
    weatherStatus: data.weather.status,
  });

  const { text } = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  return text;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/utils/chief-of-staff/briefing/engine.ts
git commit -m "feat(briefing): add Claude synthesis engine for daily briefing"
```

---

### Task 5: Slack Formatting

**Files:**
- Create: `apps/web/utils/chief-of-staff/briefing/format-slack.ts`
- Reference: `apps/web/utils/chief-of-staff/slack/blocks.ts` (block patterns)

- [ ] **Step 1: Create format-slack.ts**

```typescript
import type { KnownBlock } from "@slack/types";

/**
 * Converts Claude's markdown briefing into Slack Block Kit blocks.
 * Splits on markdown headings (### ) to create header + section pairs.
 */
export function formatBriefingForSlack(
  markdown: string,
  generatedAt: string,
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  // Title header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "Daily Executive Briefing",
      emoji: true,
    },
  });

  blocks.push({ type: "divider" });

  // Split markdown into sections by ### headings
  const sections = markdown.split(/^### /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split("\n");
    const title = lines[0]?.trim();
    const body = lines
      .slice(1)
      .join("\n")
      .trim();

    if (title) {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: title,
          emoji: true,
        },
      });
    }

    if (body) {
      // Slack section blocks have a 3000 char limit for mrkdwn text
      const chunks = splitTextForSlack(body, 3000);
      for (const chunk of chunks) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: chunk },
        });
      }
    }

    blocks.push({ type: "divider" });
  }

  // Footer with generation time
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Generated at ${generatedAt} CT`,
      },
    ],
  });

  return blocks;
}

function splitTextForSlack(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    // Split at last newline before maxLen
    const cutoff = remaining.lastIndexOf("\n", maxLen);
    const splitAt = cutoff > 0 ? cutoff : maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/utils/chief-of-staff/briefing/format-slack.ts
git commit -m "feat(briefing): add Slack Block Kit formatter for briefing output"
```

---

### Task 6: Route Handler

**Files:**
- Create: `apps/web/app/api/chief-of-staff/briefing/route.ts`
- Reference: `apps/web/app/api/watch/all/route.ts` (cron endpoint pattern)

- [ ] **Step 1: Create the route handler**

```typescript
import { withError } from "@/utils/middleware";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { loadClients, gatherBriefingData } from "@/utils/chief-of-staff/briefing/gather";
import { generateBriefing } from "@/utils/chief-of-staff/briefing/engine";
import { formatBriefingForSlack } from "@/utils/chief-of-staff/briefing/format-slack";
import { postToChiefOfStaff } from "@/utils/chief-of-staff/slack/poster";

export const maxDuration = 300;

const logger = createScopedLogger("briefing:route");

export const GET = withError("chief-of-staff-briefing", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized cron request: api/chief-of-staff/briefing"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  logger.info("Starting daily briefing generation");

  // 1. Load OAuth clients and Slack credentials
  const clients = await loadClients();

  // 2. Gather data in parallel
  const gatheredData = await gatherBriefingData({
    gmail: clients.gmail,
    calendar: clients.calendar,
  });

  // 3. Generate briefing via Claude
  let briefingMarkdown: string;
  try {
    briefingMarkdown = await generateBriefing(gatheredData);
  } catch (error) {
    logger.error("Claude briefing generation failed", { error });
    // Post error to Slack so Nick knows
    await postToChiefOfStaff({
      accessToken: clients.slack.accessToken,
      channelId: clients.slack.channelId,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⚠️ *Daily briefing generation failed*\n\`${String(error)}\`\nCheck logs for details.`,
          },
        },
      ],
      text: "Daily briefing generation failed",
    });
    return Response.json({ ok: false, error: "Claude generation failed" }, { status: 500 });
  }

  // 4. Format for Slack and post
  const blocks = formatBriefingForSlack(
    briefingMarkdown,
    gatheredData.generatedAt,
  );

  await postToChiefOfStaff({
    accessToken: clients.slack.accessToken,
    channelId: clients.slack.channelId,
    blocks,
    text: briefingMarkdown, // Fallback for notifications
  });

  logger.info("Daily briefing posted to Slack");

  return Response.json({ ok: true });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/api/chief-of-staff/briefing/route.ts
git commit -m "feat(briefing): add cron-triggered daily briefing endpoint"
```

---

### Task 7: Build Verification

- [ ] **Step 1: Run type-check build**

```bash
cd apps/web && pnpm exec next build
```

Expected: Build succeeds with no type errors in the new briefing files.

- [ ] **Step 2: Fix any type errors found during build**

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix(briefing): resolve build errors"
```

---

### Task 8: Manual Test via curl

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Trigger the briefing endpoint**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/chief-of-staff/briefing
```

Expected: `{"ok":true}` and a briefing message appears in #chief-of-staff Slack channel.

- [ ] **Step 3: Verify Slack message has all sections**

Check that the Slack message contains:
- "Daily Executive Briefing" header
- Top Priority section
- Weather section
- Today's Schedule section
- Email Digest section
- Action Items section
- Generation timestamp footer
