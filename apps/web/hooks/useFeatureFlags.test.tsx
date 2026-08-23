// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMailboxSyncEnabled } from "./useFeatureFlags";

const featureFlags = vi.hoisted(() => ({
  enabled: vi.fn(),
}));

vi.mock("posthog-js/react", () => ({
  useFeatureFlagEnabled: featureFlags.enabled,
  useFeatureFlagVariantKey: vi.fn(),
}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/utils/integration-action", () => ({
  INTEGRATION_ACTION_FEATURE_FLAG: "integration-action",
  isIntegrationActionGloballyEnabled: () => false,
}));

describe("useMailboxSyncEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { flag: undefined, syncEnabled: true },
    { flag: false, syncEnabled: true },
    { flag: true, syncEnabled: false },
  ])("returns $syncEnabled when the kill switch is $flag", ({
    flag,
    syncEnabled,
  }) => {
    featureFlags.enabled.mockReturnValue(flag);

    const { result } = renderHook(() => useMailboxSyncEnabled());

    expect(result.current).toBe(syncEnabled);
    expect(featureFlags.enabled).toHaveBeenCalledWith("mailbox-sync-disabled");
  });
});
