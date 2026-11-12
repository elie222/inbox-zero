// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { claimAutomaticReload } from "./automatic-reload";

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("automatic update reloads", () => {
  it("stops retries for the same stale build even after the cooldown", () => {
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "old-build");
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(claimAutomaticReload()).toBe(true);
    now.mockReturnValue(2_000_000);
    expect(claimAutomaticReload()).toBe(false);
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "new-build");
    expect(claimAutomaticReload()).toBe(true);
  });

  it("shares a cooldown across builds and update triggers", () => {
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "old-build");
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(claimAutomaticReload()).toBe(true);
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "new-build");
    expect(claimAutomaticReload()).toBe(false);
  });

  it("bounds retries when no deployment id is available", () => {
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "");
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    expect(claimAutomaticReload()).toBe(true);
    now.mockReturnValue(1_000_000 + 4 * 60_000);
    expect(claimAutomaticReload()).toBe(false);
    now.mockReturnValue(1_000_000 + 24 * 60 * 60_000);
    expect(claimAutomaticReload()).toBe(true);
  });

  it("does not reload when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    expect(claimAutomaticReload()).toBe(false);
  });
});
