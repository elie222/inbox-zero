import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAzure } from "@ai-sdk/azure";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway } from "@ai-sdk/gateway";
import { createOllama } from "ollama-ai-provider-v2";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "@/env";
import { Provider } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "../error";
import { assertCliLlmEnabled, createCliLanguageModel } from "./cli-provider";

const DEFAULT_GOOGLE_THINKING_BUDGET = 128;

const logger = createScopedLogger("llms/model");

export type ModelType = "default" | "economy" | "chat" | "nano" | "draft";

export type ResolvedModel = {
  provider: string;
  modelName: string;
  model: LanguageModelV3;
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  providerOptions?: Record<string, any>;
};

export type SelectModel = ResolvedModel & {
  fallbackModels: ResolvedModel[];
  hasUserApiKey: boolean;
};

type AiGatewayProviderOptions = {
  google?: GoogleGenerativeAIProviderOptions;
  openai?: {
    reasoningEffort: "low";
    reasoningSummary: "concise";
  };
};

type ParsedModelEntry = { provider: string; modelName: string | null };

type ModelEntryWarningMessages = {
  unsupportedProvider: string;
  missingCredentials: string;
  missingModel: string;
  duplicate?: string;
};

export function getModel(
  userAi: UserAIFields,
  modelType: ModelType = "default",
  online = false,
): SelectModel {
  const selectedModel = userAi.aiApiKey
    ? {
        primaryModel: selectUserModel(userAi, online),
        fallbackModels: [],
      }
    : selectDeploymentModelByType(modelType, online);
  const { primaryModel, fallbackModels } = selectedModel;

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
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  providerOptions?: Record<string, any>,
  online = false,
): ResolvedModel {
  switch (aiProvider) {
    case Provider.OPEN_AI: {
      const modelName = aiModel || "gpt-5.4-mini";
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
          apiKey: resolveApiKey(aiApiKey, env.OPENAI_API_KEY),
        })(modelName),
        providerOptions: openAiProviderOptions,
      };
    }
    case Provider.AZURE: {
      const modelName = aiModel || "gpt-5.4-mini";
      const baseOptions = providerOptions ?? {};
      const resourceName = env.AZURE_RESOURCE_NAME;
      if (!resourceName) {
        throw new SafeError(
          "AZURE_RESOURCE_NAME environment variable is not set",
        );
      }

      return {
        provider: Provider.AZURE,
        modelName,
        model: createAzure({
          apiKey: resolveApiKey(aiApiKey, env.AZURE_API_KEY),
          resourceName,
          apiVersion: env.AZURE_API_VERSION,
        })(modelName),
        providerOptions: {
          ...baseOptions,
          openai: { ...(baseOptions.openai ?? {}), reasoningEffort: "low" },
        },
      };
    }
    case Provider.AZURE_FOUNDRY: {
      const modelName = aiModel;
      if (!modelName) throw new SafeError("LLM model name is not set");

      // The process.env fallbacks are for eval/test runs, where `@/env` is
      // mocked with a minimal object that omits the Azure Foundry vars.
      const apiKey =
        aiApiKey ||
        env.AZURE_FOUNDRY_API_KEY ||
        process.env.AZURE_FOUNDRY_API_KEY;
      if (!apiKey) {
        throw new SafeError(
          "AZURE_FOUNDRY_API_KEY environment variable is not set",
        );
      }
      const baseURL =
        env.AZURE_FOUNDRY_BASE_URL || process.env.AZURE_FOUNDRY_BASE_URL;
      if (!baseURL) {
        throw new SafeError(
          "AZURE_FOUNDRY_BASE_URL environment variable is not set",
        );
      }

      const azureFoundry = createOpenAICompatible({
        name: "azure-foundry",
        baseURL,
        supportsStructuredOutputs: true,
        headers: { "api-key": apiKey },
      });
      return {
        provider: Provider.AZURE_FOUNDRY,
        modelName,
        model: azureFoundry(modelName),
      };
    }
    case Provider.GOOGLE: {
      const mod = aiModel || "gemini-2.0-flash";
      const googleProviderOptions = getGoogleProviderOptions(mod);
      return {
        provider: Provider.GOOGLE,
        modelName: mod,
        model: createGoogleGenerativeAI({
          apiKey: resolveApiKey(aiApiKey, env.GOOGLE_API_KEY),
        })(mod),
        providerOptions: googleProviderOptions
          ? { google: googleProviderOptions }
          : undefined,
      };
    }
    case Provider.VERTEX: {
      const modelName = aiModel || "gemini-3-flash";
      const googleProviderOptions = getGoogleProviderOptions(modelName);
      return {
        provider: Provider.VERTEX,
        modelName,
        model: createVertex(getVertexConfig())(modelName),
        providerOptions: googleProviderOptions
          ? { vertex: googleProviderOptions }
          : undefined,
      };
    }
    case Provider.GROQ: {
      const modelName = aiModel || "llama-3.3-70b-versatile";
      return {
        provider: Provider.GROQ,
        modelName,
        model: createGroq({
          apiKey: resolveApiKey(aiApiKey, env.GROQ_API_KEY),
        })(modelName),
      };
    }
    case Provider.OPENROUTER: {
      let modelName = aiModel || "anthropic/claude-sonnet-4.6";
      if (online) modelName += ":online";

      const openrouter = createOpenRouter({
        apiKey: resolveApiKey(aiApiKey, env.OPENROUTER_API_KEY),
        headers: {
          "HTTP-Referer": "https://www.getinboxzero.com",
          "X-Title": "Inbox Zero",
        },
      });
      const chatModel = openrouter.chat(modelName, {
        usage: {
          include: true,
        },
      });

      return {
        provider: Provider.OPENROUTER,
        modelName,
        model: chatModel,
        providerOptions,
      };
    }
    case Provider.AI_GATEWAY: {
      const modelName = aiModel || "anthropic/claude-sonnet-4.6";
      const aiGatewayApiKey = resolveApiKey(aiApiKey, env.AI_GATEWAY_API_KEY);
      const gateway = createGateway({
        apiKey: aiGatewayApiKey,
        headers: {
          "http-referer": "https://www.getinboxzero.com",
          "x-title": "Inbox Zero",
        },
      });
      return {
        provider: Provider.AI_GATEWAY,
        modelName,
        model: gateway(modelName),
        providerOptions: getAiGatewayProviderOptions(modelName),
      };
    }
    case "ollama": {
      const modelName = aiModel || env.OLLAMA_MODEL;
      if (!modelName) throw new SafeError("LLM model name is not set");
      const baseURL = getOllamaBaseUrl();
      return {
        provider: Provider.OLLAMA,
        modelName,
        model: createOllama({ baseURL })(modelName),
      };
    }
    case Provider.OPENAI_COMPATIBLE: {
      const modelName = aiModel || env.OPENAI_COMPATIBLE_MODEL;
      if (!modelName) throw new SafeError("LLM model name is not set");
      const baseURL = getOpenAiCompatibleBaseUrl();
      const openAiCompatibleApiKey = resolveApiKey(aiApiKey, undefined);
      const openaiCompatible = createOpenAICompatible({
        name: "openai-compatible",
        baseURL,
        supportsStructuredOutputs: true,
        ...getOpenAiCompatibleAuthOptions(openAiCompatibleApiKey),
      });
      return {
        provider: Provider.OPENAI_COMPATIBLE,
        modelName,
        model: openaiCompatible(modelName),
      };
    }
    case Provider.CODEX_CLI: {
      const modelName = aiModel || "gpt-5.3-codex";
      return {
        provider: Provider.CODEX_CLI,
        modelName,
        model: createCliLanguageModel({
          provider: Provider.CODEX_CLI,
          modelName,
        }),
      };
    }
    case Provider.CLAUDE_CODE: {
      const modelName = aiModel || "sonnet";
      return {
        provider: Provider.CLAUDE_CODE,
        modelName,
        model: createCliLanguageModel({
          provider: Provider.CLAUDE_CODE,
          modelName,
        }),
      };
    }

    case Provider.BEDROCK: {
      const modelName = aiModel || "global.anthropic.claude-sonnet-4-6";
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
      const modelName = aiModel || "claude-sonnet-4-6";
      return {
        provider: Provider.ANTHROPIC,
        modelName,
        model: createAnthropic({
          apiKey: resolveApiKey(aiApiKey, env.ANTHROPIC_API_KEY),
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
  modelName?: string | null,
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
): Record<string, any> {
  const order = providers
    .split(",")
    .map((p: string) => p.trim())
    .filter(Boolean);

  const includeReasoning = shouldIncludeOpenRouterReasoning(modelName);

  return {
    openrouter: {
      provider: order.length > 0 ? { order } : undefined,
      ...(includeReasoning ? { reasoning: { max_tokens: 20 } } : {}),
    },
  };
}

function selectDeploymentModelByType(
  modelType: ModelType,
  online = false,
): { primaryModel: ResolvedModel; fallbackModels: ResolvedModel[] } {
  const selectedModel =
    resolveRoleModelList(modelType, online) ??
    getDeploymentModelFallbackTypes(modelType)
      .map((fallbackType) => resolveRoleModelList(fallbackType, online))
      .find((modelList) => !!modelList);

  if (!selectedModel) {
    throw new Error(`No configured LLM model list resolved for ${modelType}`);
  }

  return selectedModel;
}

function getDeploymentModelFallbackTypes(modelType: ModelType): ModelType[] {
  switch (modelType) {
    case "economy":
    case "chat":
    case "draft":
      return ["default"];
    case "nano":
      return ["economy", "default"];
    default:
      return [];
  }
}

function selectUserModel(userAi: UserAIFields, online = false): ResolvedModel {
  const configuredDefault = getFirstSupportedModelListEntry("default");
  const aiProvider = userAi.aiProvider || configuredDefault?.provider;
  const aiModel = userAi.aiProvider
    ? userAi.aiModel || null
    : configuredDefault?.modelName || null;

  if (!aiProvider) {
    throw new Error("No configured default LLM model is available");
  }

  return selectModel(
    {
      aiProvider,
      aiModel,
      aiApiKey: userAi.aiApiKey,
    },
    getOpenRouterProviderOptions("default", aiProvider, aiModel),
    online,
  );
}

function resolveRoleModelList(
  modelType: ModelType,
  online = false,
): { primaryModel: ResolvedModel; fallbackModels: ResolvedModel[] } | null {
  const modelListConfig = getConfiguredModelListByType(modelType);
  if (!modelListConfig) return null;

  const resolvedModels = resolveDeploymentModelEntries({
    entries: parseModelListConfig(modelListConfig),
    modelType,
    online,
    getOpenRouterProviderOptions,
    warningMessages: {
      unsupportedProvider: "Skipping unsupported LLM list provider",
      missingCredentials:
        "Skipping LLM list provider without configured credentials",
      missingModel: "Skipping LLM list entry without explicit model",
      duplicate: "Skipping duplicate LLM list entry",
    },
  });

  const primaryModel = resolvedModels[0];
  if (!primaryModel) return null;

  return {
    primaryModel,
    fallbackModels: resolvedModels.slice(1),
  };
}

export function getConfiguredRolePrimaryModel(
  modelType: ModelType,
  online = false,
): ResolvedModel | null {
  return resolveRoleModelList(modelType, online)?.primaryModel ?? null;
}

export function getConfiguredRolePrimaryModelEntry(
  modelType: ModelType,
): { provider: string; modelName: string } | null {
  const resolvedModel = getConfiguredRolePrimaryModel(modelType);
  if (!resolvedModel) return null;

  return {
    provider: resolvedModel.provider,
    modelName: resolvedModel.modelName,
  };
}

export function getResolvedDeploymentRolePrimaryModelEntry(
  modelType: ModelType,
): { provider: string; modelName: string } | null {
  try {
    const { primaryModel } = selectDeploymentModelByType(modelType);
    return {
      provider: primaryModel.provider,
      modelName: primaryModel.modelName,
    };
  } catch {
    return null;
  }
}

function getFirstSupportedModelListEntry(
  modelType: ModelType,
): ParsedModelEntry | null {
  const modelListConfig = getConfiguredModelListByType(modelType);
  if (!modelListConfig) return null;

  for (const entry of parseModelListConfig(modelListConfig)) {
    if (!isSupportedProvider(entry.provider)) {
      logger.warn("Skipping unsupported LLM list provider", {
        provider: entry.provider,
        modelType,
      });
      continue;
    }

    if (!entry.modelName) {
      logger.warn("Skipping LLM list entry without explicit model", {
        provider: entry.provider,
        modelType,
      });
      continue;
    }

    return entry;
  }

  return null;
}

function getConfiguredModelListByType(
  modelType: ModelType,
): string | undefined {
  switch (modelType) {
    case "economy":
      return env.ECONOMY_LLMS;
    case "chat":
      return env.CHAT_LLMS;
    case "nano":
      return env.NANO_LLMS;
    case "draft":
      return env.DRAFT_LLMS;
    default:
      return env.DEFAULT_LLMS;
  }
}

function getProviderApiKey(provider: string) {
  const azureApiKey = resolveApiKey(null, env.AZURE_API_KEY);
  const providerApiKeys: Record<string, string | undefined> = {
    [Provider.ANTHROPIC]: resolveApiKey(null, env.ANTHROPIC_API_KEY),
    [Provider.AZURE]:
      azureApiKey && env.AZURE_RESOURCE_NAME ? azureApiKey : undefined,
    [Provider.AZURE_FOUNDRY]:
      env.AZURE_FOUNDRY_API_KEY && env.AZURE_FOUNDRY_BASE_URL
        ? env.AZURE_FOUNDRY_API_KEY
        : undefined,
    [Provider.BEDROCK]:
      env.BEDROCK_ACCESS_KEY && env.BEDROCK_SECRET_KEY
        ? "bedrock-credentials"
        : undefined,
    [Provider.OPEN_AI]: resolveApiKey(null, env.OPENAI_API_KEY),
    [Provider.GOOGLE]: resolveApiKey(null, env.GOOGLE_API_KEY),
    // Returns a placeholder so this provider can be selected in fallback chains.
    // Authentication is handled by Google auth options or ADC at runtime.
    [Provider.VERTEX]: env.GOOGLE_VERTEX_PROJECT
      ? "vertex-credentials"
      : undefined,
    [Provider.GROQ]: resolveApiKey(null, env.GROQ_API_KEY),
    [Provider.OPENROUTER]: resolveApiKey(null, env.OPENROUTER_API_KEY),
    [Provider.AI_GATEWAY]: resolveApiKey(null, env.AI_GATEWAY_API_KEY),
    [Provider.OLLAMA]: "ollama-local",
    // Returns a placeholder so the fallback chain doesn't skip this provider
    // when no API key is configured (many OpenAI-compatible servers don't require one)
    [Provider.OPENAI_COMPATIBLE]:
      env.LLM_API_KEY || process.env.LLM_API_KEY || "not-required",
    [Provider.CODEX_CLI]: getCliProviderAvailability(Provider.CODEX_CLI),
    [Provider.CLAUDE_CODE]: getCliProviderAvailability(Provider.CLAUDE_CODE),
  };

  return providerApiKeys[provider];
}

function getCliProviderAvailability(provider: string) {
  try {
    assertCliLlmEnabled(provider);
    return "cli-provider";
  } catch {
    return;
  }
}

function resolveApiKey(
  aiApiKey: string | null | undefined,
  providerApiKey: string | undefined,
) {
  return (
    aiApiKey || providerApiKey || env.LLM_API_KEY || process.env.LLM_API_KEY
  );
}

function getOpenAiCompatibleBaseUrl() {
  return (
    env.OPENAI_COMPATIBLE_BASE_URL ||
    process.env.OPENAI_COMPATIBLE_BASE_URL ||
    "http://localhost:1234/v1"
  );
}

function getOllamaBaseUrl(): string | undefined {
  const baseURL = env.OLLAMA_BASE_URL?.trim();
  if (!baseURL) return;

  try {
    const url = new URL(baseURL);
    if (url.pathname === "/" || url.pathname === "") {
      url.pathname = "/api";
      return url.toString();
    }
  } catch {
    return baseURL;
  }

  return baseURL.replace(/\/+$/, "");
}

function getOpenAiCompatibleAuthOptions(apiKey: string | undefined) {
  if (!apiKey) return {};

  const authHeader =
    env.OPENAI_COMPATIBLE_AUTH_HEADER ||
    process.env.OPENAI_COMPATIBLE_AUTH_HEADER;

  if (authHeader === "api-key") {
    return { headers: { "api-key": apiKey } };
  }

  return { apiKey };
}

function getVertexConfig(): {
  project: string;
  location: string;
  googleAuthOptions?: {
    credentials: {
      client_email: string;
      private_key: string;
    };
  };
} {
  const project = env.GOOGLE_VERTEX_PROJECT;
  if (!project) {
    throw new SafeError(
      "GOOGLE_VERTEX_PROJECT environment variable is not set",
    );
  }

  const location = env.GOOGLE_VERTEX_LOCATION;
  const clientEmail = env.GOOGLE_VERTEX_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(env.GOOGLE_VERTEX_PRIVATE_KEY);

  if (!clientEmail || !privateKey) {
    return { project, location };
  }

  return {
    project,
    location,
    googleAuthOptions: {
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    },
  };
}

function normalizePrivateKey(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, "\n");
}

function getOpenRouterProviderOptions(
  modelType: ModelType,
  provider: string,
  modelName?: string | null,
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
): Record<string, any> | undefined {
  if (provider !== Provider.OPENROUTER) return;

  const providersByType: Record<ModelType, string | undefined> = {
    default: env.DEFAULT_OPENROUTER_PROVIDERS,
    economy: env.ECONOMY_OPENROUTER_PROVIDERS,
    chat: env.CHAT_OPENROUTER_PROVIDERS,
    nano: env.ECONOMY_OPENROUTER_PROVIDERS,
    draft: env.DEFAULT_OPENROUTER_PROVIDERS,
  };
  const providers = providersByType[modelType];

  // The default role always applies OpenRouter options (empty providers still
  // configures reasoning); other roles only when explicitly configured.
  if (modelType === "default") {
    return createOpenRouterProviderOptions(providers || "", modelName);
  }
  if (!providers) return;
  return createOpenRouterProviderOptions(providers, modelName);
}

function shouldIncludeOpenRouterReasoning(modelName?: string | null): boolean {
  return !isXaiGrokModel(modelName);
}

function isXaiGrokModel(modelName?: string | null): boolean {
  return modelName?.toLowerCase().startsWith("x-ai/grok-") ?? false;
}

function getGoogleProviderOptions(
  modelName: string,
): GoogleGenerativeAIProviderOptions | undefined {
  const thinkingConfig = getGoogleThinkingConfig(modelName);
  if (!thinkingConfig) return;

  return { thinkingConfig };
}

function getGoogleThinkingConfig(
  modelName: string,
): GoogleGenerativeAIProviderOptions["thinkingConfig"] | undefined {
  if (isGemini3Model(modelName)) {
    return { thinkingLevel: "minimal" };
  }

  const thinkingBudget = getGoogleThinkingBudget();
  if (thinkingBudget === undefined) return;

  return { thinkingBudget };
}

function getGoogleThinkingBudget(): number | undefined {
  if (env.GOOGLE_THINKING_BUDGET === 0) return;

  return env.GOOGLE_THINKING_BUDGET ?? DEFAULT_GOOGLE_THINKING_BUDGET;
}

function isGemini3Model(modelName: string): boolean {
  return normalizeGoogleModelName(modelName).startsWith("gemini-3");
}

function getAiGatewayProviderOptions(
  modelName: string,
): AiGatewayProviderOptions {
  const normalizedModelName = modelName.toLowerCase();

  if (normalizedModelName.startsWith("google/")) {
    const googleProviderOptions = getGoogleProviderOptions(modelName);
    return {
      ...(googleProviderOptions ? { google: googleProviderOptions } : {}),
    };
  }

  if (
    normalizedModelName.startsWith("openai/") ||
    normalizedModelName.startsWith("azure/")
  ) {
    return {
      // Azure OpenAI models use OpenAI provider options in AI Gateway.
      openai: {
        reasoningEffort: "low",
        reasoningSummary: "concise",
      },
    };
  }

  // Note: Anthropic thinking is disabled by default (not including the config)
  return {};
}

function normalizeGoogleModelName(modelName: string): string {
  return modelName.toLowerCase().replace(/^google\//, "");
}

function parseModelListConfig(modelListConfig: string): ParsedModelEntry[] {
  return modelListConfig
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

function resolveDeploymentModelEntries({
  entries,
  modelType,
  primaryModel,
  online,
  getOpenRouterProviderOptions,
  warningMessages,
}: {
  entries: ParsedModelEntry[];
  modelType: ModelType;
  primaryModel?: ResolvedModel;
  online: boolean;
  getOpenRouterProviderOptions: (
    modelType: ModelType,
    provider: string,
    modelName: string,
    // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  ) => Record<string, any> | undefined;
  warningMessages: ModelEntryWarningMessages;
}): ResolvedModel[] {
  const resolvedModels: ResolvedModel[] = [];

  for (const entry of entries) {
    if (!isSupportedProvider(entry.provider)) {
      logger.warn(warningMessages.unsupportedProvider, {
        provider: entry.provider,
        modelType,
      });
      continue;
    }

    const apiKey = getProviderApiKey(entry.provider);
    if (!apiKey) {
      logger.warn(warningMessages.missingCredentials, {
        provider: entry.provider,
        modelType,
      });
      continue;
    }

    if (!entry.modelName) {
      logger.warn(warningMessages.missingModel, {
        provider: entry.provider,
        modelType,
      });
      continue;
    }

    const providerOptions = getOpenRouterProviderOptions(
      modelType,
      entry.provider,
      entry.modelName,
    );

    const resolvedModel = selectModel(
      {
        aiProvider: entry.provider,
        aiModel: entry.modelName,
        aiApiKey: null,
      },
      providerOptions,
      online,
    );

    if (
      isDuplicateResolvedModel(resolvedModel, primaryModel) ||
      resolvedModels.some((existing) =>
        isDuplicateResolvedModel(resolvedModel, existing),
      )
    ) {
      if (warningMessages.duplicate) {
        logger.warn(warningMessages.duplicate, {
          provider: resolvedModel.provider,
          modelName: resolvedModel.modelName,
          modelType,
        });
      }
      continue;
    }

    resolvedModels.push(resolvedModel);
  }

  return resolvedModels;
}

function isDuplicateResolvedModel(
  model: ResolvedModel,
  existingModel?: ResolvedModel,
): boolean {
  return (
    !!existingModel &&
    model.provider === existingModel.provider &&
    model.modelName === existingModel.modelName
  );
}

function isSupportedProvider(provider: string): boolean {
  return Object.values(Provider).includes(provider);
}
