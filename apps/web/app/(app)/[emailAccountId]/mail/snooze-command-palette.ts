import { format } from "date-fns";
import { Clock3Icon } from "lucide-react";
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
        icon: Clock3Icon,
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
    icon: Clock3Icon,
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
const AFTERNOON_HOUR = 17;
const EVENING_HOUR = 20;

export function getSnoozePresets(now: Date) {
  const weekend = weekendMorning(now);
  const candidates = [
    {
      id: "this-afternoon",
      label: "This afternoon",
      until: atHour(now, 0, AFTERNOON_HOUR),
    },
    {
      id: "this-evening",
      label: "This evening",
      until: atHour(now, 0, EVENING_HOUR),
    },
    {
      id: "tomorrow-morning",
      label: "Tomorrow morning",
      until: atHour(now, 1, MORNING_HOUR),
    },
    ...(weekend
      ? [{ id: "this-weekend", label: "This weekend", until: weekend }]
      : []),
    {
      id: "next-monday",
      label: "Next Monday",
      until: atHour(now, daysUntilNextMonday(now), MORNING_HOUR),
    },
    {
      id: "next-week",
      label: "Next week",
      until: atHour(now, 7, MORNING_HOUR),
    },
  ];

  const seen = new Set<number>();
  return candidates.filter((preset) => {
    if (preset.until <= now) return false;
    const key = preset.until.getTime();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
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

function weekendMorning(now: Date) {
  const day = now.getDay();
  if (day === 0 || day === 6) return null;
  return atHour(now, 6 - day, MORNING_HOUR);
}

function daysUntilNextMonday(now: Date) {
  return (8 - now.getDay()) % 7 || 7;
}
