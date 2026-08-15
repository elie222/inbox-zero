import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIN_SNOOZE_DELAY_MS,
  snoozeThreadsBody,
} from "@/utils/actions/snooze.validation";

describe("snoozeThreadsBody", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects times close enough to race the archive operation", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-15T12:00:00.000Z");

    const result = snoozeThreadsBody.safeParse({
      threadIds: ["thread"],
      snoozedUntil: new Date(Date.now() + MIN_SNOOZE_DELAY_MS - 1),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a time beyond the scheduling buffer", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-15T12:00:00.000Z");

    const result = snoozeThreadsBody.safeParse({
      threadIds: ["thread"],
      snoozedUntil: new Date(Date.now() + MIN_SNOOZE_DELAY_MS),
    });

    expect(result.success).toBe(true);
  });
});
