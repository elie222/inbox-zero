import { describe, expect, it } from "vitest";
import { isStaleAutomationJobRun } from "@/utils/automation-jobs/stale";

describe("isStaleAutomationJobRun", () => {
  it("returns false for recent runs", () => {
    const now = new Date("2026-03-04T16:00:00.000Z");
    const scheduledFor = new Date("2026-03-04T15:15:00.000Z");

    const stale = isStaleAutomationJobRun({ scheduledFor, now });

    expect(stale).toBe(false);
  });

  it("returns true for runs older than one hour", () => {
    const now = new Date("2026-03-04T16:00:00.000Z");
    const scheduledFor = new Date("2026-03-04T14:59:59.999Z");

    const stale = isStaleAutomationJobRun({ scheduledFor, now });

    expect(stale).toBe(true);
  });

  it("supports a custom max age", () => {
    const now = new Date("2026-03-04T16:00:00.000Z");
    const scheduledFor = new Date("2026-03-04T15:40:00.000Z");

    const stale = isStaleAutomationJobRun({
      scheduledFor,
      now,
      maxAgeMs: 15 * 60 * 1000,
    });

    expect(stale).toBe(true);
  });
});
