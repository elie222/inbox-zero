import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  shouldShowTimezonePrompt,
  addDismissedPrompt,
  DISMISSAL_EXPIRY_DAYS,
  type DismissedPrompt,
} from "./TimezoneDetector";

vi.mock("server-only", () => ({}));

describe("shouldShowTimezonePrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return false when timezones match", () => {
    const result = shouldShowTimezonePrompt(
      "America/New_York",
      "America/New_York",
      [],
    );
    expect(result).toBe(false);
  });

  it("should return true when timezones differ and no dismissals exist", () => {
    const result = shouldShowTimezonePrompt(
      "America/New_York",
      "Europe/London",
      [],
    );
    expect(result).toBe(true);
  });

  it("should return false when combination was recently dismissed", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const dismissedPrompts: DismissedPrompt[] = [
      {
        saved: "America/New_York",
        detected: "Europe/London",
        dismissedAt: now - 1000 * 60 * 60 * 24, // 1 day ago
      },
    ];

    const result = shouldShowTimezonePrompt(
      "America/New_York",
      "Europe/London",
      dismissedPrompts,
    );
    expect(result).toBe(false);
  });

  it("should return true when dismissal has expired", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const dismissedPrompts: DismissedPrompt[] = [
      {
        saved: "America/New_York",
        detected: "Europe/London",
        dismissedAt: now - 1000 * 60 * 60 * 24 * (DISMISSAL_EXPIRY_DAYS + 1), // 31 days ago
      },
    ];

    const result = shouldShowTimezonePrompt(
      "America/New_York",
      "Europe/London",
      dismissedPrompts,
    );
    expect(result).toBe(true);
  });

  it("should return true for a different timezone combination", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const dismissedPrompts: DismissedPrompt[] = [
      {
        saved: "America/New_York",
        detected: "Europe/London",
        dismissedAt: now - 1000 * 60 * 60 * 24, // 1 day ago
      },
    ];

    const result = shouldShowTimezonePrompt(
      "America/New_York",
      "Asia/Tokyo",
      dismissedPrompts,
    );
    expect(result).toBe(true);
  });

  it("should handle multiple dismissed prompts correctly", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const dismissedPrompts: DismissedPrompt[] = [
      {
        saved: "America/New_York",
        detected: "Europe/London",
        dismissedAt: now - 1000 * 60 * 60 * 24, // 1 day ago
      },
      {
        saved: "America/New_York",
        detected: "Asia/Tokyo",
        dismissedAt: now - 1000 * 60 * 60 * 24 * 5, // 5 days ago
      },
    ];

    // Should not show for London (dismissed)
    expect(
      shouldShowTimezonePrompt(
        "America/New_York",
        "Europe/London",
        dismissedPrompts,
      ),
    ).toBe(false);

    // Should not show for Tokyo (dismissed)
    expect(
      shouldShowTimezonePrompt(
        "America/New_York",
        "Asia/Tokyo",
        dismissedPrompts,
      ),
    ).toBe(false);

    // Should show for Paris (not dismissed)
    expect(
      shouldShowTimezonePrompt(
        "America/New_York",
        "Europe/Paris",
        dismissedPrompts,
      ),
    ).toBe(true);
  });

  it("should return true when dismissal is exactly at expiry boundary", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const dismissedPrompts: DismissedPrompt[] = [
      {
        saved: "America/New_York",
        detected: "Europe/London",
        dismissedAt: now - 1000 * 60 * 60 * 24 * DISMISSAL_EXPIRY_DAYS, // exactly 30 days ago
      },
    ];

    const result = shouldShowTimezonePrompt(
      "America/New_York",
      "Europe/London",
      dismissedPrompts,
    );
    expect(result).toBe(true);
  });
});

describe("addDismissedPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should add a new dismissal to empty array", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const result = addDismissedPrompt([], "America/New_York", "Europe/London");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      saved: "America/New_York",
      detected: "Europe/London",
      dismissedAt: now,
    });
  });

  it("should add a new dismissal to existing array", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const existing: DismissedPrompt[] = [
      {
        saved: "America/New_York",
        detected: "Asia/Tokyo",
        dismissedAt: now - 1000,
      },
    ];

    const result = addDismissedPrompt(
      existing,
      "America/New_York",
      "Europe/London",
    );

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      saved: "America/New_York",
      detected: "Europe/London",
      dismissedAt: now,
    });
  });

  it("should replace existing dismissal for same timezone combination", () => {
    const oldTime = Date.now();
    vi.setSystemTime(oldTime);

    const existing: DismissedPrompt[] = [
      {
        saved: "America/New_York",
        detected: "Europe/London",
        dismissedAt: oldTime,
      },
      {
        saved: "America/New_York",
        detected: "Asia/Tokyo",
        dismissedAt: oldTime,
      },
    ];

    const newTime = oldTime + 1000 * 60 * 60 * 24; // 1 day later
    vi.setSystemTime(newTime);

    const result = addDismissedPrompt(
      existing,
      "America/New_York",
      "Europe/London",
    );

    expect(result).toHaveLength(2);
    // Should still have Tokyo dismissal
    expect(
      result.some(
        (p) => p.saved === "America/New_York" && p.detected === "Asia/Tokyo",
      ),
    ).toBe(true);
    // Should have new London dismissal with updated timestamp
    const londonDismissal = result.find(
      (p) => p.saved === "America/New_York" && p.detected === "Europe/London",
    );
    expect(londonDismissal?.dismissedAt).toBe(newTime);
  });

  it("should preserve other dismissals when updating one", () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const existing: DismissedPrompt[] = [
      {
        saved: "America/New_York",
        detected: "Europe/London",
        dismissedAt: now - 1000,
      },
      {
        saved: "America/New_York",
        detected: "Asia/Tokyo",
        dismissedAt: now - 2000,
      },
      {
        saved: "America/New_York",
        detected: "Europe/Paris",
        dismissedAt: now - 3000,
      },
    ];

    const result = addDismissedPrompt(
      existing,
      "America/New_York",
      "Asia/Tokyo",
    );

    expect(result).toHaveLength(3);
    // London and Paris should be unchanged
    expect(result).toContainEqual(existing[0]);
    expect(result).toContainEqual(existing[2]);
    // Tokyo should be updated
    const tokyoDismissal = result.find((p) => p.detected === "Asia/Tokyo");
    expect(tokyoDismissal?.dismissedAt).toBe(now);
  });
});
