import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertTrialAiUsageAllowed,
  shouldForceNanoModel,
  TRIAL_AI_LIMIT_REACHED_MESSAGE,
} from "@/utils/llms/model-usage-guard";
import { getWeeklyUsageCost } from "@/utils/redis/usage";
import { env } from "@/env";
import prisma from "@/utils/__mocks__/prisma";
import {
  addUserErrorMessageWithNotification,
  ErrorType,
} from "@/utils/error-messages";
import { SafeError } from "@/utils/error";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis/usage", () => ({
  getWeeklyUsageCost: vi.fn(),
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/error-messages", () => ({
  ErrorType: {
    TRIAL_AI_LIMIT_REACHED: "Trial AI limit reached",
  },
  addUserErrorMessageWithNotification: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AI_NANO_WEEKLY_SPEND_LIMIT_USD: undefined,
    AI_TRIAL_WEEKLY_SPEND_LIMIT_USD: undefined,
    NANO_LLM_PROVIDER: undefined,
    NANO_LLM_MODEL: undefined,
  },
}));

describe("shouldForceNanoModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = undefined;
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = undefined;
    vi.mocked(env).NANO_LLM_PROVIDER = undefined;
    vi.mocked(env).NANO_LLM_MODEL = undefined;
  });

  it("does not force nano when the spend limit is not configured", async () => {
    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "assistant-chat",
    });

    expect(result.shouldForce).toBe(false);
    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
  });

  it("does not force nano for users with their own API key", async () => {
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = 3;
    vi.mocked(env).NANO_LLM_PROVIDER = "openai";
    vi.mocked(env).NANO_LLM_MODEL = "gpt-5-nano";

    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: true,
      label: "assistant-chat",
    });

    expect(result.shouldForce).toBe(false);
    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
  });

  it("does not force nano when nano model is not configured", async () => {
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = 3;

    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "assistant-chat",
    });

    expect(result.shouldForce).toBe(false);
    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
  });

  it("forces nano when weekly spend meets the configured limit", async () => {
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = 3;
    vi.mocked(env).NANO_LLM_PROVIDER = "openai";
    vi.mocked(env).NANO_LLM_MODEL = "gpt-5-nano";
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3.25);

    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "assistant-chat",
    });

    expect(result.shouldForce).toBe(true);
    expect(result.weeklySpendUsd).toBe(3.25);
    expect(result.weeklyLimitUsd).toBe(3);
  });

  it("does not force nano when weekly spend is below the limit", async () => {
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = 3;
    vi.mocked(env).NANO_LLM_PROVIDER = "openai";
    vi.mocked(env).NANO_LLM_MODEL = "gpt-5-nano";
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(2.99);

    const result = await shouldForceNanoModel({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "assistant-chat",
    });

    expect(result.shouldForce).toBe(false);
    expect(result.weeklySpendUsd).toBe(2.99);
    expect(result.weeklyLimitUsd).toBe(3);
  });
});

describe("assertTrialAiUsageAllowed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = undefined;
  });

  it("does nothing when trial spend limit is not configured", async () => {
    await assertTrialAiUsageAllowed({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "Choose rule",
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not block users with their own API key", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;

    await assertTrialAiUsageAllowed({
      userEmail: "user@example.com",
      hasUserApiKey: true,
      label: "Choose rule",
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("does not block paid subscriptions over the trial limit", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3);
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        stripeSubscriptionStatus: "active",
        lemonSubscriptionStatus: null,
      },
      errorMessages: null,
    } as any);

    await assertTrialAiUsageAllowed({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "Choose rule",
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(addUserErrorMessageWithNotification).not.toHaveBeenCalled();
  });

  it("blocks trial users over the spend limit and stores an upgrade alert", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3);
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        stripeSubscriptionStatus: "trialing",
        lemonSubscriptionStatus: null,
      },
      errorMessages: null,
    } as any);

    await expect(
      assertTrialAiUsageAllowed({
        userEmail: "user@example.com",
        hasUserApiKey: false,
        label: "Choose rule",
        userId: "user-1",
        emailAccountId: "account-1",
      }),
    ).rejects.toThrow(SafeError);

    expect(addUserErrorMessageWithNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        userEmail: "user@example.com",
        emailAccountId: "account-1",
        errorType: ErrorType.TRIAL_AI_LIMIT_REACHED,
        errorMessage: TRIAL_AI_LIMIT_REACHED_MESSAGE,
      }),
    );
  });

  it("does not rewrite an existing trial limit alert on every blocked call", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3);
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        stripeSubscriptionStatus: "trialing",
        lemonSubscriptionStatus: null,
      },
      errorMessages: {
        [ErrorType.TRIAL_AI_LIMIT_REACHED]: {
          message: TRIAL_AI_LIMIT_REACHED_MESSAGE,
        },
      },
    } as any);

    await expect(
      assertTrialAiUsageAllowed({
        userEmail: "user@example.com",
        hasUserApiKey: false,
        label: "Choose rule",
        userId: "user-1",
        emailAccountId: "account-1",
      }),
    ).rejects.toThrow(SafeError);

    expect(addUserErrorMessageWithNotification).not.toHaveBeenCalled();
  });
});
