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
} from "ai";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { saveAiUsage } from "@/utils/usage";
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
    const [options, ...restArgs] = args;

    const generate = async (model: LanguageModelV2) => {
      logger.trace("Generating text", {
        system: options.system,
        prompt: options.prompt,
      });

      const result = await generateText(
        {
          ...options,
          ...commonOptions,
          model,
        },
        ...restArgs,
      );

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
    };

    try {
      return await generate(modelOptions.model);
    } catch (error) {
      if (
        modelOptions.backupModel &&
        (isServiceUnavailableError(error) || isAWSThrottlingError(error))
      ) {
        logger.warn("Using backup model", {
          error,
          model: modelOptions.backupModel,
        });

        try {
          return await generate(modelOptions.backupModel);
        } catch (error) {
          await handleError(error, userEmail);
          throw error;
        }
      }

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
      const [options, ...restArgs] = args;

      logger.trace("Generating object", {
        system: options.system,
        prompt: options.prompt,
      });

      const result = await generateObject(
        {
          ...options,
          ...commonOptions,
        },
        ...restArgs,
      );

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
