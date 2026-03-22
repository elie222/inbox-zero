import { TIMEZONE } from "../types";

interface DayProtectedResult {
  overridable?: boolean;
  protected: boolean;
  reason?: string;
}

export function isDayProtected(date: Date, isVip: boolean): DayProtectedResult {
  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: TIMEZONE,
  }).format(date);

  if (dayOfWeek === "Tue") {
    return {
      protected: true,
      reason: "Tuesday is a protected recovery day",
      overridable: false,
    };
  }

  if (dayOfWeek === "Fri" && !isVip) {
    return {
      protected: true,
      reason: "Friday is a protected non-tutoring day",
      overridable: true,
    };
  }

  return { protected: false };
}
