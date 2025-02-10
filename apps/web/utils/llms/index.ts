import type { z } from "zod";
import {
  APICallError,
  type CoreMessage,
  type CoreTool,
  generateObject,
  generateText,
  RetryError,
  streamText,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOllama } from "ollama-ai-provider";
import { env } from "@/env";
import { saveAiUsage } from "@/utils/usage";
import { Model, Provider } from "@/utils/llms/config";
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

function getModel({ aiProvider, aiModel, aiApiKey }: UserAIFields) {
  const provider = aiProvider || Provider.ANTHROPIC;

  if (provider === Provider.OPEN_AI) {
    const model = aiModel || Model.GPT_4O;
    return {
      provider: Provider.OPEN_AI,
      model,
      llmModel: createOpenAI({ apiKey: aiApiKey || env.OPENAI_API_KEY })(model),
    };
  }

  if (provider === Provider.ANTHROPIC) {
    if (aiApiKey) {
      const model = aiModel || Model.CLAUDE_3_5_SONNET_ANTHROPIC;
      return {
        provider: Provider.ANTHROPIC,
        model,
        llmModel: createAnthropic({ apiKey: aiApiKey })(model),
      };
    }
    if (!env.BEDROCK_ACCESS_KEY)
      throw new Error("BEDROCK_ACCESS_KEY is not set");
    if (!env.BEDROCK_SECRET_KEY)
      throw new Error("BEDROCK_SECRET_KEY is not set");

    const model = aiModel || Model.CLAUDE_3_5_SONNET_BEDROCK;

    return {
      provider: Provider.ANTHROPIC,
      model,
      llmModel: createAmazonBedrock({
        bedrockOptions: {
          region: env.BEDROCK_REGION,
          credentials: {
            accessKeyId: env.BEDROCK_ACCESS_KEY,
            secretAccessKey: env.BEDROCK_SECRET_KEY,
          },
        },
      })(model),
    };
  }

  if (provider === Provider.GOOGLE) {
    if (!aiApiKey) throw new Error("Google API key is not set");

    const model = aiModel || Model.GEMINI_1_5_PRO;
    return {
      provider: Provider.GOOGLE,
      model,
      llmModel: createGoogleGenerativeAI({ apiKey: aiApiKey })(model),
    };
  }

  if (provider === Provider.GROQ) {
    if (!aiApiKey) throw new Error("Groq API key is not set");

    const model = aiModel || Model.GROQ_LLAMA_3_3_70B;
    return {
      provider: Provider.GROQ,
      model,
      llmModel: createGroq({ apiKey: aiApiKey })(model),
    };
  }

  if (provider === Provider.OLLAMA && env.NEXT_PUBLIC_OLLAMA_MODEL) {
    return {
      provider: Provider.OLLAMA,
      model: env.NEXT_PUBLIC_OLLAMA_MODEL,
      llmModel: createOllama({ baseURL: env.OLLAMA_BASE_URL })(
        aiModel || env.NEXT_PUBLIC_OLLAMA_MODEL,
      ),
    };
  }

  throw new Error("AI provider not supported");
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
  prompt: string;
  system?: string;
  schema: z.Schema<T>;
  userEmail: string;
  usageLabel: string;
};

export async function chatCompletionObject<T>(
  options: ChatCompletionObjectArgs<T>,
) {
  return withBackupModel(chatCompletionObjectInternal, options);
}

async function chatCompletionObjectInternal<T>({
  userAi,
  prompt,
  system,
  schema,
  userEmail,
  usageLabel,
}: ChatCompletionObjectArgs<T>) {
  try {
    const { provider, model, llmModel } = getModel(userAi);

    const result = await generateObject({
      model: llmModel,
      prompt,
      system,
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
