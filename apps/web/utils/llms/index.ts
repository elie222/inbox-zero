import type { z } from "zod";
import {
  APICallError,
  type CoreMessage,
  type CoreTool,
  generateObject,
  generateText,
  type LanguageModelV1,
  RetryError,
  streamText,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider";
import { env } from "@/env";
import { saveAiUsage } from "@/utils/usage";
import { Model, Provider, supportsOllama } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { addUserErrorMessage, ErrorType } from "@/utils/error-messages";
import {
  isAnthropicInsufficientBalanceError,
  isAWSThrottlingError,
  isIncorrectOpenAIAPIKeyError,
  isInvalidOpenAIModelError,
  isOpenAIAPIKeyDeactivatedError,
  isOpenAIRetryError,
  isServiceUnavailableError,
} from "@/utils/error";
import { sleep } from "@/utils/sleep";

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

function getModel(userAi: UserAIFields): {
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

export async function chatCompletion({
  userAi,
  prompt,
  system,
  userEmail,
  usageLabel,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  userEmail: string;
  usageLabel: string;
}) {
  try {
    const { provider, model, llmModel } = getModel(userAi);

    const result = await generateText({
      model: llmModel,
      prompt,
      system,
      experimental_telemetry: { isEnabled: true },
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model,
        label: usageLabel,
      });
    }

    return result;
  } catch (error) {
    await handleError(error, userEmail);
    throw error;
  }
}

type ChatCompletionObjectArgs<T> = {
  userAi: UserAIFields;
  schema: z.Schema<T>;
  userEmail: string;
  usageLabel: string;
} & (
  | {
      system?: string;
      prompt: string;
      messages?: never;
    }
  | {
      system?: never;
      prompt?: never;
      messages: CoreMessage[];
    }
);

export async function chatCompletionObject<T>(
  options: ChatCompletionObjectArgs<T>,
) {
  return withBackupModel(chatCompletionObjectInternal, options);
}

async function chatCompletionObjectInternal<T>({
  userAi,
  system,
  prompt,
  messages,
  schema,
  userEmail,
  usageLabel,
}: ChatCompletionObjectArgs<T>) {
  try {
    const { provider, model, llmModel } = getModel(userAi);

    const result = await generateObject({
      model: llmModel,
      system,
      prompt,
      messages,
      schema,
      experimental_telemetry: { isEnabled: true },
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model,
        label: usageLabel,
      });
    }

    return result;
  } catch (error) {
    await handleError(error, userEmail);
    throw error;
  }
}

export async function chatCompletionStream({
  userAi,
  prompt,
  system,
  userEmail,
  usageLabel: label,
  onFinish,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  userEmail: string;
  usageLabel: string;
  onFinish?: (text: string) => Promise<void>;
}) {
  const { provider, model, llmModel } = getModel(userAi);

  const result = streamText({
    model: llmModel,
    prompt,
    system,
    experimental_telemetry: { isEnabled: true },
    onFinish: async ({ usage, text }) => {
      await saveAiUsage({
        email: userEmail,
        provider,
        model,
        usage,
        label,
      });

      if (onFinish) await onFinish(text);
    },
  });

  return result;
}

type ChatCompletionToolsArgs = {
  userAi: UserAIFields;
  tools: Record<string, CoreTool>;
  maxSteps?: number;
  label: string;
  userEmail: string;
} & (
  | {
      system?: string;
      prompt: string;
      messages?: never;
    }
  | {
      system?: never;
      prompt?: never;
      messages: CoreMessage[];
    }
);

export async function chatCompletionTools(options: ChatCompletionToolsArgs) {
  return withBackupModel(chatCompletionToolsInternal, options);
}

async function chatCompletionToolsInternal({
  userAi,
  system,
  prompt,
  messages,
  tools,
  maxSteps,
  label,
  userEmail,
}: ChatCompletionToolsArgs) {
  try {
    const { provider, model, llmModel } = getModel(userAi);

    const result = await generateText({
      model: llmModel,
      tools,
      toolChoice: "required",
      system,
      prompt,
      messages,
      maxSteps,
      experimental_telemetry: { isEnabled: true },
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model,
        label,
      });
    }

    return result;
  } catch (error) {
    await handleError(error, userEmail);
    throw error;
  }
}

// not in use atm
async function streamCompletionTools({
  userAi,
  prompt,
  system,
  tools,
  maxSteps,
  userEmail,
  label,
  onFinish,
}: {
  userAi: UserAIFields;
  prompt: string;
  system?: string;
  tools: Record<string, CoreTool>;
  maxSteps?: number;
  userEmail: string;
  label: string;
  onFinish?: (text: string) => Promise<void>;
}) {
  const { provider, model, llmModel } = getModel(userAi);

  const result = await streamText({
    model: llmModel,
    tools,
    toolChoice: "required",
    prompt,
    system,
    maxSteps,
    experimental_telemetry: { isEnabled: true },
    onFinish: async ({ usage, text }) => {
      await saveAiUsage({
        email: userEmail,
        provider,
        model,
        usage,
        label,
      });

      if (onFinish) await onFinish(text);
    },
  });

  return result;
}

// NOTE: Think we can just switch this out for p-retry that we already use in the project
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retryIf,
    maxRetries,
    delayMs,
  }: {
    retryIf: (error: unknown) => boolean;
    maxRetries: number;
    delayMs: number;
  },
): Promise<T> {
  let attempts = 0;
  let lastError: unknown;

  while (attempts < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempts++;
      lastError = error;

      if (retryIf(error)) {
        console.warn(`Attempt ${attempts}: Operation failed. Retrying...`);
        if (attempts < maxRetries) {
          await sleep(delayMs);
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError;
}

// Helps when service is unavailable / throttled / rate limited
async function withBackupModel<T, Args extends { userAi: UserAIFields }>(
  fn: (args: Args) => Promise<T>,
  args: Args,
): Promise<T> {
  try {
    return await fn(args);
  } catch (error) {
    if (
      env.USE_BACKUP_MODEL &&
      (isServiceUnavailableError(error) || isAWSThrottlingError(error))
    ) {
      return await fn({
        ...args,
        userAi: {
          aiProvider: Provider.ANTHROPIC,
          aiModel: env.NEXT_PUBLIC_BEDROCK_ANTHROPIC_BACKUP_MODEL,
          aiApiKey: args.userAi.aiApiKey,
        },
      });
    }
    throw error;
  }
}

async function handleError(error: unknown, userEmail: string) {
  if (APICallError.isInstance(error)) {
    if (isIncorrectOpenAIAPIKeyError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.INCORRECT_OPENAI_API_KEY,
        error.message,
      );
    }

    if (isInvalidOpenAIModelError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.INVALID_OPENAI_MODEL,
        error.message,
      );
    }

    if (isOpenAIAPIKeyDeactivatedError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.OPENAI_API_KEY_DEACTIVATED,
        error.message,
      );
    }

    if (RetryError.isInstance(error) && isOpenAIRetryError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.OPENAI_RETRY_ERROR,
        error.message,
      );
    }

    if (isAnthropicInsufficientBalanceError(error)) {
      return await addUserErrorMessage(
        userEmail,
        ErrorType.ANTHROPIC_INSUFFICIENT_BALANCE,
        error.message,
      );
    }
  }
}
