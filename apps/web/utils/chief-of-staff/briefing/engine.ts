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
    sections.push(`Current: ${w.currentTemp}°F — ${w.description}`);
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
