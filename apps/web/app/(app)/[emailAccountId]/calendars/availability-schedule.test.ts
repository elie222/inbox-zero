import { describe, it, expect } from "vitest";
import {
  buildDayState,
  collectWindows,
  DEFAULT_WEEKDAY_WINDOWS,
} from "./availability-schedule";

describe("buildDayState", () => {
  it("groups windows by weekday and marks days without windows unavailable", () => {
    const days = buildDayState([
      { weekday: 1, startMinutes: 9 * 60, endMinutes: 12 * 60 },
      { weekday: 1, startMinutes: 13 * 60, endMinutes: 17 * 60 },
      { weekday: 3, startMinutes: 10 * 60, endMinutes: 11 * 60 },
    ]);

    expect(days[0]).toEqual({ enabled: false, ranges: [] });
    expect(days[1]).toEqual({
      enabled: true,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
    });
    expect(days[3]).toEqual({
      enabled: true,
      ranges: [{ start: "10:00", end: "11:00" }],
    });
  });

  it("round-trips through collectWindows for the default schedule", () => {
    const { windows, error } = collectWindows(
      buildDayState(DEFAULT_WEEKDAY_WINDOWS),
    );

    expect(error).toBeNull();
    expect(windows).toEqual(DEFAULT_WEEKDAY_WINDOWS);
  });
});

describe("collectWindows", () => {
  it("returns an error when a range ends before it starts", () => {
    const days = buildDayState([
      { weekday: 2, startMinutes: 9 * 60, endMinutes: 17 * 60 },
    ]);
    days[2].ranges[0] = { start: "17:00", end: "09:00" };

    const result = collectWindows(days);

    expect(result.windows).toBeNull();
    expect(result.error).toContain("Tuesday");
  });

  it("returns an error when no day is enabled", () => {
    const result = collectWindows(buildDayState([]));

    expect(result.windows).toBeNull();
    expect(result.error).toBe("Add at least one available time range.");
  });

  it("ignores ranges on disabled days", () => {
    const days = buildDayState([
      { weekday: 1, startMinutes: 9 * 60, endMinutes: 17 * 60 },
    ]);
    days[2] = { enabled: false, ranges: [{ start: "10:00", end: "08:00" }] };

    const result = collectWindows(days);

    expect(result.error).toBeNull();
    expect(result.windows).toEqual([
      { weekday: 1, startMinutes: 9 * 60, endMinutes: 17 * 60 },
    ]);
  });
});
