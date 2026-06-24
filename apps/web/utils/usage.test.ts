import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LanguageModelUsage } from "ai";
import { OPENROUTER_MODEL_PRICING } from "@/utils/llms/pricing.generated";
import { calculateUsageCost, saveAiUsage, subscribeToAiUsage } from "./usage";
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
      inputTokens: 1000,
      cachedInputTokens: 400,
      outputTokens: 200,
      totalTokens: 1200,
    };

    const expected =
      (usage.inputTokens! - usage.cachedInputTokens!) * pricing.input +
      usage.cachedInputTokens! * pricing.cachedInput +
      usage.outputTokens! * pricing.output;

    expect(calculateUsageCost({ provider, model, usage })).toBe(expected);
  });

  it("charges reasoning tokens at the output rate", () => {
    const provider = "openrouter";
    const model = "openai/gpt-5.1";
    const pricing = OPENROUTER_MODEL_PRICING["gpt-5.1"];

    expect(pricing).toBeDefined();
    if (!pricing) throw new Error("Expected pricing for gpt-5.1");

    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      outputTokens: 200,
      reasoningTokens: 50,
      totalTokens: 1200,
    };

    const expected =
      usage.inputTokens! * pricing.input +
      (usage.outputTokens! + usage.reasoningTokens!) * pricing.output;

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

  it("uses cached token count when input tokens are missing", () => {
    const provider = "openrouter";
    const model = "openai/gpt-5.1";
    const pricing = OPENROUTER_MODEL_PRICING["gpt-5.1"];
    if (!pricing) throw new Error("Expected pricing for gpt-5.1");

    const usage: LanguageModelUsage = {
      cachedInputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
    };

    const expected =
      usage.cachedInputTokens! * pricing.cachedInput +
      usage.outputTokens! * pricing.output;

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

  it("estimates DeepSeek V4 Flash costs", () => {
    const provider = "openrouter";
    const model = "deepseek/deepseek-v4-flash";
    const pricing = OPENROUTER_MODEL_PRICING[model];
    if (!pricing) throw new Error("Expected pricing for deepseek-v4-flash");

    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      cachedInputTokens: 250,
      outputTokens: 500,
      totalTokens: 1500,
    };

    const expected =
      750 * pricing.input + 250 * pricing.cachedInput + 500 * pricing.output;

    expect(calculateUsageCost({ provider, model, usage })).toBe(expected);
  });

  it("estimates current platform model costs", () => {
    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      cachedInputTokens: 250,
      outputTokens: 500,
      totalTokens: 1500,
    };

    expect(
      calculateUsageCost({
        provider: "azure-foundry",
        model: "DeepSeek-V4-Pro",
        usage,
      }),
    ).toBeCloseTo(
      750 * (1.925 / 1_000_000) +
        250 * (0.165 / 1_000_000) +
        500 * (3.828 / 1_000_000),
    );

    expect(
      calculateUsageCost({
        provider: "openrouter",
        model: "openai/gpt-5.4",
        usage,
      }),
    ).toBeCloseTo(
      750 * (2.5 / 1_000_000) +
        250 * (0.25 / 1_000_000) +
        500 * (15 / 1_000_000),
    );

    expect(
      calculateUsageCost({
        provider: "perplexity",
        model: "sonar-pro",
        usage,
      }),
    ).toBeCloseTo(1000 * (3 / 1_000_000) + 500 * (15 / 1_000_000));
  });

  it("resolves prefixed OpenRouter pricing for non-prefixed model names", () => {
    const usage: LanguageModelUsage = {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    };

    const pricing = OPENROUTER_MODEL_PRICING["anthropic/claude-sonnet-4.5"];
    if (!pricing)
      throw new Error("Expected pricing for anthropic/claude-sonnet-4.5");

    const expected =
      usage.inputTokens! * pricing.input + usage.outputTokens! * pricing.output;

    expect(
      calculateUsageCost({
        provider: "anthropic",
        model: "claude-sonnet-4.5",
        usage,
      }),
    ).toBe(expected);
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
      userId: "user-1",
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "openai",
      model: "openai/gpt-5.1",
      usage,
      label: "assistant-chat",
    });

    expect(publishAiCall).toHaveBeenCalledTimes(1);
    expect(publishAiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailAccountId: "email-account-1",
        cachedInputTokens: 300,
        reasoningTokens: 25,
        estimatedCost: calculateUsageCost({
          provider: "openai",
          model: "openai/gpt-5.1",
          usage,
        }),
        isUserApiKey: 0,
      }),
    );

    expect(saveUsage).toHaveBeenCalledTimes(1);
    expect(saveUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailAccountId: "email-account-1",
        usage,
        cost: calculateUsageCost({
          provider: "openai",
          model: "openai/gpt-5.1",
          usage,
        }),
      }),
    );
  });

  it("sets platform cost to zero for user API key traffic", async () => {
    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      outputTokens: 400,
      totalTokens: 1400,
    };

    const estimatedCost = calculateUsageCost({
      provider: "openrouter",
      model: "openai/gpt-5.1",
      usage,
    });

    await saveAiUsage({
      userId: "user-1",
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "openrouter",
      model: "openai/gpt-5.1",
      usage,
      label: "assistant-chat",
      hasUserApiKey: true,
    });

    expect(publishAiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailAccountId: "email-account-1",
        cost: 0,
        estimatedCost,
        isUserApiKey: 1,
      }),
    );

    expect(saveUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailAccountId: "email-account-1",
        usage,
        cost: 0,
      }),
    );
  });

  it("uses provider-reported cost for platform spend", async () => {
    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      outputTokens: 400,
      reasoningTokens: 200,
      totalTokens: 1400,
    };

    const estimatedCost = calculateUsageCost({
      provider: "openrouter",
      model: "openai/gpt-5.1",
      usage,
    });

    await saveAiUsage({
      userId: "user-1",
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "openrouter",
      model: "openai/gpt-5.1",
      usage,
      label: "assistant-chat",
      providerReportedCost: 1.2345,
      providerUpstreamInferenceCost: 0.3456,
      providerCostSource: "openrouter_usage",
      stepCount: 4,
      toolCallCount: 3,
    });

    expect(publishAiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        cost: 1.2345,
        estimatedCost,
        providerReportedCost: 1.2345,
        providerUpstreamInferenceCost: 0.3456,
        providerCostSource: "openrouter_usage",
        stepCount: 4,
        toolCallCount: 3,
      }),
    );

    expect(saveUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailAccountId: "email-account-1",
        usage,
        cost: 1.2345,
      }),
    );
  });

  it("uses estimated cost when provider-reported cost is zero", async () => {
    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      outputTokens: 400,
      totalTokens: 1400,
    };
    const estimatedCost = calculateUsageCost({
      provider: "openrouter",
      model: "openai/gpt-5.1",
      usage,
    });

    expect(estimatedCost).toBeGreaterThan(0);

    await saveAiUsage({
      userId: "user-1",
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "openrouter",
      model: "openai/gpt-5.1",
      usage,
      label: "assistant-chat",
      providerReportedCost: 0,
      providerCostSource: "openrouter_usage",
    });

    expect(publishAiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        cost: estimatedCost,
        estimatedCost,
        providerReportedCost: 0,
      }),
    );

    expect(saveUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailAccountId: "email-account-1",
        usage,
        cost: estimatedCost,
      }),
    );
  });

  it("keeps zero provider-reported cost when pricing is unavailable", async () => {
    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      outputTokens: 400,
      totalTokens: 1400,
    };

    await saveAiUsage({
      userId: "user-1",
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "openrouter",
      model: "model-without-local-pricing",
      usage,
      label: "assistant-chat",
      providerReportedCost: 0,
      providerCostSource: "openrouter_usage",
    });

    expect(publishAiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        cost: 0,
        estimatedCost: 0,
        providerReportedCost: 0,
      }),
    );

    expect(saveUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailAccountId: "email-account-1",
        usage,
        cost: 0,
      }),
    );
  });

  it("uses upstream inference cost when provider cost is unavailable", async () => {
    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      outputTokens: 400,
      totalTokens: 1400,
    };

    await saveAiUsage({
      userId: "user-1",
      email: "user@example.com",
      emailAccountId: "email-account-1",
      provider: "openrouter",
      model: "model-without-local-pricing",
      usage,
      label: "assistant-chat",
      providerUpstreamInferenceCost: 0.3456,
      providerCostSource: "openrouter_usage",
    });

    expect(publishAiCall).toHaveBeenCalledWith(
      expect.objectContaining({
        cost: 0.3456,
        estimatedCost: 0,
        providerUpstreamInferenceCost: 0.3456,
      }),
    );

    expect(saveUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailAccountId: "email-account-1",
        usage,
        cost: 0.3456,
      }),
    );
  });

  it("notifies usage listeners with estimated and provider-reported costs", async () => {
    const usage: LanguageModelUsage = {
      inputTokens: 1000,
      outputTokens: 400,
      totalTokens: 1400,
    };
    const estimatedCost = calculateUsageCost({
      provider: "openrouter",
      model: "deepseek/deepseek-v4-flash",
      usage,
    });
    const listener = vi.fn();
    const unsubscribe = subscribeToAiUsage(listener);

    try {
      await saveAiUsage({
        userId: "user-1",
        email: "user@example.com",
        emailAccountId: "email-account-1",
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        usage,
        label: "eval-test",
        providerReportedCost: 0.000_18,
      });
    } finally {
      unsubscribe();
    }

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        model: "deepseek/deepseek-v4-flash",
        label: "eval-test",
        estimatedCost,
        platformCost: 0.000_18,
        providerReportedCost: 0.000_18,
        inputTokens: 1000,
        outputTokens: 400,
        totalTokens: 1400,
      }),
    );
  });
});
