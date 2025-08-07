import type { z } from "zod";
import {
  APICallError,
  type ModelMessage,
  type Tool,
  type JSONValue,
  generateObject,
  generateText,
  RetryError,
  streamText,
  smoothStream,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type StreamTextOnStepFinishCallback,
  type ToolSet,
} from "ai";
import { env } from "@/env";
import { saveAiUsage } from "@/utils/usage";
import { Provider } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { addUserErrorMessage, ErrorType } from "@/utils/error-messages";
import {
  captureException,
  isAnthropicInsufficientBalanceError,
  isAWSThrottlingError,
  isIncorrectOpenAIAPIKeyError,
  isInvalidOpenAIModelError,
  isOpenAIAPIKeyDeactivatedError,
  isOpenAIRetryError,
  isServiceUnavailableError,
} from "@/utils/error";
import { sleep } from "@/utils/sleep";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("llms");

const commonOptions: {
  experimental_telemetry: { isEnabled: boolean };
  headers?: Record<string, string>;
  providerOptions?: Record<string, Record<string, JSONValue>>;
} = { experimental_telemetry: { isEnabled: true } };

export function createGenerateText({
  userEmail,
  label,
  modelOptions,
}: {
  userEmail: string;
  label: string;
  modelOptions: ReturnType<typeof getModel>;
}): typeof generateText {
  return async (...args) => {
    try {
      logger.trace("Generating text", {
        system: args[0].system,
        prompt: args[0].prompt,
      });

      const result = await generateText(...args);

      if (result.usage) {
        await saveAiUsage({
          email: userEmail,
          usage: result.usage,
          provider: modelOptions.provider,
          model: modelOptions.modelName,
          label,
        });
      }

      if (args[0].tools) {
        const toolCallInput = result.toolCalls?.[0]?.input;
        logger.trace("Result", { result: toolCallInput });
      }

      return result;
    } catch (error) {
      await handleError(error, userEmail);
      throw error;
    }
  };
}

export function createGenerateObject({
  userEmail,
  label,
  modelOptions,
}: {
  userEmail: string;
  label: string;
  modelOptions: ReturnType<typeof getModel>;
}): typeof generateObject {
  return async (...args) => {
    try {
      logger.trace("Generating object", {
        system: args[0].system,
        prompt: args[0].prompt,
      });

      const result = await generateObject(...args);

      if (result.usage) {
        await saveAiUsage({
          email: userEmail,
          usage: result.usage,
          provider: modelOptions.provider,
          model: modelOptions.modelName,
          label,
        });
      }

      logger.trace("Generated object", { result: result.object });

      return result;
    } catch (error) {
      await handleError(error, userEmail);
      throw error;
    }
  };
}

type ChatCompletionObjectArgs<T> = {
  userAi: UserAIFields;
  modelType?: ModelType;
  schema: z.Schema<T>;
  schemaName?: string;
  schemaDescription?: string;
  output?: "object" | "array" | "enum" | "no-schema";
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
      messages: ModelMessage[];
    }
);

export async function chatCompletionObject<T>(
  options: ChatCompletionObjectArgs<T>,
) {
  return withBackupModel(chatCompletionObjectInternal, options);
}

async function chatCompletionObjectInternal<T>({
  userAi,
  modelType,
  system,
  prompt,
  messages,
  schema,
  schemaName,
  schemaDescription,
  output = "object",
  userEmail,
  usageLabel,
}: ChatCompletionObjectArgs<T>) {
  try {
    const { provider, model, modelName, providerOptions } = getModel(
      userAi,
      modelType,
    );

    const result = await generateObject({
      model,
      system,
      prompt,
      messages,
      schema,
      schemaName,
      schemaDescription,
      output,
      providerOptions,
      ...commonOptions,
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model: modelName,
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
  modelType,
  system,
  prompt,
  messages,
  tools,
  maxSteps,
  userEmail,
  usageLabel: label,
  onFinish,
  onStepFinish,
}: {
  userAi: UserAIFields;
  modelType?: ModelType;
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  tools?: Record<string, Tool>;
  maxSteps?: number;
  userEmail: string;
  usageLabel: string;
  onFinish?: StreamTextOnFinishCallback<Record<string, Tool>>;
  onStepFinish?: StreamTextOnStepFinishCallback<Record<string, Tool>>;
}) {
  const { provider, model, modelName, providerOptions } = getModel(
    userAi,
    modelType,
  );

  const result = streamText({
    model,
    system,
    prompt,
    messages,
    tools,
    stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
    providerOptions,
    ...commonOptions,
    experimental_transform: smoothStream({ chunking: "word" }),
    onStepFinish,
    onFinish: async (result) => {
      const usagePromise = saveAiUsage({
        email: userEmail,
        provider,
        model: modelName,
        usage: result.usage,
        label,
      });

      const finishPromise = onFinish?.(result);

      try {
        await Promise.all([usagePromise, finishPromise]);
      } catch (error) {
        logger.error("Error in onFinish callback", {
          label,
          userEmail,
          error,
        });
        logger.trace("Result", { result });
        captureException(
          error,
          {
            extra: { label },
          },
          userEmail,
        );
      }
    },
    onError: (error) => {
      logger.error("Error in chat completion stream", {
        label,
        userEmail,
        error,
      });
      captureException(
        error,
        {
          extra: { label },
        },
        userEmail,
      );
    },
  });

  return result;
}

type ChatCompletionToolsArgs<TOOLS extends ToolSet = ToolSet> = {
  userAi: UserAIFields;
  modelType?: ModelType;
  tools?: TOOLS;
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
      messages: ModelMessage[];
    }
);

export async function chatCompletionTools<TOOLS extends ToolSet = ToolSet>(
  options: ChatCompletionToolsArgs<TOOLS>,
) {
  return withBackupModel(chatCompletionToolsInternal<TOOLS>, options);
}

async function chatCompletionToolsInternal<TOOLS extends ToolSet = ToolSet>({
  userAi,
  modelType,
  system,
  prompt,
  messages,
  tools,
  maxSteps,
  label,
  userEmail,
}: ChatCompletionToolsArgs<TOOLS>) {
  try {
    const { provider, model, modelName, providerOptions } = getModel(
      userAi,
      modelType,
    );

    const result = await generateText({
      model,
      tools,
      toolChoice: "required",
      system,
      prompt,
      messages,
      stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
      providerOptions,
      ...commonOptions,
    });

    if (result.usage) {
      await saveAiUsage({
        email: userEmail,
        usage: result.usage,
        provider,
        model: modelName,
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
// async function _streamCompletionTools({
//   userAi,
//   modelType,
//   prompt,
//   system,
//   tools,
//   maxSteps,
//   userEmail,
//   label,
//   onFinish,
// }: {
//   userAi: UserAIFields;
//   modelType?: ModelType;
//   prompt: string;
//   system?: string;
//   tools: Record<string, Tool>;
//   maxSteps?: number;
//   userEmail: string;
//   label: string;
//   onFinish?: (text: string) => Promise<void>;
// }) {
//   const { provider, model, llmModel, providerOptions } = getModel(
//     userAi,
//     modelType,
//   );

//   const result = streamText({
//     model: llmModel,
//     tools,
//     toolChoice: "required",
//     prompt,
//     system,
//     stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
//     providerOptions,
//     ...commonOptions,
//     onFinish: async ({ usage, text }) => {
//       const usagePromise = saveAiUsage({
//         email: userEmail,
//         provider,
//         model,
//         usage,
//         label,
//       });

//       const finishPromise = onFinish?.(text);

//       await Promise.all([usagePromise, finishPromise]);
//     },
//   });

//   return result;
// }

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
        logger.warn("Operation failed. Retrying...", {
          attempts,
          error,
        });

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
  logger.error("Error in LLM call", { error, userEmail });

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
