import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanonicalTimeOfDay } from "@/utils/schedule";
import {
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
