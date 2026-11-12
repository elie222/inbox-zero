import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import * as chrono from "chrono-node";
import type { Command } from "@/lib/commands/types";
import { formatDayAtTime } from "@/utils/date";

export function buildSnoozeCommandPalette({
  now = new Date(),
  onSnooze,
  query,
  i18n,
}: {
  i18n: I18n;
  now?: Date;
  onSnooze: (until: Date) => void;
  query: string;
}): Command[] {
  const normalizedQuery = query.trim().toLowerCase();
  const presets = getSnoozePresets(now, i18n, normalizedQuery);
  const naturalLanguageDate = presets.length
    ? null
    : parseSnoozeDate(query, now, i18n.locale);
  if (naturalLanguageDate) {
    return [
      {
        id: "mail-snooze-natural-language",
        label: t(
          i18n,
        )`Snooze until ${formatDayAtTime(naturalLanguageDate, i18n)}`,
        section: "actions",
        priority: 0,
        keywords: [query],
        action: () => onSnooze(naturalLanguageDate),
      },
    ];
  }

  return presets.map((preset, index) => ({
    id: `mail-snooze-${preset.id}`,
    label: preset.label,
    description: formatDayAtTime(preset.until, i18n),
    section: "actions",
    priority: index,
    keywords: ["snooze", "later", "remind", preset.id, preset.label],
    action: () => onSnooze(preset.until),
  }));
}

export function parseSnoozeDate(
  input: string,
  now = new Date(),
  locale = "en",
) {
  // English stays as a fallback: people often type dates in English anyway.
  const parsers = [LOCALE_DATE_PARSERS[locale], chrono.casual].filter(
    (parser) => parser !== undefined,
  );
  // Keep the parse that understood the most of the input, so a locale parser
  // that only recognises "3pm" in "next Friday at 3pm" can't win. Ties go to
  // the app language.
  let result: chrono.ParsedResult | undefined;
  for (const parser of parsers) {
    const parsed = parser.parse(input.trim(), now, { forwardDate: true })[0];
    if (parsed && (!result || parsed.text.length > result.text.length)) {
      result = parsed;
    }
  }
  if (!result) return null;

  const date = result.start.date();
  if (!result.start.isCertain("hour")) date.setHours(9, 0, 0, 0);
  if (date <= now) return null;

  return date;
}

const LOCALE_DATE_PARSERS: Partial<Record<string, chrono.Chrono>> = {
  es: chrono.es.casual,
  fr: chrono.fr.casual,
  de: chrono.de.casual,
  "pt-BR": chrono.pt.casual,
  it: chrono.it.casual,
  nl: chrono.nl.casual,
};

const MORNING_HOUR = 9;
const SUNDAY = 0;
const FRIDAY = 5;
const SATURDAY = 6;

export function getSnoozePresets(now: Date, i18n: I18n, query = "") {
  const candidates = [
    {
      id: "in-1-hour",
      label: t(i18n)`In 1 hour`,
      until: new Date(now.getTime() + 60 * 60 * 1000),
    },
    {
      id: "in-3-hours",
      label: t(i18n)`In 3 hours`,
      until: new Date(now.getTime() + 3 * 60 * 60 * 1000),
    },
    {
      id: "tomorrow",
      label: t(i18n)`Tomorrow`,
      until: atHour(now, 1, MORNING_HOUR),
    },
    {
      id: "end-of-week",
      label: t(i18n)`End of week`,
      until: laterThisWeek(now, FRIDAY),
    },
    {
      id: "this-weekend",
      label: t(i18n)`This weekend`,
      until: now.getDay() === SUNDAY ? null : laterThisWeek(now, SATURDAY),
    },
    {
      id: "next-week",
      label: t(i18n)`Next week`,
      until: atHour(now, daysUntilNextMonday(now), MORNING_HOUR),
    },
  ];

  const seen = new Set<number>();
  return candidates.flatMap(({ until, ...preset }) => {
    if (!until || !preset.label.toLowerCase().includes(query)) return [];
    const key = until.getTime();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...preset, until }];
  });
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
