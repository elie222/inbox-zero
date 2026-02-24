import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAzure } from "@ai-sdk/azure";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway } from "@ai-sdk/gateway";
import { createOllama } from "ollama-ai-provider-v2";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "@/env";
import { Provider } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";

// Thinking budget for Google models (set low to minimize cost)
const GOOGLE_THINKING_BUDGET = 0;
const LEGACY_OPENROUTER_BACKUP_DEFAULT_MODEL = "google/gemini-2.5-flash";

const logger = createScopedLogger("llms/model");

export type ModelType = "default" | "economy" | "chat" | "nano";

export type ResolvedModel = {
  provider: string;
  modelName: string;
  model: LanguageModelV3;
  providerOptions?: Record<string, any>;
};

export type SelectModel = ResolvedModel & {
  fallbackModels: ResolvedModel[];
  hasUserApiKey: boolean;
};

export function getModel(
  userAi: UserAIFields,
  modelType: ModelType = "default",
  online = false,
): SelectModel {
  const primaryModel = selectModelByType(userAi, modelType, online);
  const fallbackModels = getFallbackModels({
    userAi,
    modelType,
    primaryModel,
    online,
  });

  logger.info("Using model", {
    modelType,
    provider: primaryModel.provider,
    model: primaryModel.modelName,
    providerOptions: primaryModel.providerOptions,
    fallbackModels: fallbackModels.map(
      (fallback) => `${fallback.provider}:${fallback.modelName}`,
    ),
  });

  return { ...primaryModel, fallbackModels, hasUserApiKey: !!userAi.aiApiKey };
}

function selectModelByType(
  userAi: UserAIFields,
  modelType: ModelType,
  online = false,
): ResolvedModel {
  if (userAi.aiApiKey) return selectDefaultModel(userAi, online);

  switch (modelType) {
    case "economy":
      return selectEconomyModel(userAi, online);
    case "chat":
      return selectChatModel(userAi, online);
    case "nano":
      return selectNanoModel(userAi, online);
    default:
      return selectDefaultModel(userAi, online);
  }
}

function selectModel(
  {
    aiProvider,
    aiModel,
    aiApiKey,
  }: {
    aiProvider: string;
    aiModel: string | null;
    aiApiKey: string | null;
  },
  providerOptions?: Record<string, any>,
  online = false,
): ResolvedModel {
  switch (aiProvider) {
    case Provider.OPEN_AI: {
      const modelName = aiModel || "gpt-5.1";
      // When Zero Data Retention is enabled, set store: false to avoid
      // "Items are not persisted for Zero Data Retention organizations" errors
      // See: https://github.com/vercel/ai/issues/10060
      const baseOptions = providerOptions ?? {};
      const openAiProviderOptions = env.OPENAI_ZERO_DATA_RETENTION
        ? {
            ...baseOptions,
            openai: { ...(baseOptions.openai ?? {}), store: false },
          }
        : providerOptions;
      return {
        provider: Provider.OPEN_AI,
        modelName,
        model: createOpenAI({ apiKey: aiApiKey || env.OPENAI_API_KEY })(
          modelName,
        ),
        providerOptions: openAiProviderOptions,
      };
    }
    case Provider.AZURE: {
      const modelName = aiModel || "gpt-5-mini";
      const baseOptions = providerOptions ?? {};
      const resourceName = env.AZURE_RESOURCE_NAME;
      if (!resourceName) {
        throw new Error("AZURE_RESOURCE_NAME environment variable is not set");
      }

      return {
        provider: Provider.AZURE,
        modelName,
        model: createAzure({
          apiKey: aiApiKey || env.AZURE_API_KEY,
          resourceName,
          apiVersion: env.AZURE_API_VERSION,
        })(modelName),
        providerOptions: {
          ...baseOptions,
          openai: { ...(baseOptions.openai ?? {}), reasoningEffort: "low" },
        },
      };
    }
    case Provider.GOOGLE: {
      const mod = aiModel || "gemini-2.0-flash";
      return {
        provider: Provider.GOOGLE,
        modelName: mod,
        model: createGoogleGenerativeAI({
          apiKey: aiApiKey || env.GOOGLE_API_KEY,
        })(mod),
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: GOOGLE_THINKING_BUDGET,
            },
          } satisfies GoogleGenerativeAIProviderOptions,
        },
      };
    }
    case Provider.GROQ: {
      const modelName = aiModel || "llama-3.3-70b-versatile";
      return {
        provider: Provider.GROQ,
        modelName,
        model: createGroq({ apiKey: aiApiKey || env.GROQ_API_KEY })(modelName),
      };
    }
    case Provider.OPENROUTER: {
      let modelName = aiModel || "anthropic/claude-sonnet-4.5";
      if (online) modelName += ":online";

      const openrouter = createOpenRouter({
        apiKey: aiApiKey || env.OPENROUTER_API_KEY,
        headers: {
          "HTTP-Referer": "https://www.getinboxzero.com",
          "X-Title": "Inbox Zero",
        },
      });
      const chatModel = openrouter.chat(modelName);

      return {
        provider: Provider.OPENROUTER,
        modelName,
        model: chatModel,
        providerOptions,
      };
    }
    case Provider.AI_GATEWAY: {
      const modelName = aiModel || "google/gemini-3-flash";
      const aiGatewayApiKey = aiApiKey || env.AI_GATEWAY_API_KEY;
      const gateway = createGateway({ apiKey: aiGatewayApiKey });
      return {
        provider: Provider.AI_GATEWAY,
        modelName,
        model: gateway(modelName),
        providerOptions: {
          // Disable/cap thinking for Google models (Gemini)
          google: {
            thinkingConfig: {
              thinkingBudget: GOOGLE_THINKING_BUDGET,
            },
          } satisfies GoogleGenerativeAIProviderOptions,
          // Note: Anthropic thinking is disabled by default (not including the config)
        },
      };
    }
    case "ollama": {
      const modelName = env.OLLAMA_MODEL;
      if (!modelName)
        throw new Error("OLLAMA_MODEL environment variable is not set");
      return {
        provider: Provider.OLLAMA,
        modelName,
        model: createOllama({ baseURL: env.OLLAMA_BASE_URL })(modelName),
      };
    }
    case Provider.OPENAI_COMPATIBLE: {
      const modelName = aiModel || env.OPENAI_COMPATIBLE_MODEL;
      if (!modelName)
        throw new Error(
          "OPENAI_COMPATIBLE_MODEL environment variable is not set",
        );
      const baseURL =
        env.OPENAI_COMPATIBLE_BASE_URL || "http://localhost:1234/v1";
      const openaiCompatible = createOpenAICompatible({
        name: "openai-compatible",
        baseURL,
        ...(aiApiKey || env.OPENAI_COMPATIBLE_API_KEY
          ? { apiKey: aiApiKey || env.OPENAI_COMPATIBLE_API_KEY }
          : {}),
      });
      return {
        provider: Provider.OPENAI_COMPATIBLE,
        modelName,
        model: openaiCompatible(modelName),
      };
    }

    case Provider.BEDROCK: {
      const modelName =
        aiModel || "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
      return {
        provider: Provider.BEDROCK,
        modelName,
        // Based on: https://github.com/vercel/ai/issues/4996#issuecomment-2751630936
        model: createAmazonBedrock({
          region: env.BEDROCK_REGION,
          credentialProvider: async () => ({
            accessKeyId: env.BEDROCK_ACCESS_KEY!,
            secretAccessKey: env.BEDROCK_SECRET_KEY!,
            sessionToken: undefined,
          }),
        })(modelName),
        // Note: Anthropic thinking is disabled by default (not including the config)
      };
    }
    case Provider.ANTHROPIC: {
      const modelName = aiModel || "claude-sonnet-4-5-20250929";
      return {
        provider: Provider.ANTHROPIC,
        modelName,
        model: createAnthropic({
          apiKey: aiApiKey || env.ANTHROPIC_API_KEY,
        })(modelName),
        // Note: Anthropic thinking is disabled by default (not including the config)
      };
    }
    default: {
      logger.error("LLM provider not supported", { aiProvider });
      throw new Error(`LLM provider not supported: ${aiProvider}`);
    }
  }
}

/**
 * Creates OpenRouter provider options from a comma-separated string
 */
function createOpenRouterProviderOptions(
  providers: string,
): Record<string, any> {
  const order = providers
    .split(",")
    .map((p: string) => p.trim())
    .filter(Boolean);

  return {
    openrouter: {
      provider: order.length > 0 ? { order } : undefined,
      reasoning: { max_tokens: 20 },
    },
  };
}

/**
 * Selects the appropriate economy model for high-volume or context-heavy tasks
 * By default, uses a cheaper model like Gemini Flash for tasks that don't require the most powerful LLM
 *
 * Use cases:
 * - Processing large knowledge bases
 * - Analyzing email history
 * - Bulk processing emails
 * - Any task with large context windows where cost efficiency matters
 */
function selectEconomyModel(
  userAi: UserAIFields,
  online = false,
): ResolvedModel {
  if (env.ECONOMY_LLM_PROVIDER && env.ECONOMY_LLM_MODEL) {
    const apiKey = getProviderApiKey(env.ECONOMY_LLM_PROVIDER);
    if (!apiKey) {
      logger.warn("Economy LLM provider configured but API key not found", {
        provider: env.ECONOMY_LLM_PROVIDER,
      });
      return selectDefaultModel(userAi, online);
    }

    // Configure OpenRouter provider options if using OpenRouter for economy
    let providerOptions: Record<string, any> | undefined;
    if (
      env.ECONOMY_LLM_PROVIDER === Provider.OPENROUTER &&
      env.ECONOMY_OPENROUTER_PROVIDERS
    ) {
      providerOptions = createOpenRouterProviderOptions(
        env.ECONOMY_OPENROUTER_PROVIDERS,
      );
    }

    return selectModel(
      {
        aiProvider: env.ECONOMY_LLM_PROVIDER,
        aiModel: env.ECONOMY_LLM_MODEL,
        aiApiKey: apiKey,
      },
      providerOptions,
      online,
    );
  }

  return selectDefaultModel(userAi, online);
}

/**
 * Selects the appropriate chat model for fast conversational tasks
 */
function selectChatModel(userAi: UserAIFields, online = false): ResolvedModel {
  if (env.CHAT_LLM_PROVIDER && env.CHAT_LLM_MODEL) {
    const apiKey = getProviderApiKey(env.CHAT_LLM_PROVIDER);
    if (!apiKey) {
      logger.warn("Chat LLM provider configured but API key not found", {
        provider: env.CHAT_LLM_PROVIDER,
      });
      return selectDefaultModel(userAi, online);
    }

    // Configure OpenRouter provider options if using OpenRouter for chat
    let providerOptions: Record<string, any> | undefined;
    if (
      env.CHAT_LLM_PROVIDER === Provider.OPENROUTER &&
      env.CHAT_OPENROUTER_PROVIDERS
    ) {
      providerOptions = createOpenRouterProviderOptions(
        env.CHAT_OPENROUTER_PROVIDERS,
      );
    }

    return selectModel(
      {
        aiProvider: env.CHAT_LLM_PROVIDER,
        aiModel: env.CHAT_LLM_MODEL,
        aiApiKey: apiKey,
      },
      providerOptions,
      online,
    );
  }

  return selectDefaultModel(userAi, online);
}

function selectNanoModel(userAi: UserAIFields, online = false): ResolvedModel {
  if (env.NANO_LLM_PROVIDER && env.NANO_LLM_MODEL) {
    const apiKey = getProviderApiKey(env.NANO_LLM_PROVIDER);
    if (!apiKey) {
      logger.warn("Nano LLM provider configured but API key not found", {
        provider: env.NANO_LLM_PROVIDER,
      });
      return selectEconomyModel(userAi, online);
    }

    return selectModel(
      {
        aiProvider: env.NANO_LLM_PROVIDER,
        aiModel: env.NANO_LLM_MODEL,
        aiApiKey: apiKey,
      },
      undefined,
      online,
    );
  }

  return selectEconomyModel(userAi, online);
}

function selectDefaultModel(
  userAi: UserAIFields,
  online = false,
): ResolvedModel {
  let aiProvider: string;
  let aiModel: string | null = null;
  const aiApiKey = userAi.aiApiKey;

  const providerOptions: Record<string, any> = {};

  // If user has not api key set, then use default model
  // If they do they can use the model of their choice
  if (aiApiKey) {
    aiProvider = userAi.aiProvider || env.DEFAULT_LLM_PROVIDER;
    aiModel = userAi.aiModel || null;
  } else {
    aiProvider = env.DEFAULT_LLM_PROVIDER;
    aiModel = env.DEFAULT_LLM_MODEL || null;
  }

  if (aiProvider === Provider.OPENROUTER) {
    const openRouterOptions = createOpenRouterProviderOptions(
      env.DEFAULT_OPENROUTER_PROVIDERS || "",
    );

    // Preserve any custom options set earlier; always ensure reasoning exists.
    const existingOpenRouterOptions = providerOptions.openrouter || {};
    providerOptions.openrouter = {
      ...openRouterOptions.openrouter,
      ...existingOpenRouterOptions,
      reasoning: {
        ...openRouterOptions.openrouter.reasoning,
        ...(existingOpenRouterOptions.reasoning ?? {}),
      },
    };
  }

  return selectModel(
    {
      aiProvider,
      aiModel,
      aiApiKey,
    },
    providerOptions,
    online,
  );
}

function getProviderApiKey(provider: string) {
  const providerApiKeys: Record<string, string | undefined> = {
    [Provider.ANTHROPIC]: env.ANTHROPIC_API_KEY,
    [Provider.AZURE]:
      env.AZURE_API_KEY && env.AZURE_RESOURCE_NAME
        ? env.AZURE_API_KEY
        : undefined,
    [Provider.BEDROCK]:
      env.BEDROCK_ACCESS_KEY && env.BEDROCK_SECRET_KEY
        ? "bedrock-credentials"
        : undefined,
    [Provider.OPEN_AI]: env.OPENAI_API_KEY,
    [Provider.GOOGLE]: env.GOOGLE_API_KEY,
    [Provider.GROQ]: env.GROQ_API_KEY,
    [Provider.OPENROUTER]: env.OPENROUTER_API_KEY,
    [Provider.AI_GATEWAY]: env.AI_GATEWAY_API_KEY,
    [Provider.OLLAMA]: "ollama-local",
    // Returns a placeholder so the fallback chain doesn't skip this provider
    // when no API key is configured (many OpenAI-compatible servers don't require one)
    [Provider.OPENAI_COMPATIBLE]:
      env.OPENAI_COMPATIBLE_API_KEY || "not-required",
  };

  return providerApiKeys[provider];
}

function getFallbackModels({
  userAi,
  modelType,
  primaryModel,
  online,
}: {
  userAi: UserAIFields;
  modelType: ModelType;
  primaryModel: ResolvedModel;
  online: boolean;
}): ResolvedModel[] {
  // Keep user-selected API key behavior strict and predictable.
  if (userAi.aiApiKey) return [];

  const fallbackConfig = getFallbackConfig(modelType);
  if (!fallbackConfig) return [];

  const fallbackDefinitions = parseFallbackConfig(fallbackConfig);
  if (!fallbackDefinitions.length) return [];

  const fallbacks: ResolvedModel[] = [];

  for (const fallback of fallbackDefinitions) {
    if (!isSupportedProvider(fallback.provider)) {
      logger.warn("Skipping unsupported fallback provider", {
        provider: fallback.provider,
      });
      continue;
    }

    const apiKey = getProviderApiKey(fallback.provider);
    if (!apiKey) {
      logger.warn("Skipping fallback provider without configured credentials", {
        provider: fallback.provider,
      });
      continue;
    }

    if (!fallback.modelName) {
      logger.warn("Skipping fallback provider without explicit model", {
        provider: fallback.provider,
        modelType,
      });
      continue;
    }

    if (fallback.provider === Provider.OLLAMA && !env.OLLAMA_MODEL) {
      logger.warn("Skipping Ollama fallback without OLLAMA_MODEL", {
        provider: fallback.provider,
      });
      continue;
    }

    if (
      fallback.provider === Provider.OPENAI_COMPATIBLE &&
      !env.OPENAI_COMPATIBLE_MODEL
    ) {
      logger.warn(
        "Skipping OpenAI-compatible fallback without OPENAI_COMPATIBLE_MODEL",
        { provider: fallback.provider },
      );
      continue;
    }

    const providerOptions =
      fallback.provider === Provider.OPENROUTER
        ? getOpenRouterProviderOptionsByType(modelType)
        : undefined;

    const resolvedFallback = selectModel(
      {
        aiProvider: fallback.provider,
        aiModel: fallback.modelName,
        aiApiKey: apiKey,
      },
      providerOptions,
      online,
    );

    const isDuplicateOfPrimary =
      resolvedFallback.provider === primaryModel.provider &&
      resolvedFallback.modelName === primaryModel.modelName;
    const isDuplicateFallback = fallbacks.some(
      (existing) =>
        existing.provider === resolvedFallback.provider &&
        existing.modelName === resolvedFallback.modelName,
    );

    if (isDuplicateOfPrimary || isDuplicateFallback) continue;

    fallbacks.push(resolvedFallback);
  }

  return fallbacks;
}

function getFallbackConfig(modelType: ModelType): string | undefined {
  const configuredFallbacks = getConfiguredFallbacksByType(modelType);

  if (configuredFallbacks) return configuredFallbacks;

  return getLegacyFallbackConfig();
}

function getLegacyFallbackConfig(): string | undefined {
  if (!env.USE_BACKUP_MODEL) return;

  const legacyBackupModel = env.OPENROUTER_BACKUP_MODEL?.trim();
  if (legacyBackupModel) return `openrouter:${legacyBackupModel}`;

  return `openrouter:${LEGACY_OPENROUTER_BACKUP_DEFAULT_MODEL}`;
}

function getConfiguredFallbacksByType(
  modelType: ModelType,
): string | undefined {
  switch (modelType) {
    case "economy":
      return env.ECONOMY_LLM_FALLBACKS || env.DEFAULT_LLM_FALLBACKS;
    case "chat":
      return env.CHAT_LLM_FALLBACKS || env.DEFAULT_LLM_FALLBACKS;
    case "nano":
      return env.ECONOMY_LLM_FALLBACKS || env.DEFAULT_LLM_FALLBACKS;
    default:
      return env.DEFAULT_LLM_FALLBACKS;
  }
}

function getOpenRouterProviderOptionsByType(
  modelType: ModelType,
): Record<string, any> | undefined {
  const providersByType: Record<ModelType, string | undefined> = {
    default: env.DEFAULT_OPENROUTER_PROVIDERS,
    economy: env.ECONOMY_OPENROUTER_PROVIDERS,
    chat: env.CHAT_OPENROUTER_PROVIDERS,
    nano: env.ECONOMY_OPENROUTER_PROVIDERS,
  };

  const providers = providersByType[modelType];
  if (!providers) return;
  return createOpenRouterProviderOptions(providers);
}

function parseFallbackConfig(
  fallbackConfig: string,
): Array<{ provider: string; modelName: string | null }> {
  return fallbackConfig
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex === -1) {
        return {
          provider: entry.toLowerCase(),
          modelName: null,
        };
      }

      return {
        provider: entry.slice(0, separatorIndex).trim().toLowerCase(),
        modelName: entry.slice(separatorIndex + 1).trim() || null,
      };
    })
    .filter((entry) => !!entry.provider);
}

function isSupportedProvider(provider: string): boolean {
  return Object.values(Provider).includes(provider);
}
