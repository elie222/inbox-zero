import type { JSONValue, ModelMessage } from "ai";
import { Provider } from "@/utils/llms/config";

type ProviderOptions = Record<string, Record<string, JSONValue>>;

// Providers that forward Anthropic-style `cache_control` markers to an Anthropic
// model: the native provider plus gateways that pass provider options through
// verbatim. The marker is namespaced under `anthropic`, so it is inert on any
// provider that doesn't recognize it — safe to attach for these, no-op elsewhere.
const ANTHROPIC_CACHE_CONTROL_PROVIDERS = new Set<string>([
  Provider.ANTHROPIC,
  Provider.OPENROUTER,
  Provider.AI_GATEWAY,
]);

// Providers whose models route through @ai-sdk/openai's chat model, which reads
// provider options under the "openai" namespace and forwards `promptCacheKey`
// (Azure included — createAzure builds an OpenAIChatLanguageModel). They cache
// prefixes automatically; the key only steers routing, so we set it per account.
// Azure Foundry is deliberately excluded: it's createOpenAICompatible({ name:
// "azure-foundry" }), which reads options under the "azure-foundry" namespace
// (not "openai") and serves non-OpenAI models, so `prompt_cache_key` is inert.
const OPENAI_PROMPT_CACHE_PROVIDERS = new Set<string>([
  Provider.OPEN_AI,
  Provider.AZURE,
]);

/**
 * Provider-level options that enable system-prompt caching, to be merged into
 * the options from buildProviderOptions. Only OpenAI-family providers need a
 * provider-level marker (a routing key). Anthropic and Bedrock mark the system
 * message instead (see buildCachedSystemMessages); Gemini caches implicitly;
 * local/CLI providers don't cache. Returns `{}` when there's nothing to add.
 */
export function getSystemCacheProviderOptions(
  provider: string,
  { cacheKey }: { cacheKey: string },
): ProviderOptions {
  if (OPENAI_PROMPT_CACHE_PROVIDERS.has(provider)) {
    return { openai: { promptCacheKey: cacheKey } };
  }
  return {};
}

/**
 * Restructures a { system, prompt } pair into [system, user] messages with a
 * cache breakpoint on the system message, so a stable system prefix is reused
 * across requests within the provider's cache TTL. The user message stays
 * unmarked — it's the volatile per-request part. Providers without an explicit
 * marker get plain messages and rely on implicit caching or none.
 */
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
  // Bedrock uses its own marker shape (`cachePoint`), read from
  // `providerOptions.bedrock.cachePoint` by @ai-sdk/amazon-bedrock.
  if (provider === Provider.BEDROCK) {
    return { bedrock: { cachePoint: { type: "default" } } };
  }
  return;
}
