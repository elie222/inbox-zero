import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    AUTO_ENABLE_ORG_ANALYTICS: false,
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

describe("organization analytics helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockEnv.AUTO_ENABLE_ORG_ANALYTICS = false;
  });

  it("requires member opt-in when auto enable is disabled", async () => {
    const {
      getOrgAdminAnalyticsMemberFilter,
      hasOrgAdminAnalyticsAccess,
      isOrgAdminAnalyticsAutoEnabled,
    } = await import("./analytics");

    expect(isOrgAdminAnalyticsAutoEnabled()).toBe(false);
    expect(hasOrgAdminAnalyticsAccess(false)).toBe(false);
    expect(hasOrgAdminAnalyticsAccess(true)).toBe(true);
    expect(getOrgAdminAnalyticsMemberFilter()).toEqual({
      allowOrgAdminAnalytics: true,
    });
  });

  it("treats analytics access as enabled for all members when configured", async () => {
    mockEnv.AUTO_ENABLE_ORG_ANALYTICS = true;

    const {
      getOrgAdminAnalyticsMemberFilter,
      hasOrgAdminAnalyticsAccess,
      isOrgAdminAnalyticsAutoEnabled,
    } = await import("./analytics");

    expect(isOrgAdminAnalyticsAutoEnabled()).toBe(true);
    expect(hasOrgAdminAnalyticsAccess(false)).toBe(true);
    expect(hasOrgAdminAnalyticsAccess(true)).toBe(true);
    expect(getOrgAdminAnalyticsMemberFilter()).toEqual({});
  });
});
