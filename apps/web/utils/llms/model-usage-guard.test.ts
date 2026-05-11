import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertTrialAiUsageAllowed,
  getUserTrialAiUsageLimitStatus,
  shouldForceNanoModel,
  TRIAL_AI_LIMIT_REACHED_MESSAGE,
} from "@/utils/llms/model-usage-guard";
import { getWeeklyUsageCost } from "@/utils/redis/usage";
import { env } from "@/env";
import prisma from "@/utils/__mocks__/prisma";
import { SafeError } from "@/utils/error";
import { redis } from "@/utils/redis";
import { sendActionRequiredEmail } from "@inboxzero/resend";
import { createUnsubscribeToken } from "@/utils/unsubscribe";

vi.mock("@/utils/redis/usage", () => ({
  getWeeklyUsageCost: vi.fn(),
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/utils/prisma");

vi.mock("@inboxzero/resend", () => ({
  sendActionRequiredEmail: vi.fn(),
}));

vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AI_NANO_WEEKLY_SPEND_LIMIT_USD: undefined,
    AI_TRIAL_WEEKLY_SPEND_LIMIT_USD: undefined,
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    RESEND_FROM_EMAIL: "support@example.com",
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
      userId: "user-1",
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
      userId: "user-1",
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
      userId: "user-1",
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
      userId: "user-1",
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
      email: "user@example.com",
      emailAccounts: [{ email: "account@example.com" }],
      premium: {
        stripeSubscriptionStatus: "active",
        lemonSubscriptionStatus: null,
      },
    } as any);

    await assertTrialAiUsageAllowed({
      userEmail: "user@example.com",
      hasUserApiKey: false,
      label: "Choose rule",
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(sendActionRequiredEmail).not.toHaveBeenCalled();
  });

  it("blocks trial users over the spend limit and sends an upgrade email once", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3);
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(createUnsubscribeToken).mockResolvedValue("unsubscribe-token");
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      emailAccounts: [{ email: "account@example.com" }],
      premium: {
        stripeSubscriptionStatus: "trialing",
        lemonSubscriptionStatus: null,
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

    expect(getWeeklyUsageCost).toHaveBeenCalledWith({
      userId: "user-1",
      legacyEmails: ["user@example.com", "account@example.com"],
    });
    expect(redis.set).toHaveBeenCalledWith(
      "trial-ai-limit-notification:user-1",
      expect.any(String),
      { ex: 5_184_000, nx: true },
    );
    expect(sendActionRequiredEmail).toHaveBeenCalledWith({
      from: "support@example.com",
      to: "user@example.com",
      emailProps: {
        baseUrl: "https://example.com",
        email: "user@example.com",
        unsubscribeToken: "unsubscribe-token",
        errorType: "Trial AI Limit Reached",
        errorMessage: TRIAL_AI_LIMIT_REACHED_MESSAGE,
        actionUrl: "/premium",
        actionLabel: "Start paid plan now",
      },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("does not resend a trial limit email when the notification marker exists", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3);
    vi.mocked(redis.set).mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      emailAccounts: [{ email: "account@example.com" }],
      premium: {
        stripeSubscriptionStatus: "trialing",
        lemonSubscriptionStatus: null,
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

    expect(sendActionRequiredEmail).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("getUserTrialAiUsageLimitStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = undefined;
  });

  it("returns allowed when trial spend limit is not configured", async () => {
    const status = await getUserTrialAiUsageLimitStatus({
      userId: "user-1",
    });

    expect(status).toEqual({ status: "allowed" });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns allowed for paid users without checking usage", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      aiApiKey: null,
      emailAccounts: [{ email: "account@example.com" }],
      premium: {
        stripeSubscriptionStatus: "active",
        lemonSubscriptionStatus: null,
      },
    } as any);

    const status = await getUserTrialAiUsageLimitStatus({
      userId: "user-1",
    });

    expect(status).toEqual({ status: "allowed" });
    expect(getWeeklyUsageCost).not.toHaveBeenCalled();
  });

  it("returns a dynamic trial limit status for trial users over the limit", async () => {
    vi.mocked(env).AI_TRIAL_WEEKLY_SPEND_LIMIT_USD = 2;
    vi.mocked(getWeeklyUsageCost).mockResolvedValue(3);
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      aiApiKey: null,
      emailAccounts: [{ email: "account@example.com" }],
      premium: {
        stripeSubscriptionStatus: "trialing",
        lemonSubscriptionStatus: null,
      },
    } as any);

    const status = await getUserTrialAiUsageLimitStatus({
      userId: "user-1",
    });

    expect(getWeeklyUsageCost).toHaveBeenCalledWith({
      userId: "user-1",
      legacyEmails: ["user@example.com", "account@example.com"],
    });
    expect(status).toEqual({
      status: "trial_ai_limit_reached",
      message: TRIAL_AI_LIMIT_REACHED_MESSAGE,
      weeklySpendUsd: 3,
      weeklyLimitUsd: 2,
    });
  });
});
