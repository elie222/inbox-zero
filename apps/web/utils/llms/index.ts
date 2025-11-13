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
  NoObjectGeneratedError,
  TypeValidationError,
} from "ai";
import { jsonrepair } from "jsonrepair";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { saveAiUsage } from "@/utils/usage";
import type { EmailAccountWithAI, UserAIFields } from "@/utils/llms/types";
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

const MAX_LOG_LENGTH = 200;

const commonOptions: {
  experimental_telemetry: { isEnabled: boolean };
  headers?: Record<string, string>;
  providerOptions?: Record<string, Record<string, JSONValue>>;
} = { experimental_telemetry: { isEnabled: true } };

export function createGenerateText({
  emailAccount,
  label,
  modelOptions,
}: {
  emailAccount: Pick<EmailAccountWithAI, "email" | "id">;
  label: string;
  modelOptions: ReturnType<typeof getModel>;
}): typeof generateText {
  return async (...args) => {
    const [options, ...restArgs] = args;

    const generate = async (model: LanguageModelV2) => {
      logger.trace("Generating text", {
        label,
        system: options.system?.slice(0, MAX_LOG_LENGTH),
        prompt: options.prompt?.slice(0, MAX_LOG_LENGTH),
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
          email: emailAccount.email,
          usage: result.usage,
          provider: modelOptions.provider,
          model: modelOptions.modelName,
          label,
        });
      }

      if (args[0].tools) {
        const toolCallInput = result.toolCalls?.[0]?.input;
        logger.trace("Result", {
          label,
          result: toolCallInput,
        });
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
          await handleError(
            error,
            emailAccount.email,
            emailAccount.id,
            label,
            modelOptions.modelName,
          );
          throw error;
        }
      }

      await handleError(
        error,
        emailAccount.email,
        emailAccount.id,
        label,
        modelOptions.modelName,
      );
      throw error;
    }
  };
}

export function createGenerateObject({
  emailAccount,
  label,
  modelOptions,
}: {
  emailAccount: Pick<EmailAccountWithAI, "email" | "id">;
  label: string;
  modelOptions: ReturnType<typeof getModel>;
}): typeof generateObject {
  return async (...args) => {
    const maxRetries = 2;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const [options, ...restArgs] = args;

        if (attempt > 0) {
          logger.info("Retrying generateObject after validation error", {
            label,
            attempt,
            maxRetries,
          });
        }

        logger.trace("Generating object", {
          label,
          system: options.system?.slice(0, MAX_LOG_LENGTH),
          prompt: options.prompt?.slice(0, MAX_LOG_LENGTH),
          attempt,
        });

        if (
          !options.system?.includes("JSON") &&
          typeof options.prompt === "string" &&
          !options.prompt?.includes("JSON")
        ) {
          logger.warn("Missing JSON in prompt", { label });
        }

        const result = await generateObject(
          {
            experimental_repairText: async ({ text }) => {
              logger.info("Repairing text", { label, attempt });
              const fixed = jsonrepair(text);
              return fixed;
            },
            ...options,
            ...commonOptions,
          },
          ...restArgs,
        );

        if (result.usage) {
          await saveAiUsage({
            email: emailAccount.email,
            usage: result.usage,
            provider: modelOptions.provider,
            model: modelOptions.modelName,
            label,
          });
        }

        logger.trace("Generated object", {
          label,
          result: result.object,
          attempt,
        });

        return result;
      } catch (error) {
        lastError = error;

        // Check if this is a validation error that we should retry
        const isValidationError =
          NoObjectGeneratedError.isInstance(error) ||
          TypeValidationError.isInstance(error);

        if (isValidationError && attempt < maxRetries) {
          logger.warn("Validation error, will retry", {
            label,
            attempt,
            maxRetries,
            errorName: error.name,
            errorMessage: error.message,
          });

          // Wait a bit before retrying
          await sleep(1000);
          continue;
        }

        // Not a validation error or out of retries
        await handleError(
          error,
          emailAccount.email,
          emailAccount.id,
          label,
          modelOptions.modelName,
        );
        throw error;
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError;
  };
}

export async function chatCompletionStream({
  userAi,
  modelType,
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
  messages: ModelMessage[];
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

async function handleError(
  error: unknown,
  userEmail: string,
  emailAccountId: string,
  label: string,
  modelName: string,
) {
  logger.error("Error in LLM call", {
    error,
    userEmail,
    emailAccountId,
    label,
    modelName,
  });

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
