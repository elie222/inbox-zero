import { describe, it, expect, vi } from "vitest";
import { checkCalendarAvailability } from "./checker";
import { CALENDAR_IDS } from "../types";

function createMockCalendarClient(eventsByCalendar: Record<string, any[]>) {
  return {
    events: {
      list: vi.fn(async ({ calendarId }: { calendarId: string }) => ({
        data: { items: eventsByCalendar[calendarId] ?? [] },
      })),
    },
  };
}

function makeEvent(
  summary: string,
  start = "2026-03-23T10:00:00Z",
  end = "2026-03-23T11:00:00Z",
) {
  return { summary, start: { dateTime: start }, end: { dateTime: end } };
}

// A Monday in CST so no day-protection applies
const MONDAY_START = new Date("2026-03-23T14:00:00Z"); // 9 AM CST
const MONDAY_END = new Date("2026-03-23T15:00:00Z"); // 10 AM CST

// A Tuesday for day-protection test
const TUESDAY_START = new Date("2026-03-24T14:00:00Z");
const TUESDAY_END = new Date("2026-03-24T15:00:00Z");

describe("checkCalendarAvailability", () => {
  it("returns available when no events conflict", async () => {
    const client = createMockCalendarClient({});
    const result = await checkCalendarAvailability({
      startTime: MONDAY_START,
      endTime: MONDAY_END,
      isVip: false,
      calendarClient: client,
    });

    expect(result.available).toBe(true);
    expect(result.hardBlocks).toHaveLength(0);
    expect(result.softConflicts).toHaveLength(0);
  });

  it("detects hard block from unprefixed event on Personal calendar", async () => {
    const client = createMockCalendarClient({
      [CALENDAR_IDS.personal]: [makeEvent("Doctor appointment")],
    });
    const result = await checkCalendarAvailability({
      startTime: MONDAY_START,
      endTime: MONDAY_END,
      isVip: false,
      calendarClient: client,
    });

    expect(result.available).toBe(false);
    expect(result.hardBlocks).toHaveLength(1);
    expect(result.hardBlocks[0].title).toBe("Doctor appointment");
    expect(result.hardBlocks[0].calendar).toBe("Personal");
    expect(result.softConflicts).toHaveLength(0);
  });

  it("treats ~ prefix as soft conflict", async () => {
    const client = createMockCalendarClient({
      [CALENDAR_IDS.personal]: [makeEvent("~ Coffee chat")],
    });
    const result = await checkCalendarAvailability({
      startTime: MONDAY_START,
      endTime: MONDAY_END,
      isVip: false,
      calendarClient: client,
    });

    expect(result.available).toBe(true);
    expect(result.hardBlocks).toHaveLength(0);
    expect(result.softConflicts).toHaveLength(1);
    expect(result.softConflicts[0].title).toBe("Coffee chat");
  });

  it("ignores FYI: prefixed events", async () => {
    const client = createMockCalendarClient({
      [CALENDAR_IDS.personal]: [makeEvent("FYI: Team standup")],
      [CALENDAR_IDS.smartCollege]: [makeEvent("fyi: Newsletter goes out")],
    });
    const result = await checkCalendarAvailability({
      startTime: MONDAY_START,
      endTime: MONDAY_END,
      isVip: false,
      calendarClient: client,
    });

    expect(result.available).toBe(true);
    expect(result.hardBlocks).toHaveLength(0);
    expect(result.softConflicts).toHaveLength(0);
  });

  it("treats Nutrition calendar events as soft regardless of prefix", async () => {
    const client = createMockCalendarClient({
      [CALENDAR_IDS.nutrition]: [makeEvent("Meal prep"), makeEvent("Lunch")],
    });
    const result = await checkCalendarAvailability({
      startTime: MONDAY_START,
      endTime: MONDAY_END,
      isVip: false,
      calendarClient: client,
    });

    expect(result.available).toBe(true);
    expect(result.hardBlocks).toHaveLength(0);
    expect(result.softConflicts).toHaveLength(2);
  });

  it("treats RMS Work calendar events as hard block regardless of ~ prefix", async () => {
    const client = createMockCalendarClient({
      [CALENDAR_IDS.rmsWork]: [makeEvent("~ Assembly (could skip)")],
    });
    const result = await checkCalendarAvailability({
      startTime: MONDAY_START,
      endTime: MONDAY_END,
      isVip: false,
      calendarClient: client,
    });

    expect(result.available).toBe(false);
    expect(result.hardBlocks).toHaveLength(1);
    expect(result.hardBlocks[0].title).toBe("Assembly (could skip)");
    expect(result.softConflicts).toHaveLength(0);
  });

  it("returns unavailable on Tuesday (day protection short-circuit)", async () => {
    const client = createMockCalendarClient({});
    const result = await checkCalendarAvailability({
      startTime: TUESDAY_START,
      endTime: TUESDAY_END,
      isVip: false,
      calendarClient: client,
    });

    expect(result.available).toBe(false);
    expect(result.hardBlocks).toHaveLength(1);
    expect(result.hardBlocks[0].calendar).toBe("Day Protection");
    expect(result.hardBlocks[0].title).toMatch(/Tuesday/i);
    // Should not have called the calendar API at all
    expect(client.events.list).not.toHaveBeenCalled();
  });
});
