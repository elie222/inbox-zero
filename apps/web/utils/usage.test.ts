import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LanguageModelUsage } from "ai";
import { OPENROUTER_MODEL_PRICING } from "@/utils/llms/pricing.generated";
import { calculateUsageCost, saveAiUsage } from "./usage";
import { publishAiCall } from "@inboxzero/tinybird-ai-analytics";
import { saveUsage } from "@/utils/redis/usage";

vi.mock("@inboxzero/tinybird-ai-analytics", () => ({
  publishAiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/redis/usage", () => ({
  saveUsage: vi.fn().mockResolvedValue(undefined),
}));

describe("calculateUsageCost", () => {
  it("applies cached input pricing when cached tokens are present", () => {
    const provider = "openrouter";
    const model = "openai/gpt-5.1";
    const pricing = OPENROUTER_MODEL_PRICING["gpt-5.1"];

    expect(pricing).toBeDefined();
    if (!pricing) throw new Error("Expected pricing for gpt-5.1");

    const usage: LanguageModelUsage = {
      inputTokens: 1_000,
      cachedInputTokens: 400,
      outputTokens: 200,
      totalTokens: 1_200,
    };

    const expected =
      (usage.inputTokens! - usage.cachedInputTokens!) * pricing.input +
      usage.cachedInputTokens! * pricing.cachedInput +
      usage.outputTokens! * pricing.output;

    expect(calculateUsageCost({ provider, model, usage })).toBe(expected);
  });

  it("uses fallback pricing first for non-openrouter providers", () => {
    const provider = "openai";
    const model = "gpt-4o";
    const usage: LanguageModelUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    };

    // Fallback map values in supported-model-pricing.ts for gpt-4o
    const expected =
      usage.inputTokens! * (5 / 1_000_000) +
      usage.outputTokens! * (15 / 1_000_000);

    expect(calculateUsageCost({ provider, model, usage })).toBe(expected);
  });

  it("normalizes online suffix model ids for lookup", () => {
    const provider = "openrouter";
    const model = "openai/gpt-5.1:online";
    const baseModel = "gpt-5.1";
    const pricing = OPENROUTER_MODEL_PRICING[baseModel];
    if (!pricing) throw new Error("Expected pricing for gpt-5.1");

    const usage: LanguageModelUsage = {
      inputTokens: 500,
      cachedInputTokens: 100,
      outputTokens: 75,
      totalTokens: 575,
    };

    const expected =
      (usage.inputTokens! - usage.cachedInputTokens!) * pricing.input +
      usage.cachedInputTokens! * pricing.cachedInput +
      usage.outputTokens! * pricing.output;

    expect(calculateUsageCost({ provider, model, usage })).toBe(expected);
  });

  it("clamps cached input tokens to the valid range", () => {
    const provider = "openrouter";
    const model = "openai/gpt-5.1";
    const pricing = OPENROUTER_MODEL_PRICING["gpt-5.1"];
    if (!pricing) throw new Error("Expected pricing for gpt-5.1");

    const usage: LanguageModelUsage = {
      inputTokens: 100,
      cachedInputTokens: 300,
      outputTokens: 20,
      totalTokens: 120,
    };

    const expected = 100 * pricing.cachedInput + 20 * pricing.output;

    expect(calculateUsageCost({ provider, model, usage })).toBe(expected);
  });

  it("returns zero when pricing is unavailable", () => {
    const usage: LanguageModelUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    };

    expect(
      calculateUsageCost({
        provider: "openai",
        model: "model-that-does-not-exist",
        usage,
      }),
    ).toBe(0);
  });
});

describe("saveAiUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("publishes cached and reasoning token counts to analytics", async () => {
    const usage: LanguageModelUsage = {
      inputTokens: 700,
      cachedInputTokens: 300,
      outputTokens: 150,
      reasoningTokens: 25,
      totalTokens: 850,
    };

    await saveAiUsage({
      email: "user@example.com",
      provider: "openai",
      model: "openai/gpt-5.1",
      usage,
      label: "assistant-chat",
    });

    expect(publishAiCall).toHaveBeenCalledTimes(1);
    expect(publishAiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user@example.com",
        cachedInputTokens: 300,
        reasoningTokens: 25,
      }),
    );

    expect(saveUsage).toHaveBeenCalledTimes(1);
    expect(saveUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        usage,
        cost: calculateUsageCost({
          provider: "openai",
          model: "openai/gpt-5.1",
          usage,
        }),
      }),
    );
  });
});
