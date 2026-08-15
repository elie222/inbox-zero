import { afterEach, describe, expect, it, vi } from "vitest";
import { snoozeThreadsBody } from "@/utils/actions/snooze.validation";

describe("snoozeThreadsBody", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects times close enough to race the archive operation", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-15T12:00:00.000Z");

    const result = snoozeThreadsBody.safeParse({
      threadIds: ["thread"],
      snoozedUntil: new Date(Date.now() + 60_000 - 1),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a time beyond the scheduling buffer", () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-15T12:00:00.000Z");

    const result = snoozeThreadsBody.safeParse({
      threadIds: ["thread"],
      snoozedUntil: new Date(Date.now() + 60_000),
    });

    expect(result.success).toBe(true);
  });

  it("rejects oversized provider thread IDs", () => {
    const result = snoozeThreadsBody.safeParse({
      threadIds: ["x".repeat(513)],
      snoozedUntil: new Date(Date.now() + 60_000),
    });

    expect(result.success).toBe(false);
  });
});
