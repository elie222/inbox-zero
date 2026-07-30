import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    bypassPremiumChecks: false,
    aiModelSettingsDisabled: false,
    webhookActionEnabled: true as boolean | undefined,
    externalApiEnabled: false as boolean | undefined,
  },
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS() {
      return mockEnv.bypassPremiumChecks;
    },
    get NEXT_PUBLIC_AI_MODEL_SETTINGS_DISABLED() {
      return mockEnv.aiModelSettingsDisabled;
    },
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionEnabled;
    },
    get NEXT_PUBLIC_EXTERNAL_API_ENABLED() {
      return mockEnv.externalApiEnabled;
    },
  },
}));

import { getVisibleSettingsSections } from "./sections";

function visibleIds() {
  return getVisibleSettingsSections().map((section) => section.id);
}

describe("getVisibleSettingsSections", () => {
  beforeEach(() => {
    mockEnv.bypassPremiumChecks = false;
    mockEnv.aiModelSettingsDisabled = false;
    mockEnv.webhookActionEnabled = true;
    mockEnv.externalApiEnabled = false;
  });

  it("always lists the ungated sections", () => {
    expect(visibleIds()).toEqual(
      expect.arrayContaining(["features", "email-accounts", "team", "account"]),
    );
  });

  // The sidebar builds its links from this list. If it disagreed with the
  // page's own gating it would link to sections that never render.
  it("hides billing when premium checks are bypassed", () => {
    expect(visibleIds()).toContain("billing");

    mockEnv.bypassPremiumChecks = true;
    expect(visibleIds()).not.toContain("billing");
  });

  it("hides the AI model section when model settings are disabled", () => {
    expect(visibleIds()).toContain("ai-model");

    mockEnv.aiModelSettingsDisabled = true;
    expect(visibleIds()).not.toContain("ai-model");
  });

  it("hides developer only when both webhooks and the external API are off", () => {
    expect(visibleIds()).toContain("developer");

    mockEnv.webhookActionEnabled = false;
    expect(visibleIds()).not.toContain("developer");

    mockEnv.externalApiEnabled = true;
    expect(visibleIds()).toContain("developer");
  });
});
