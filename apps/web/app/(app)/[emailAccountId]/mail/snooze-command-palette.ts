import { format } from "date-fns";
import * as chrono from "chrono-node";
import type { Command } from "@/lib/commands/types";

export function buildSnoozeCommandPalette({
  now = new Date(),
  onSnooze,
  query,
}: {
  now?: Date;
  onSnooze: (until: Date) => void;
  query: string;
}): Command[] {
  const naturalLanguageDate = parseSnoozeDate(query, now);
  if (query.trim()) {
    if (!naturalLanguageDate) return [];

    return [
      {
        id: "mail-snooze-natural-language",
        label: `Snooze until ${formatSnoozeTime(naturalLanguageDate)}`,
        section: "actions",
        priority: 0,
        keywords: [query],
        action: () => onSnooze(naturalLanguageDate),
      },
    ];
  }

  return getSnoozePresets(now).map((preset, index) => ({
    id: `mail-snooze-${preset.id}`,
    label: preset.label,
    description: formatSnoozeTime(preset.until),
    section: "actions",
    priority: index,
    keywords: ["snooze", "later", "remind", preset.id, preset.label],
    action: () => onSnooze(preset.until),
  }));
}

export function parseSnoozeDate(input: string, now = new Date()) {
  const result = chrono.casual.parse(input.trim(), now, {
    forwardDate: true,
  })[0];
  if (!result) return null;

  const date = result.start.date();
  if (!result.start.isCertain("hour")) date.setHours(9, 0, 0, 0);
  if (date <= now) return null;

  return date;
}

const MORNING_HOUR = 9;
const SUNDAY = 0;
const FRIDAY = 5;
const SATURDAY = 6;

export function getSnoozePresets(now: Date) {
  const candidates = [
    {
      id: "tomorrow",
      label: "Tomorrow",
      until: atHour(now, 1, MORNING_HOUR),
    },
    {
      id: "end-of-week",
      label: "End of week",
      until: laterThisWeek(now, FRIDAY),
    },
    {
      id: "this-weekend",
      label: "This weekend",
      until: now.getDay() === SUNDAY ? null : laterThisWeek(now, SATURDAY),
    },
    {
      id: "next-week",
      label: "Next week",
      until: atHour(now, daysUntilNextMonday(now), MORNING_HOUR),
    },
  ];

  const seen = new Set<number>();
  return candidates.flatMap(({ until, ...preset }) => {
    if (!until) return [];
    const key = until.getTime();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...preset, until }];
  });
}

function formatSnoozeTime(date: Date) {
  return format(date, "EEE, MMM d 'at' p");
}

function atHour(now: Date, daysFromNow: number, hour: number) {
  const date = new Date(now);
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function laterThisWeek(now: Date, weekday: number) {
  const daysAhead = weekday - now.getDay();
  return daysAhead > 0 ? atHour(now, daysAhead, MORNING_HOUR) : null;
}

function daysUntilNextMonday(now: Date) {
  return (8 - now.getDay()) % 7 || 7;
}
