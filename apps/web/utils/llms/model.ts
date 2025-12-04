import type { LanguageModelV2 } from "@ai-sdk/provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway } from "@ai-sdk/gateway";
import { createOllama } from "ollama-ai-provider-v2";
import { env } from "@/env";
import {
  Provider,
  allowUserAiProviderUrl,
  supportsOllama,
} from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("llms/model");

export type ModelType = "default" | "economy" | "chat";

type SelectModel = {
  provider: string;
  modelName: string;
  model: LanguageModelV2;
  providerOptions?: Record<string, any>;
  backupModel: LanguageModelV2 | null;
};

export function getModel(
  userAi: UserAIFields,
  modelType: ModelType = "default",
): SelectModel {
  const data = selectModelByType(userAi, modelType);

  logger.info("Using model", {
    modelType,
    provider: data.provider,
    model: data.modelName,
    providerOptions: data.providerOptions,
  });

  return data;
}

function selectModelByType(userAi: UserAIFields, modelType: ModelType) {
  if (userAi.aiApiKey) return selectDefaultModel(userAi);

  switch (modelType) {
    case "economy":
      return selectEconomyModel(userAi);
    case "chat":
      return selectChatModel(userAi);
    default:
      return selectDefaultModel(userAi);
  }
}

function selectModel(
  {
    aiProvider,
    aiModel,
    aiApiKey,
    aiBaseUrl,
  }: {
    aiProvider: string;
    aiModel: string | null;
    aiApiKey: string | null;
    aiBaseUrl?: string | null;
  },
  providerOptions?: Record<string, any>,
): SelectModel {
  switch (aiProvider) {
    case Provider.OPEN_AI: {
      const modelName = aiModel || "gpt-5.1";
      // Security: Only use user's custom URL if ALLOW_USER_AI_PROVIDER_URL is enabled
      const baseURL =
        allowUserAiProviderUrl && aiBaseUrl ? aiBaseUrl : env.OPENAI_BASE_URL;
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
        model: createOpenAI({
          apiKey: aiApiKey || env.OPENAI_API_KEY,
          ...(baseURL ? { baseURL } : {}),
        })(modelName),
        providerOptions: openAiProviderOptions,
        backupModel: getBackupModel(aiApiKey),
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
        backupModel: getBackupModel(aiApiKey),
      };
    }
    case Provider.GROQ: {
      const modelName = aiModel || "llama-3.3-70b-versatile";
      return {
        provider: Provider.GROQ,
        modelName,
        model: createGroq({ apiKey: aiApiKey || env.GROQ_API_KEY })(modelName),
        backupModel: getBackupModel(aiApiKey),
      };
    }
    case Provider.OPENROUTER: {
      const modelName = aiModel || "anthropic/claude-sonnet-4.5";
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
        backupModel: getBackupModel(aiApiKey),
      };
    }
    case Provider.AI_GATEWAY: {
      const modelName = aiModel || "google/gemini-2.5-pro";
      const aiGatewayApiKey = aiApiKey || env.AI_GATEWAY_API_KEY;
      const gateway = createGateway({ apiKey: aiGatewayApiKey });
      return {
        provider: Provider.AI_GATEWAY,
        modelName,
        model: gateway(modelName),
        backupModel: getBackupModel(aiApiKey),
      };
    }
    case Provider.OLLAMA: {
      const modelName = aiModel;

      if (!modelName) {
        throw new Error("Ollama model must be specified");
      }

      // Security: Only use user's custom URL if ALLOW_USER_AI_PROVIDER_URL is enabled
      // Note: baseURL should include /api (e.g., http://localhost:11434/api)
      const baseURL =
        allowUserAiProviderUrl && aiBaseUrl
          ? aiBaseUrl
          : env.OLLAMA_BASE_URL || "http://localhost:11434/api";
      const ollama = createOllama({ baseURL });

      return {
        provider: Provider.OLLAMA!,
        modelName,
        model: ollama(modelName),
        backupModel: null,
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
        backupModel: getBackupModel(aiApiKey),
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
        backupModel: getBackupModel(aiApiKey),
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
function selectEconomyModel(userAi: UserAIFields): SelectModel {
  if (env.ECONOMY_LLM_PROVIDER && env.ECONOMY_LLM_MODEL) {
    const apiKey = getProviderApiKey(env.ECONOMY_LLM_PROVIDER);
    if (!apiKey && providerRequiresApiKey(env.ECONOMY_LLM_PROVIDER)) {
      logger.warn("Economy LLM provider configured but API key not found", {
        provider: env.ECONOMY_LLM_PROVIDER,
      });
      return selectDefaultModel(userAi);
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
        aiApiKey: apiKey ?? null,
      },
      providerOptions,
    );
  }

  return selectDefaultModel(userAi);
}

/**
 * Selects the appropriate chat model for fast conversational tasks
 */
function selectChatModel(userAi: UserAIFields): SelectModel {
  if (env.CHAT_LLM_PROVIDER && env.CHAT_LLM_MODEL) {
    const apiKey = getProviderApiKey(env.CHAT_LLM_PROVIDER);
    if (!apiKey && providerRequiresApiKey(env.CHAT_LLM_PROVIDER)) {
      logger.warn("Chat LLM provider configured but API key not found", {
        provider: env.CHAT_LLM_PROVIDER,
      });
      return selectDefaultModel(userAi);
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
        aiApiKey: apiKey ?? null,
      },
      providerOptions,
    );
  }

  return selectDefaultModel(userAi);
}

function selectDefaultModel(userAi: UserAIFields): SelectModel {
  let aiProvider: string;
  let aiModel: string | null = null;
  const aiApiKey = userAi.aiApiKey;

  const providerOptions: Record<string, any> = {};

  // Check if user's selected provider is still valid
  // (e.g., Ollama may have been disabled after user selected it)
  const isUserProviderValid =
    userAi.aiProvider !== Provider.OLLAMA || supportsOllama;

  // If user has an API key set, or has Ollama (which doesn't need API key),
  // and their provider is still valid, use their settings
  if (
    (aiApiKey || userAi.aiProvider === Provider.OLLAMA) &&
    isUserProviderValid
  ) {
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
      aiBaseUrl: userAi.aiBaseUrl,
    },
    providerOptions,
  );
}

function getProviderApiKey(provider: string) {
  const providerApiKeys: Record<string, string | undefined> = {
    [Provider.ANTHROPIC]: env.ANTHROPIC_API_KEY,
    [Provider.BEDROCK]:
      env.BEDROCK_ACCESS_KEY && env.BEDROCK_SECRET_KEY
        ? "bedrock-credentials"
        : undefined,
    [Provider.OPEN_AI]: env.OPENAI_API_KEY,
    [Provider.GOOGLE]: env.GOOGLE_API_KEY,
    [Provider.GROQ]: env.GROQ_API_KEY,
    [Provider.OPENROUTER]: env.OPENROUTER_API_KEY,
    [Provider.AI_GATEWAY]: env.AI_GATEWAY_API_KEY,
  };

  return providerApiKeys[provider];
}

function providerRequiresApiKey(provider: string) {
  return provider !== Provider.OLLAMA;
}

function getBackupModel(userApiKey: string | null): LanguageModelV2 | null {
  // disable backup model if user is using their own api key
  if (userApiKey) return null;
  if (!env.OPENROUTER_BACKUP_MODEL) return null;

  return createOpenRouter({
    apiKey: env.OPENROUTER_API_KEY,
  }).chat(env.OPENROUTER_BACKUP_MODEL);
}
