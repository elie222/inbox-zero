import cronstrue from "cronstrue";

export function describeCronSchedule(cronExpression: string): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) return cronstrueFallback(cronExpression);

    const [minField, hourField, domField, monthField, dowField] = parts;

    if (domField !== "*" || monthField !== "*") {
      return cronstrueFallback(cronExpression);
    }

    const minute = minField === "*" ? 0 : Number.parseInt(minField, 10);
    const utcHours =
      hourField === "*"
        ? null
        : hourField.split(",").map((h) => Number.parseInt(h.trim(), 10));

    if (!utcHours || Number.isNaN(minute)) {
      return cronstrueFallback(cronExpression);
    }

    const timeFormatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    });

    const localTimes = utcHours.map((h) => {
      const utcDate = new Date(Date.UTC(2025, 0, 6, h, minute));
      return timeFormatter.format(utcDate);
    });

    const weekdayText = describeWeekdays(dowField);
    const tzAbbr = getTimezoneAbbr(tz);

    const timeList =
      localTimes.length === 1
        ? localTimes[0]
        : `${localTimes.slice(0, -1).join(", ")} and ${localTimes[localTimes.length - 1]}`;

    return `${weekdayText} at ${timeList} ${tzAbbr}`;
  } catch {
    return cronstrueFallback(cronExpression);
  }
}

function describeWeekdays(dowField: string): string {
  if (dowField === "*") return "Every day";
  if (dowField === "1-5") return "Weekdays";
  if (dowField === "0,6" || dowField === "6,0") return "Weekends";
  if (dowField === "1-7" || dowField === "0-6") return "Every day";
  return cronstrue.toString(`0 0 * * ${dowField}`).replace("At 12:00 AM, ", "");
}

function getTimezoneAbbr(tz: string): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
      timeZone: tz,
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? tz
  );
}

function cronstrueFallback(cronExpression: string): string {
  try {
    return cronstrue.toString(cronExpression);
  } catch {
    return cronExpression;
  }
}
