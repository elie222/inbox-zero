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
    // Format the same instant as a wall-clock string in UTC and in the target
    // zone, then re-parse both. Each `new Date(...)` interprets the string in
    // the system's local zone, so the local offset cancels out and the
    // remaining diff is the target zone's offset from UTC.
    const utcMs = new Date(
      now.toLocaleString("en-US", { timeZone: "UTC" }),
    ).getTime();
    const tzMs = new Date(
      now.toLocaleString("en-US", { timeZone: zone }),
    ).getTime();
    return Math.round((tzMs - utcMs) / 60_000);
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
