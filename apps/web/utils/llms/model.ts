import type { LanguageModelV1 } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider";
import { env } from "@/env";
import { Model, Provider, supportsOllama } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";

function getDefaultProvider(): string {
  switch (env.DEFAULT_LLM_PROVIDER) {
    case "google":
      return Provider.GOOGLE;
    case "anthropic":
      return Provider.ANTHROPIC;
    case "bedrock":
      return Provider.ANTHROPIC;
    case "openai":
      return Provider.OPEN_AI;
    case "openrouter":
      return Provider.OPENROUTER;
    case "groq":
      return Provider.GROQ;
    case "ollama":
      if (supportsOllama && env.OLLAMA_BASE_URL) return Provider.OLLAMA!;
      throw new Error("Ollama is not supported");
    default:
      throw new Error(
        "No AI provider found. Please set at least one API key in env variables.",
      );
  }
}

export function getModel(userAi: UserAIFields): {
  provider: string;
  model: string;
  llmModel: LanguageModelV1;
} {
  const defaultProvider = getDefaultProvider();
  const aiApiKey = userAi.aiApiKey;
  let aiProvider: string;
  let aiModel: string;

  // If user has not api key set, then use default model
  // If they do they can use the model of their choice
  if (aiApiKey) {
    aiProvider = userAi.aiProvider || defaultProvider;
    aiModel = userAi.aiModel || env.DEFAULT_LLM_MODEL;
  } else {
    aiProvider = defaultProvider;
    aiModel = env.DEFAULT_LLM_MODEL;
  }

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
      const mod = aiModel || Model.GEMINI_1_5_PRO;
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
      const model = aiModel || Model.GROQ_LLAMA_3_3_70B;
      const openrouter = createOpenRouter({
        apiKey: aiApiKey || env.OPENROUTER_API_KEY,
      });
      const chatModel = openrouter.chat(model);

      return {
        provider: Provider.OPENROUTER,
        model,
        llmModel: chatModel,
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
      if (env.BEDROCK_ACCESS_KEY && env.BEDROCK_SECRET_KEY) {
        const model = aiModel || Model.CLAUDE_3_7_SONNET_BEDROCK;
        return {
          provider: Provider.ANTHROPIC,
          model,
          llmModel: createAmazonBedrock({
            region: env.BEDROCK_REGION,
            accessKeyId: env.BEDROCK_ACCESS_KEY,
            secretAccessKey: env.BEDROCK_SECRET_KEY,
            sessionToken: undefined,
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
