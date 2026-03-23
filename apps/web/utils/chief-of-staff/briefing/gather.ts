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

// WMO weather code descriptions
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

export async function loadClients() {
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

  const [calendarResult, gmailResult, weatherResult] = await Promise.allSettled(
    [
      gatherCalendar(clients.calendar),
      gatherGmail(clients.gmail),
      gatherWeather(),
    ],
  );

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
