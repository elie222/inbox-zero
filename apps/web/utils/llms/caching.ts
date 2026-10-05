import type { JSONValue, ModelMessage } from "ai";
import { Provider } from "@/utils/llms/config";

type ProviderOptions = Record<string, Record<string, JSONValue>>;

// Gateways here pass `anthropic` provider options through to Anthropic models.
const ANTHROPIC_CACHE_CONTROL_PROVIDERS = new Set<string>([
  Provider.ANTHROPIC,
  Provider.OPENROUTER,
  Provider.AI_GATEWAY,
]);

// Azure Foundry is openai-compatible, so it ignores `openai` provider options.
const OPENAI_PROMPT_CACHE_PROVIDERS = new Set<string>([
  Provider.OPEN_AI,
  Provider.AZURE,
]);

export function getSystemCacheProviderOptions(
  provider: string,
  { cacheKey }: { cacheKey: string },
): ProviderOptions {
  if (OPENAI_PROMPT_CACHE_PROVIDERS.has(provider)) {
    return { openai: { promptCacheKey: cacheKey } };
  }
  return {};
}

export function buildCachedSystemMessages({
  system,
  prompt,
  provider,
}: {
  system: string;
  prompt: string;
  provider: string;
}): ModelMessage[] {
  const cacheMarker = getSystemMessageCacheMarker(provider);

  return [
    {
      role: "system",
      content: system,
      ...(cacheMarker ? { providerOptions: cacheMarker } : {}),
    },
    { role: "user", content: prompt },
  ];
}

function getSystemMessageCacheMarker(
  provider: string,
): ProviderOptions | undefined {
  if (ANTHROPIC_CACHE_CONTROL_PROVIDERS.has(provider)) {
    return { anthropic: { cacheControl: { type: "ephemeral" } } };
  }
  if (provider === Provider.BEDROCK) {
    return { bedrock: { cachePoint: { type: "default" } } };
  }
  return;
}
