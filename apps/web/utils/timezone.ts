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
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = raw.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/);
    if (!match) return 0;
    const [, sign = "+", hours = "0", minutes = "0"] = match;
    const total = Number(hours) * 60 + Number(minutes);
    return sign === "-" ? -total : total;
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
