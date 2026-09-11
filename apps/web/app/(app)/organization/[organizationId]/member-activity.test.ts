import { describe, expect, it } from "vitest";
import { getMemberActivityStatus } from "./member-activity";

describe("getMemberActivityStatus", () => {
  const now = new Date("2026-05-29T00:00:00.000Z");

  it("treats disconnected accounts as disconnected before evaluating activity", () => {
    expect(
      getMemberActivityStatus({
        allowOrgAdminAnalytics: true,
        disconnectedAt: new Date("2026-05-28T00:00:00.000Z"),
        lastProcessedEmailAt: new Date("2026-05-28T00:00:00.000Z"),
        now,
      }),
    ).toBe("disconnected");
  });

  it("hides processing activity when org analytics are not allowed", () => {
    expect(
      getMemberActivityStatus({
        allowOrgAdminAnalytics: false,
        lastProcessedEmailAt: new Date("2026-05-28T00:00:00.000Z"),
        now,
      }),
    ).toBe("hidden");
  });

  it("marks recently processed accounts as active", () => {
    expect(
      getMemberActivityStatus({
        allowOrgAdminAnalytics: true,
        lastProcessedEmailAt: new Date("2026-05-28T00:01:00.000Z"),
        now,
      }),
    ).toBe("active");
  });

  it("marks accounts without recent processing as inactive", () => {
    expect(
      getMemberActivityStatus({
        allowOrgAdminAnalytics: true,
        lastProcessedEmailAt: new Date("2026-05-27T23:59:00.000Z"),
        now,
      }),
    ).toBe("inactive");
  });

  it("separates no processing history from stale processing history", () => {
    expect(
      getMemberActivityStatus({
        allowOrgAdminAnalytics: true,
        lastProcessedEmailAt: null,
        now,
      }),
    ).toBe("none");
  });
});
