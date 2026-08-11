import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  isIntegrationActionEnabledForEmailAccountId,
  isIntegrationActionEnabledForUserId,
} from "@/utils/integration-action.server";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const { mockEnv, mockEvaluateFlags, mockIsEnabled } = vi.hoisted(() => ({
  mockEnv: { integrationActionEnabled: false },
  mockEvaluateFlags: vi.fn(),
  mockIsEnabled: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: "test-key",
    get NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED() {
      return mockEnv.integrationActionEnabled;
    },
  },
}));

vi.mock("@/utils/posthog", () => ({
  getPosthogLlmClient: () => ({ evaluateFlags: mockEvaluateFlags }),
}));

describe("integration action feature access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.integrationActionEnabled = false;
    mockIsEnabled.mockReturnValue(false);
    mockEvaluateFlags.mockResolvedValue({ isEnabled: mockIsEnabled });
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
    } as never);
  });

  it("allows the global environment override", async () => {
    mockEnv.integrationActionEnabled = true;

    await expect(isIntegrationActionEnabledForUserId("user-id")).resolves.toBe(
      true,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockEvaluateFlags).not.toHaveBeenCalled();
  });

  it("uses the dedicated PostHog flag for early access", async () => {
    mockIsEnabled.mockReturnValue(true);

    await expect(isIntegrationActionEnabledForUserId("user-id")).resolves.toBe(
      true,
    );
    expect(mockIsEnabled).toHaveBeenCalledWith("integration-actions");
  });

  it("fails closed when PostHog evaluation fails", async () => {
    mockEvaluateFlags.mockRejectedValue(new Error("unavailable"));

    await expect(isIntegrationActionEnabledForUserId("user-id")).resolves.toBe(
      false,
    );
  });

  it("evaluates the email account owner's PostHog identity", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      user: { email: "user@example.com" },
    } as never);
    mockIsEnabled.mockReturnValue(true);

    await expect(
      isIntegrationActionEnabledForEmailAccountId("email-account-id"),
    ).resolves.toBe(true);
    expect(mockEvaluateFlags).toHaveBeenCalledWith("user@example.com", {
      flagKeys: ["integration-actions"],
    });
  });
});
