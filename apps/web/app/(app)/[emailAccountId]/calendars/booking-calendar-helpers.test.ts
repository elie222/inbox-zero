import { describe, expect, it } from "vitest";
import {
  getCalendarOptions,
  getDefaultDestinationCalendarId,
  type BookingLinkCalendarData,
} from "./booking-calendar-helpers";

describe("booking calendar helpers", () => {
  it("only offers enabled calendars as booking destinations", () => {
    const data = calendarData({
      calendars: [
        { id: "disabled-calendar-id", isEnabled: false, primary: true },
        { id: "enabled-calendar-id", isEnabled: true, primary: false },
      ],
    });

    expect(getCalendarOptions(data)).toEqual([
      { label: "Enabled calendar", value: "enabled-calendar-id" },
    ]);
    expect(getDefaultDestinationCalendarId(data)).toBe("enabled-calendar-id");
  });

  it("does not fall back to disabled calendars", () => {
    const data = calendarData({
      calendars: [
        { id: "disabled-calendar-id", isEnabled: false, primary: true },
      ],
    });

    expect(getCalendarOptions(data)).toEqual([]);
    expect(getDefaultDestinationCalendarId(data)).toBe("");
  });
});

function calendarData({
  calendars,
}: {
  calendars: Array<{ id: string; isEnabled: boolean; primary: boolean }>;
}): BookingLinkCalendarData {
  return {
    calendarConnections: [
      {
        provider: "google",
        calendars: calendars.map((calendar) => ({
          ...calendar,
          name: calendar.isEnabled ? "Enabled calendar" : "Disabled calendar",
        })),
      },
    ],
  };
}
