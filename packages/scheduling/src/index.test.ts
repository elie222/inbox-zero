import { describe, expect, it } from "vitest";
import {
  applyBuffers,
  expandWeeklyAvailability,
  generateBookableSlots,
  subtractBusyPeriods,
  validateSelectedSlot,
  type BookingPolicy,
} from "./index";

const policy: BookingPolicy = {
  durationMinutes: 30,
  slotIntervalMinutes: 30,
  minimumNoticeMinutes: 0,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  bookingWindowDays: 30,
};

describe("generateBookableSlots", () => {
  it("expands weekly availability into interval-based slots", () => {
    const slots = generateBookableSlots({
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      rules: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
      policy,
    });

    expect(slots).toEqual([
      {
        startTime: "2026-05-04T09:00:00.000Z",
        endTime: "2026-05-04T09:30:00.000Z",
      },
      {
        startTime: "2026-05-04T09:30:00.000Z",
        endTime: "2026-05-04T10:00:00.000Z",
      },
    ]);
  });

  it("allows slot interval to differ from duration", () => {
    const slots = generateBookableSlots({
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      rules: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
      policy: { ...policy, durationMinutes: 30, slotIntervalMinutes: 15 },
    });

    expect(slots.map((slot) => slot.startTime)).toEqual([
      "2026-05-04T09:00:00.000Z",
      "2026-05-04T09:15:00.000Z",
      "2026-05-04T09:30:00.000Z",
    ]);
  });

  it("surfaces a 45-minute slot inside a free window that does not align with the duration grid", () => {
    // 45-minute call from 9:00-12:00 with 9:00-9:45 busy. Anchoring slots to
    // 45-minute increments would skip 10:00, even though 10:00-10:45 is free.
    // A 30-minute slot interval surfaces it.
    const slots = generateBookableSlots({
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      rules: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 12 * 60 }],
      busyPeriods: [
        {
          start: "2026-05-04T09:00:00.000Z",
          end: "2026-05-04T09:45:00.000Z",
        },
      ],
      policy: { ...policy, durationMinutes: 45, slotIntervalMinutes: 30 },
    });

    expect(slots.map((slot) => slot.startTime)).toEqual([
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T10:30:00.000Z",
      "2026-05-04T11:00:00.000Z",
    ]);
  });

  it("anchors slots to the local wall-clock interval grid instead of the availability start", () => {
    const slots = generateBookableSlots({
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      rules: [{ weekday: 1, startMinutes: 9 * 60 + 15, endMinutes: 11 * 60 }],
      policy: { ...policy, durationMinutes: 45, slotIntervalMinutes: 30 },
    });

    expect(slots.map((slot) => slot.startTime)).toEqual([
      "2026-05-04T09:30:00.000Z",
      "2026-05-04T10:00:00.000Z",
    ]);
  });

  it("applies minimum notice and booking window", () => {
    const slots = generateBookableSlots({
      now: "2026-05-04T09:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-07T00:00:00.000Z",
      rules: [
        { weekday: 1, startMinutes: 9 * 60, endMinutes: 11 * 60 },
        { weekday: 2, startMinutes: 9 * 60, endMinutes: 11 * 60 },
        { weekday: 3, startMinutes: 9 * 60, endMinutes: 11 * 60 },
      ],
      policy: {
        ...policy,
        minimumNoticeMinutes: 60,
        bookingWindowDays: 1,
      },
    });

    expect(slots.map((slot) => slot.startTime)).toEqual([
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T10:30:00.000Z",
      "2026-05-05T09:00:00.000Z",
    ]);
  });

  it("blocks date overrides", () => {
    const slots = generateBookableSlots({
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-06T00:00:00.000Z",
      rules: [
        { weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 },
        { weekday: 2, startMinutes: 9 * 60, endMinutes: 10 * 60 },
      ],
      dateOverrides: [{ date: "2026-05-05", type: "BLOCKED" }],
      policy,
    });

    expect(slots.map((slot) => slot.startTime)).toEqual([
      "2026-05-04T09:00:00.000Z",
      "2026-05-04T09:30:00.000Z",
    ]);
  });

  it("subtracts busy periods with exact-boundary handling", () => {
    const slots = generateBookableSlots({
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      rules: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 11 * 60 }],
      busyPeriods: [
        {
          start: "2026-05-04T09:30:00.000Z",
          end: "2026-05-04T10:00:00.000Z",
        },
      ],
      policy,
    });

    expect(slots.map((slot) => slot.startTime)).toEqual([
      "2026-05-04T09:00:00.000Z",
      "2026-05-04T10:00:00.000Z",
      "2026-05-04T10:30:00.000Z",
    ]);
  });

  it("uses timezone-local weekdays across DST changes", () => {
    const slots = generateBookableSlots({
      now: "2026-03-01T00:00:00.000Z",
      timezone: "America/New_York",
      start: "2026-03-08T00:00:00.000Z",
      end: "2026-03-09T00:00:00.000Z",
      rules: [{ weekday: 0, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
      policy,
    });

    expect(slots[0]).toEqual({
      startTime: "2026-03-08T13:00:00.000Z",
      endTime: "2026-03-08T13:30:00.000Z",
    });
  });
});

describe("availability helpers", () => {
  it("expands weekly availability into UTC windows", () => {
    const windows = expandWeeklyAvailability({
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      timezone: "UTC",
      rules: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
    });

    expect(windows).toEqual([
      {
        date: "2026-05-04",
        startTime: "2026-05-04T09:00:00.000Z",
        endTime: "2026-05-04T10:00:00.000Z",
      },
    ]);
  });

  it("applies buffers around busy periods", () => {
    expect(
      applyBuffers({
        busyPeriods: [
          {
            start: "2026-05-04T10:00:00.000Z",
            end: "2026-05-04T10:30:00.000Z",
          },
        ],
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 10,
      }),
    ).toEqual([
      {
        start: "2026-05-04T09:45:00.000Z",
        end: "2026-05-04T10:40:00.000Z",
      },
    ]);
  });

  it("subtracts overlapping busy periods only", () => {
    const slots = [
      {
        startTime: "2026-05-04T09:00:00.000Z",
        endTime: "2026-05-04T09:30:00.000Z",
      },
      {
        startTime: "2026-05-04T09:30:00.000Z",
        endTime: "2026-05-04T10:00:00.000Z",
      },
    ];

    expect(
      subtractBusyPeriods(slots, [
        {
          start: "2026-05-04T09:30:00.000Z",
          end: "2026-05-04T10:00:00.000Z",
        },
      ]),
    ).toEqual([slots[0]]);
  });

  it("validates a selected slot by recomputing availability", () => {
    const result = validateSelectedSlot({
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      selectedStartTime: "2026-05-04T09:30:00.000Z",
      rules: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 10 * 60 }],
      policy,
    });

    expect(result).toEqual({
      valid: true,
      slot: {
        startTime: "2026-05-04T09:30:00.000Z",
        endTime: "2026-05-04T10:00:00.000Z",
      },
    });
  });

  it("rejects a selected slot that is not aligned to the interval grid", () => {
    const result = validateSelectedSlot({
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      selectedStartTime: "2026-05-04T09:07:00.000Z",
      rules: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 11 * 60 }],
      policy: { ...policy, slotIntervalMinutes: 15 },
    });

    expect(result).toEqual({
      valid: false,
      reason: "Selected slot is not available",
    });
  });

  it("validates selected slots against the local wall-clock interval grid", () => {
    const baseInput = {
      now: "2026-05-04T00:00:00.000Z",
      timezone: "UTC",
      start: "2026-05-04T00:00:00.000Z",
      end: "2026-05-05T00:00:00.000Z",
      rules: [{ weekday: 1, startMinutes: 9 * 60 + 15, endMinutes: 11 * 60 }],
      policy: { ...policy, durationMinutes: 45, slotIntervalMinutes: 30 },
    };

    expect(
      validateSelectedSlot({
        ...baseInput,
        selectedStartTime: "2026-05-04T09:30:00.000Z",
      }),
    ).toEqual({
      valid: true,
      slot: {
        startTime: "2026-05-04T09:30:00.000Z",
        endTime: "2026-05-04T10:15:00.000Z",
      },
    });

    expect(
      validateSelectedSlot({
        ...baseInput,
        selectedStartTime: "2026-05-04T09:45:00.000Z",
      }),
    ).toEqual({
      valid: false,
      reason: "Selected slot is not available",
    });
  });
});
