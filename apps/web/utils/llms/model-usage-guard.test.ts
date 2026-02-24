import { beforeEach, describe, expect, it, vi } from "vitest";
import { shouldForceNanoModel } from "@/utils/llms/model-usage-guard";
import { getWeeklyUsageCost } from "@/utils/redis/usage";
import { env } from "@/env";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis/usage", () => ({
  getWeeklyUsageCost: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AI_NANO_WEEKLY_SPEND_LIMIT_USD: undefined,
    NANO_LLM_PROVIDER: undefined,
    NANO_LLM_MODEL: undefined,
  },
}));

describe("shouldForceNanoModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env).AI_NANO_WEEKLY_SPEND_LIMIT_USD = undefined;
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
