import type { LanguageModelV1 } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider";
// import sample from "lodash/sample";
import { env } from "@/env";
import { Model, Provider } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("llms/model");

export function getModel(userAi: UserAIFields, useEconomyModel?: boolean) {
  const data = useEconomyModel
    ? selectEconomyModel(userAi)
    : selectDefaultModel(userAi);

  logger.info("Using model", {
    useEconomyModel,
    provider: data.provider,
    model: data.model,
    providerOptions: data.providerOptions,
  });

  return data;
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
): {
  provider: string;
  model: string;
  llmModel: LanguageModelV1;
  providerOptions?: Record<string, any>;
} {
  switch (aiProvider) {
    case Provider.OPEN_AI: {
      const model = aiModel || Model.GPT_4O;
      return {
        provider: Provider.OPEN_AI,
        model,
        llmModel: createOpenAI({ apiKey: aiApiKey || env.OPENAI_API_KEY })(
          model,
        ),
      };
    }
    case Provider.GOOGLE: {
      const mod = aiModel || Model.GEMINI_2_0_FLASH;
      return {
        provider: Provider.GOOGLE,
        model: mod,
        llmModel: createGoogleGenerativeAI({
          apiKey: aiApiKey || env.GOOGLE_API_KEY,
        })(mod),
      };
    }
    case Provider.GROQ: {
      const model = aiModel || Model.GROQ_LLAMA_3_3_70B;
      return {
        provider: Provider.GROQ,
        model,
        llmModel: createGroq({ apiKey: aiApiKey || env.GROQ_API_KEY })(model),
      };
    }
    case Provider.OPENROUTER: {
      const model = aiModel || Model.CLAUDE_4_SONNET_OPENROUTER;
      // // choose random model to handle rate limits better
      // sample([
      //   Model.CLAUDE_3_5_SONNET_OPENROUTER,
      //   Model.CLAUDE_3_7_SONNET_OPENROUTER,
      //   Model.CLAUDE_4_SONNET_OPENROUTER,
      // ]);
      const openrouter = createOpenRouter({
        apiKey: aiApiKey || env.OPENROUTER_API_KEY,
        headers: {
          "HTTP-Referer": "https://www.getinboxzero.com",
          "X-Title": "Inbox Zero",
        },
      });
      const chatModel = openrouter.chat(model);

      return {
        provider: Provider.OPENROUTER,
        model,
        llmModel: chatModel,
        providerOptions,
      };
    }
    case Provider.OLLAMA: {
      const model = aiModel || env.NEXT_PUBLIC_OLLAMA_MODEL;
      if (!model) throw new Error("Ollama model is not set");
      return {
        provider: Provider.OLLAMA!,
        model,
        llmModel: createOllama({ baseURL: env.OLLAMA_BASE_URL })(model),
      };
    }

    // this is messy. might be better to have two providers. one for bedrock and one for anthropic
    case Provider.ANTHROPIC: {
      if (env.BEDROCK_ACCESS_KEY && env.BEDROCK_SECRET_KEY && !aiApiKey) {
        const model = aiModel || Model.CLAUDE_3_7_SONNET_BEDROCK;
        return {
          provider: Provider.ANTHROPIC,
          model,
          // Based on: https://github.com/vercel/ai/issues/4996#issuecomment-2751630936
          llmModel: createAmazonBedrock({
            // accessKeyId: env.BEDROCK_ACCESS_KEY,
            // secretAccessKey: env.BEDROCK_SECRET_KEY,
            // sessionToken: undefined,
            region: env.BEDROCK_REGION,
            credentialProvider: async () => ({
              accessKeyId: env.BEDROCK_ACCESS_KEY!,
              secretAccessKey: env.BEDROCK_SECRET_KEY!,
              sessionToken: undefined,
            }),
          })(model),
        };
      } else {
        const model = aiModel || Model.CLAUDE_3_7_SONNET_ANTHROPIC;
        return {
          provider: Provider.ANTHROPIC,
          model,
          llmModel: createAnthropic({
            apiKey: aiApiKey || env.ANTHROPIC_API_KEY,
          })(model),
        };
      }
    }
    default: {
      throw new Error("LLM provider not supported");
    }
  }
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
function selectEconomyModel(userAi: UserAIFields) {
  if (env.ECONOMY_LLM_PROVIDER && env.ECONOMY_LLM_MODEL) {
    const apiKey = getProviderApiKey(env.ECONOMY_LLM_PROVIDER);
    if (!apiKey) {
      logger.warn("Economy LLM provider configured but API key not found", {
        provider: env.ECONOMY_LLM_PROVIDER,
      });
      return selectDefaultModel(userAi);
    }

    return selectModel({
      aiProvider: env.ECONOMY_LLM_PROVIDER,
      aiModel: env.ECONOMY_LLM_MODEL,
      aiApiKey: apiKey,
    });
  }

  return selectDefaultModel(userAi);
}

function selectDefaultModel(userAi: UserAIFields) {
  const defaultProvider = env.DEFAULT_LLM_PROVIDER;
  const aiApiKey = userAi.aiApiKey;
  let aiProvider: string;
  let aiModel: string | null = null;

  // If user has not api key set, then use default model
  // If they do they can use the model of their choice
  if (aiApiKey) {
    aiProvider = userAi.aiProvider || defaultProvider;

    if (userAi.aiModel) {
      aiModel = userAi.aiModel;
    }
  } else {
    aiProvider = defaultProvider;

    function selectRandomModel() {
      // TODO: remove hard coding
      // to avoid rate limits, we'll select a random model
      const models = [
        env.DEFAULT_LLM_MODEL,
        "anthropic/claude-3.7-sonnet",
        "anthropic/claude-sonnet-4",
        "google/gemini-2.5-pro-preview-03-25",
        "google/gemini-2.5-pro-preview-05-06",
      ];
      return models[Math.floor(Math.random() * models.length)];
    }

    aiModel = selectRandomModel() || null;
  }

  const providerOptions: Record<string, any> = {};

  // Add OpenRouter-specific provider options
  // TODO: shouldn't be hard coded
  if (defaultProvider === Provider.OPENROUTER) {
    providerOptions.openrouter = {
      // random order to make better use of stronger models with lower rate limits
      models: [
        "google/gemini-2.5-pro-preview-05-06",
        // "google/gemini-2.5-pro-preview-03-25",
        "anthropic/claude-sonnet-4",
        "anthropic/claude-3.7-sonnet",
      ],
      provider: {
        order: [
          "Amazon Bedrock",
          "Google Vertex",
          "Google AI Studio",
          // "Anthropic",
        ],
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
  );
}

function getProviderApiKey(
  provider:
    | "openai"
    | "anthropic"
    | "google"
    | "groq"
    | "openrouter"
    | "bedrock"
    | "ollama",
) {
  const providerApiKeys = {
    [Provider.ANTHROPIC]: env.ANTHROPIC_API_KEY,
    [Provider.OPEN_AI]: env.OPENAI_API_KEY,
    [Provider.GOOGLE]: env.GOOGLE_API_KEY,
    [Provider.GROQ]: env.GROQ_API_KEY,
    [Provider.OPENROUTER]: env.OPENROUTER_API_KEY,
  };

  return providerApiKeys[provider];
}
