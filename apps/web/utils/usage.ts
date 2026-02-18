/** biome-ignore-all lint/style/noMagicNumbers: we're defining constants */
import type { LanguageModelUsage } from "ai";
import { saveUsage } from "@/utils/redis/usage";
import { OPENROUTER_MODEL_PRICING } from "@/utils/llms/pricing.generated";
import {
  STATIC_MODEL_PRICING,
  type ModelPricing,
} from "@/utils/llms/supported-model-pricing";
import { publishAiCall } from "@inboxzero/tinybird-ai-analytics";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("usage");

export async function saveAiUsage({
  email,
  provider,
  model,
  usage,
  label,
}: {
  email: string;
  provider: string;
  model: string;
  usage: LanguageModelUsage;
  label: string;
}) {
  const cost = calculateUsageCost({ provider, model, usage });

  try {
    return Promise.all([
      publishAiCall({
        userId: email,
        provider,
        model,
        totalTokens: usage.totalTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        promptTokens: usage.inputTokens ?? 0,
        cachedInputTokens: usage.cachedInputTokens ?? 0,
        reasoningTokens: usage.reasoningTokens ?? 0,
        cost,
        timestamp: Date.now(),
        label,
      }),
      saveUsage({ email, cost, usage }),
    ]);
  } catch (error) {
    logger.error("Failed to save usage", { error });
  }
}

export function calculateUsageCost(options: {
  provider: string;
  model: string;
  usage: LanguageModelUsage;
}): number {
  const { provider, model, usage } = options;
  const pricing = getModelPricing({ provider, model });
  if (!pricing) return 0;

  const inputTokens = Math.max(0, usage.inputTokens ?? 0);
  const rawCachedInputTokens = usage.cachedInputTokens ?? 0;
  const cachedInputTokens = Math.min(
    inputTokens,
    Math.max(0, rawCachedInputTokens),
  );
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const outputTokens = Math.max(0, usage.outputTokens ?? 0);
  const cachedInputTokenPrice = pricing.cachedInput ?? pricing.input;

  if (rawCachedInputTokens !== cachedInputTokens) {
    logger.warn("Normalized cached input tokens for usage cost", {
      provider,
      model,
      inputTokens,
      rawCachedInputTokens,
      cachedInputTokens,
    });
  }

  return (
    uncachedInputTokens * pricing.input +
    cachedInputTokens * cachedInputTokenPrice +
    outputTokens * pricing.output
  );
}

function getModelPricing(options: {
  provider: string;
  model: string;
}): ModelPricing | undefined {
  const { provider, model } = options;

  for (const candidate of buildModelLookupCandidates(model)) {
    if (provider === "openrouter") {
      const openRouterPricing = OPENROUTER_MODEL_PRICING[candidate];
      if (openRouterPricing) return openRouterPricing;
    }

    const fallbackPricing = STATIC_MODEL_PRICING[candidate];
    if (fallbackPricing) return fallbackPricing;

    if (provider !== "openrouter") {
      const openRouterPricing = OPENROUTER_MODEL_PRICING[candidate];
      if (openRouterPricing) return openRouterPricing;
    }
  }

  return undefined;
}

function buildModelLookupCandidates(model: string): string[] {
  const noOnlineSuffix = model.endsWith(":online")
    ? model.slice(0, -":online".length)
    : model;

  const candidates = [model, noOnlineSuffix];
  const unprefixed = noOnlineSuffix.includes("/")
    ? noOnlineSuffix.split("/").at(-1)
    : null;

  if (unprefixed) candidates.push(unprefixed);

  return [...new Set(candidates)];
}
