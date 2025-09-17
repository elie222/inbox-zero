import { describe, it, expect, vi, beforeEach } from "vitest";
import type { calendar_v3 } from "@googleapis/calendar";
import {
  mergeBusyPeriods,
  generateTimeSlots,
  getSuggestedTimeSlots,
  getCalendarAvailability,
  type TimeSlot,
} from "./availability";

// Mock the calendar client module
vi.mock("./client", () => ({
  getCalendarClientWithRefresh: vi.fn(),
}));

// Mock the logger to avoid console output during tests
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { getCalendarClientWithRefresh } from "./client";

describe("mergeBusyPeriods", () => {
  it("should return empty array for empty input", () => {
    expect(mergeBusyPeriods([])).toEqual([]);
  });

  it("should return single period when only one period exists", () => {
    const periods = [
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:00:00Z" },
    ];
    expect(mergeBusyPeriods(periods)).toEqual(periods);
  });

  it("should merge overlapping periods", () => {
    const periods = [
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:00:00Z" },
      { start: "2024-01-01T10:30:00Z", end: "2024-01-01T11:30:00Z" },
    ];
    expect(mergeBusyPeriods(periods)).toEqual([
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:30:00Z" },
    ]);
  });

  it("should merge adjacent periods", () => {
    const periods = [
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:00:00Z" },
      { start: "2024-01-01T11:00:00Z", end: "2024-01-01T12:00:00Z" },
    ];
    expect(mergeBusyPeriods(periods)).toEqual([
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T12:00:00Z" },
    ]);
  });

  it("should not merge non-overlapping periods", () => {
    const periods = [
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:00:00Z" },
      { start: "2024-01-01T14:00:00Z", end: "2024-01-01T15:00:00Z" },
    ];
    expect(mergeBusyPeriods(periods)).toEqual(periods);
  });

  it("should handle complex overlapping scenarios", () => {
    const periods = [
      { start: "2024-01-01T09:00:00Z", end: "2024-01-01T10:00:00Z" },
      { start: "2024-01-01T09:30:00Z", end: "2024-01-01T11:00:00Z" },
      { start: "2024-01-01T10:30:00Z", end: "2024-01-01T12:00:00Z" },
      { start: "2024-01-01T14:00:00Z", end: "2024-01-01T15:00:00Z" },
    ];
    expect(mergeBusyPeriods(periods)).toEqual([
      { start: "2024-01-01T09:00:00Z", end: "2024-01-01T12:00:00Z" },
      { start: "2024-01-01T14:00:00Z", end: "2024-01-01T15:00:00Z" },
    ]);
  });

  it("should handle periods in random order", () => {
    const periods = [
      { start: "2024-01-01T14:00:00Z", end: "2024-01-01T15:00:00Z" },
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:00:00Z" },
      { start: "2024-01-01T10:30:00Z", end: "2024-01-01T12:00:00Z" },
    ];
    expect(mergeBusyPeriods(periods)).toEqual([
      { start: "2024-01-01T10:00:00Z", end: "2024-01-01T12:00:00Z" },
      { start: "2024-01-01T14:00:00Z", end: "2024-01-01T15:00:00Z" },
    ]);
  });
});

describe("generateTimeSlots", () => {
  const date = new Date("2024-01-01");

  // Helper to create ISO strings in the same timezone as the test date
  const createTimeString = (hour: number, minute = 0) => {
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  it("should generate time slots for a day with no busy periods", () => {
    const slots = generateTimeSlots({
      date,
      busyPeriods: [],
      startHour: 9,
      endHour: 11,
      slotDurationMinutes: 30,
    });

    expect(slots).toHaveLength(4); // 9:00-9:30, 9:30-10:00, 10:00-10:30, 10:30-11:00
    expect(slots.every((slot) => slot.available)).toBe(true);
  });

  it("should mark slots as unavailable when they overlap with busy periods", () => {
    const busyPeriods = [
      { start: createTimeString(10, 0), end: createTimeString(11, 0) },
    ];

    const slots = generateTimeSlots({
      date,
      busyPeriods,
      startHour: 9,
      endHour: 12,
      slotDurationMinutes: 30,
    });

    expect(slots).toHaveLength(6);
    // 9:00-9:30 and 9:30-10:00 should be available
    expect(slots[0].available).toBe(true);
    expect(slots[1].available).toBe(true);
    // 10:00-10:30 and 10:30-11:00 should be unavailable
    expect(slots[2].available).toBe(false);
    expect(slots[3].available).toBe(false);
    // 11:00-11:30 and 11:30-12:00 should be available
    expect(slots[4].available).toBe(true);
    expect(slots[5].available).toBe(true);
  });

  it("should handle partial overlaps correctly", () => {
    const busyPeriods = [
      { start: createTimeString(9, 15), end: createTimeString(9, 45) },
    ];

    const slots = generateTimeSlots({
      date,
      busyPeriods,
      startHour: 9,
      endHour: 10,
      slotDurationMinutes: 30,
    });

    expect(slots).toHaveLength(2);
    // Both slots overlap with the busy period
    expect(slots[0].available).toBe(false); // 9:00-9:30
    expect(slots[1].available).toBe(false); // 9:30-10:00
  });

  it("should generate slots for full day range", () => {
    const slots = generateTimeSlots({
      date,
      busyPeriods: [],
      startHour: 0,
      endHour: 24,
    });

    // 0-24 with 30min slots = 48 slots
    expect(slots).toHaveLength(48);
    expect(new Date(slots[0].start).getHours()).toBe(0);
    expect(new Date(slots[slots.length - 1].end).getHours()).toBe(0); // Next day
  });

  it("should handle slots that span busy periods", () => {
    const busyPeriods = [
      { start: createTimeString(9, 20), end: createTimeString(9, 40) },
    ];

    const slots = generateTimeSlots({
      date,
      busyPeriods,
      startHour: 9,
      endHour: 10,
      slotDurationMinutes: 60,
    });

    expect(slots).toHaveLength(1);
    // The 9:00-10:00 slot contains the busy period
    expect(slots[0].available).toBe(false);
  });
});

describe("getSuggestedTimeSlots", () => {
  const createTimeSlot = (
    hour: number,
    minute: number,
    available: boolean,
  ): TimeSlot => {
    const date = new Date("2024-01-01");
    date.setHours(hour, minute, 0, 0);
    const end = new Date(date);
    end.setMinutes(end.getMinutes() + 30);

    return {
      start: date.toISOString(),
      end: end.toISOString(),
      available,
    };
  };

  it("should return empty array when no available slots", () => {
    const slots = [createTimeSlot(9, 0, false), createTimeSlot(9, 30, false)];

    expect(getSuggestedTimeSlots(slots)).toEqual([]);
  });

  it("should prefer morning slots over afternoon slots", () => {
    const slots = [
      createTimeSlot(9, 0, true), // Morning
      createTimeSlot(14, 0, true), // Afternoon
      createTimeSlot(10, 0, true), // Morning
      createTimeSlot(15, 0, true), // Afternoon
    ];

    const suggestions = getSuggestedTimeSlots(slots, 3);
    expect(suggestions).toHaveLength(3);
    // First two should be morning slots
    expect(suggestions[0]).toBe("9:00 AM");
    expect(suggestions[1]).toBe("10:00 AM");
    expect(suggestions[2]).toBe("2:00 PM");
  });

  it("should respect maxSuggestions limit", () => {
    const slots = [
      createTimeSlot(9, 0, true),
      createTimeSlot(10, 0, true),
      createTimeSlot(11, 0, true),
      createTimeSlot(14, 0, true),
      createTimeSlot(15, 0, true),
    ];

    const suggestions = getSuggestedTimeSlots(slots, 2);
    expect(suggestions).toHaveLength(2);
  });

  it("should format times correctly", () => {
    const slots = [createTimeSlot(9, 30, true), createTimeSlot(14, 15, true)];

    const suggestions = getSuggestedTimeSlots(slots);
    expect(suggestions[0]).toBe("9:30 AM");
    expect(suggestions[1]).toBe("2:15 PM");
  });

  it("should handle all afternoon slots", () => {
    const slots = [
      createTimeSlot(13, 0, true),
      createTimeSlot(14, 0, true),
      createTimeSlot(15, 0, true),
    ];

    const suggestions = getSuggestedTimeSlots(slots);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((s) => s.includes("PM"))).toBe(true);
  });

  it("should use default maxSuggestions of 3", () => {
    const slots = Array.from({ length: 10 }, (_, i) =>
      createTimeSlot(9 + i, 0, true),
    );

    const suggestions = getSuggestedTimeSlots(slots);
    expect(suggestions).toHaveLength(3);
  });
});

describe("getCalendarAvailability", () => {
  const mockCalendarClient = {
    freebusy: {
      query: vi.fn(),
    },
  } as unknown as calendar_v3.Calendar;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCalendarClientWithRefresh).mockResolvedValue(
      mockCalendarClient,
    );
  });

  it("should fetch calendar availability successfully", async () => {
    vi.mocked(mockCalendarClient.freebusy.query).mockResolvedValue({
      data: {
        calendars: {
          calendar1: {
            busy: [
              { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:00:00Z" },
            ],
          },
          calendar2: {
            busy: [
              { start: "2024-01-01T14:00:00Z", end: "2024-01-01T15:00:00Z" },
            ],
          },
        },
      },
    } as any);

    const result = await getCalendarAvailability({
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3_600_000,
      emailAccountId: "account123",
      calendarIds: ["calendar1", "calendar2"],
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-01"),
      startHour: 9,
      endHour: 17,
      slotDurationMinutes: 30,
    });

    expect(result.date).toBe("2024-01-01");
    expect(result.busyPeriods).toHaveLength(2);
    expect(result.timeSlots).toBeDefined();
    expect(result.timeSlots.length).toBeGreaterThan(0);

    // Check that busy periods are correctly identified
    const busySlots = result.timeSlots.filter((slot) => !slot.available);
    expect(busySlots.length).toBeGreaterThan(0);
  });

  it("should handle empty calendar response", async () => {
    vi.mocked(mockCalendarClient.freebusy.query).mockResolvedValue({
      data: {
        calendars: {},
      },
    } as any);

    const result = await getCalendarAvailability({
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3_600_000,
      emailAccountId: "account123",
      calendarIds: ["calendar1"],
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-01"),
      startHour: 9,
      endHour: 17,
    });

    expect(result.busyPeriods).toHaveLength(0);
    expect(result.timeSlots.every((slot) => slot.available)).toBe(true);
  });

  it("should handle API errors", async () => {
    const error = new Error("API Error");
    vi.mocked(mockCalendarClient.freebusy.query).mockRejectedValue(error);

    await expect(
      getCalendarAvailability({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3_600_000,
        emailAccountId: "account123",
        calendarIds: ["calendar1"],
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-01"),
        startHour: 9,
        endHour: 17,
      }),
    ).rejects.toThrow("API Error");
  });

  it("should merge overlapping busy periods across calendars", async () => {
    vi.mocked(mockCalendarClient.freebusy.query).mockResolvedValue({
      data: {
        calendars: {
          calendar1: {
            busy: [
              { start: "2024-01-01T10:00:00Z", end: "2024-01-01T11:30:00Z" },
            ],
          },
          calendar2: {
            busy: [
              { start: "2024-01-01T11:00:00Z", end: "2024-01-01T12:00:00Z" },
            ],
          },
        },
      },
    } as any);

    const result = await getCalendarAvailability({
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3_600_000,
      emailAccountId: "account123",
      calendarIds: ["calendar1", "calendar2"],
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-01"),
      startHour: 9,
      endHour: 17,
    });

    // Check that we have busy periods in the result
    expect(result.busyPeriods).toHaveLength(2);

    // Check that we have time slots
    expect(result.timeSlots.length).toBeGreaterThan(0);

    // Find unavailable slots
    const unavailableSlots = result.timeSlots.filter((slot) => !slot.available);
    expect(unavailableSlots.length).toBeGreaterThan(0);

    // Check that the busy period from 10:00-12:00 is reflected in the slots
    // The overlapping periods (10:00-11:30 and 11:00-12:00) should merge to 10:00-12:00
    const busySlotsInMergedPeriod = result.timeSlots.filter((slot) => {
      if (slot.available) return false;
      const slotStart = new Date(slot.start);
      const slotEnd = new Date(slot.end);
      const mergedStart = new Date("2024-01-01T10:00:00Z");
      const mergedEnd = new Date("2024-01-01T12:00:00Z");

      // Check if slot is within the merged busy period
      return slotStart >= mergedStart && slotEnd <= mergedEnd;
    });

    expect(busySlotsInMergedPeriod.length).toBeGreaterThan(0);
  });
});
