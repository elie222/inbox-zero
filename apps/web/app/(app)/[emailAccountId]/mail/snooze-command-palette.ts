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
        label: `Snooze until ${format(naturalLanguageDate, "EEE, MMM d 'at' p")}`,
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
    icon: Clock3Icon,
    section: "actions",
    priority: index,
    keywords: ["snooze", "later", "remind", preset.id],
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

export function getSnoozePresets(now: Date) {
  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(9, 0, 0, 0);

  const nextWeek = new Date(now);
  const daysUntilMonday = (8 - nextWeek.getDay()) % 7 || 7;
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(9, 0, 0, 0);

  return [
    {
      id: "three-hours",
      label: "In 3 hours",
      until: new Date(now.getTime() + 3 * 60 * 60 * 1000),
    },
    {
      id: "tomorrow",
      label: "Tomorrow morning",
      until: tomorrowMorning,
    },
    { id: "next-week", label: "Next week", until: nextWeek },
  ];
}
