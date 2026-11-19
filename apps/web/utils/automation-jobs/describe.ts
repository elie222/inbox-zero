import cronstrue from "cronstrue";

export function describeCronSchedule(cronExpression: string): string {
  const schedule = parseCronSchedule(cronExpression, "en-US");
  if (!schedule) return describeCronExpression(cronExpression);

  const weekdayText =
    schedule.weekdays.kind === "custom"
      ? schedule.weekdays.text
      : ENGLISH_WEEKDAYS[schedule.weekdays.kind];
  const { localTimes } = schedule;
  const timeList =
    localTimes.length === 1
      ? localTimes[0]
      : `${localTimes.slice(0, -1).join(", ")} and ${localTimes[localTimes.length - 1]}`;

  return `${weekdayText} at ${timeList} ${schedule.timeZoneName}`;
}

/**
 * Splits a daily-or-weekly cron into the parts a schedule sentence needs, with
 * times shown in the viewer's time zone. Returns null for anything else.
 */
export function parseCronSchedule(
  cronExpression: string,
  locale: string,
): {
  weekdays: CronWeekdays;
  localTimes: string[];
  timeZoneName: string;
} | null {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const [minField, hourField, domField, monthField, dowField] = parts;

    if (domField !== "*" || monthField !== "*") return null;

    const minute = minField === "*" ? 0 : Number.parseInt(minField, 10);
    const utcHours =
      hourField === "*"
        ? null
        : hourField.split(",").map((h) => Number.parseInt(h.trim(), 10));

    if (!utcHours || Number.isNaN(minute)) return null;

    const timeFormatter = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });

    const now = new Date();
    const localTimes = utcHours.map((h) => {
      const utcDate = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          h,
          minute,
        ),
      );
      return timeFormatter.format(utcDate);
    });

    return {
      weekdays: parseWeekdays(dowField),
      localTimes,
      timeZoneName: getTimezoneAbbr(tz, locale),
    };
  } catch {
    return null;
  }
}

/** Cron in English words, or the raw expression when cronstrue can't read it. */
export function describeCronExpression(cronExpression: string): string {
  try {
    return cronstrue.toString(cronExpression);
  } catch {
    return cronExpression;
  }
}

export type NamedCronWeekdays = "everyDay" | "weekdays" | "weekends";

type CronWeekdays =
  | { kind: NamedCronWeekdays }
  | { kind: "custom"; text: string };

const ENGLISH_WEEKDAYS: Record<NamedCronWeekdays, string> = {
  everyDay: "Every day",
  weekdays: "Weekdays",
  weekends: "Weekends",
};

function parseWeekdays(dowField: string): CronWeekdays {
  if (dowField === "*") return { kind: "everyDay" };
  if (dowField === "1-5") return { kind: "weekdays" };
  if (dowField === "0,6" || dowField === "6,0") return { kind: "weekends" };
  if (dowField === "1-7" || dowField === "0-6") return { kind: "everyDay" };
  return {
    kind: "custom",
    text: cronstrue
      .toString(`0 0 * * ${dowField}`)
      .replace("At 12:00 AM, ", ""),
  };
}

function getTimezoneAbbr(tz: string, locale: string): string {
  return (
    new Intl.DateTimeFormat(locale, {
      timeZoneName: "short",
      timeZone: tz,
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? tz
  );
}
