export type TimezoneEntry = {
  zone: string;
  offsetMinutes: number;
  offsetLabel: string;
};

export function getSupportedTimezonesWithOffsets(
  current?: string,
): TimezoneEntry[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };
  const zones = intlWithSupportedValues.supportedValuesOf?.("timeZone") ?? [
    "UTC",
  ];
  const includeCurrent = current && !zones.includes(current);
  const allZones = includeCurrent ? [current, ...zones] : zones;
  const now = new Date();
  return allZones
    .map((zone) => {
      const offsetMinutes = getTimezoneOffsetMinutes(zone, now);
      return {
        zone,
        offsetMinutes,
        offsetLabel: formatOffsetLabel(offsetMinutes),
      };
    })
    .sort((a, b) => {
      if (a.offsetMinutes !== b.offsetMinutes) {
        return a.offsetMinutes - b.offsetMinutes;
      }
      return a.zone.localeCompare(b.zone);
    });
}

export function getTimezoneOffsetMinutes(zone: string, now: Date): number {
  try {
    const parts = getTimezoneParts(zone, now);
    const zonedAsUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );

    return Math.round((zonedAsUtcMs - now.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

export function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `GMT ${sign}${hours}:${minutes.toString().padStart(2, "0")}`;
}

function getTimezoneParts(zone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}
