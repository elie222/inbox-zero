import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalTimeOfDay } from "@/utils/schedule";
import {
  getEstimatedDigestDeliveryAt,
  getDigestScheduleProgression,
  isDigestScheduleDue,
} from "@/utils/digest/schedule";

const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "UTC";
});

afterAll(() => {
  process.env.TZ = originalTimezone || "UTC";
});

describe("isDigestScheduleDue", () => {
  it("returns true when next occurrence is now or earlier", () => {
    const now = new Date("2026-01-10T17:00:00.000Z");

    expect(
      isDigestScheduleDue(
        { nextOccurrenceAt: new Date("2026-01-10T16:59:59.000Z") },
        now,
      ),
    ).toBe(true);

    expect(
      isDigestScheduleDue(
        { nextOccurrenceAt: new Date("2026-01-10T17:00:00.000Z") },
        now,
      ),
    ).toBe(true);
  });

  it("returns false when next occurrence is in the future or missing", () => {
    const now = new Date("2026-01-10T17:00:00.000Z");

    expect(
      isDigestScheduleDue(
        { nextOccurrenceAt: new Date("2026-01-10T17:00:01.000Z") },
        now,
      ),
    ).toBe(false);
    expect(isDigestScheduleDue({ nextOccurrenceAt: null }, now)).toBe(false);
    expect(isDigestScheduleDue(null, now)).toBe(false);
  });
});

describe("getDigestScheduleProgression", () => {
  it("uses scheduled occurrence time to avoid drift when processing late", () => {
    const now = new Date("2026-01-10T17:23:00.000Z");
    const scheduledAt = new Date("2026-01-10T17:00:00.000Z");

    const progression = getDigestScheduleProgression(
      {
        intervalDays: 1,
        occurrences: 1,
        daysOfWeek: null,
        timeOfDay: createCanonicalTimeOfDay(17, 0),
        nextOccurrenceAt: scheduledAt,
      },
      now,
    );

    expect(progression.lastOccurrenceAt).toEqual(scheduledAt);
    expect(progression.nextOccurrenceAt).toEqual(
      new Date("2026-01-11T17:00:00.000Z"),
    );
  });

  it("skips to the next slot after now when the schedule fell days behind", () => {
    const progression = getDigestScheduleProgression(
      {
        intervalDays: 1,
        occurrences: 1,
        daysOfWeek: null,
        timeOfDay: createCanonicalTimeOfDay(9, 0),
        nextOccurrenceAt: new Date("2026-01-01T09:00:00.000Z"),
      },
      new Date("2026-01-10T09:30:00.000Z"),
    );

    expect(progression.nextOccurrenceAt).toEqual(
      new Date("2026-01-11T09:00:00.000Z"),
    );
  });

  it("keeps a weekly schedule on its weekday after falling weeks behind", () => {
    const progression = getDigestScheduleProgression(
      {
        intervalDays: 7,
        occurrences: 1,
        daysOfWeek: 0b010_0000, // Monday
        timeOfDay: createCanonicalTimeOfDay(9, 0),
        nextOccurrenceAt: new Date("2026-01-05T09:00:00.000Z"),
      },
      new Date("2026-02-04T12:00:00.000Z"),
    );

    expect(progression.nextOccurrenceAt).toEqual(
      new Date("2026-02-09T09:00:00.000Z"),
    );
  });

  it("keeps an every-three-days schedule on its original days when catching up", () => {
    const progression = getDigestScheduleProgression(
      {
        intervalDays: 3,
        occurrences: 1,
        daysOfWeek: null,
        timeOfDay: createCanonicalTimeOfDay(9, 0),
        nextOccurrenceAt: new Date("2026-01-01T09:00:00.000Z"),
      },
      new Date("2026-01-11T08:00:00.000Z"),
    );

    // Slots are Jan 1, 4, 7, 10, 13...
    expect(progression.nextOccurrenceAt).toEqual(
      new Date("2026-01-13T09:00:00.000Z"),
    );
  });

  it("falls back to current time when next occurrence is not set", () => {
    const now = new Date("2026-01-10T10:00:00.000Z");

    const progression = getDigestScheduleProgression(
      {
        intervalDays: 1,
        occurrences: 1,
        daysOfWeek: null,
        timeOfDay: createCanonicalTimeOfDay(17, 0),
        nextOccurrenceAt: null,
      },
      now,
    );

    expect(progression.lastOccurrenceAt).toEqual(now);
    expect(progression.nextOccurrenceAt).toEqual(
      new Date("2026-01-10T17:00:00.000Z"),
    );
  });
});

describe("getEstimatedDigestDeliveryAt", () => {
  it("rounds a scheduled time up to the next dispatch window", () => {
    expect(
      getEstimatedDigestDeliveryAt(new Date("2026-01-10T15:21:00.000Z")),
    ).toEqual(new Date("2026-01-10T15:25:00.000Z"));
  });

  it("keeps a scheduled time that is already on a dispatch boundary", () => {
    expect(
      getEstimatedDigestDeliveryAt(new Date("2026-01-10T15:20:00.000Z")),
    ).toEqual(new Date("2026-01-10T15:20:00.000Z"));
  });

  it("handles rounding into the next day", () => {
    expect(
      getEstimatedDigestDeliveryAt(new Date("2026-01-10T23:59:00.000Z")),
    ).toEqual(new Date("2026-01-11T00:00:00.000Z"));
  });

  it("returns null when no delivery is scheduled", () => {
    expect(getEstimatedDigestDeliveryAt(null)).toBeNull();
  });
});
