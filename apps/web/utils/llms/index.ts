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
import { getModel, type ModelType } from "@/utils/llms/model";
import { createScopedLogger } from "@/utils/logger";
import { withNetworkRetry } from "./retry";

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

      if (options.tools) {
        const toolCallInput = result.toolCalls?.[0]?.input;
        logger.trace("Result", {
          label,
          result: toolCallInput,
        });
      }

      return result;
    };

    try {
      return await withNetworkRetry(() => generate(modelOptions.model), {
        label,
      });
    } catch (error) {
      // Try backup model for service unavailable or throttling errors
      if (
        modelOptions.backupModel &&
        (isServiceUnavailableError(error) || isAWSThrottlingError(error))
      ) {
        logger.warn("Using backup model", {
          error,
          model: modelOptions.backupModel,
        });

        try {
          return await withNetworkRetry(
            () => generate(modelOptions.backupModel!),
            { label },
          );
        } catch (backupError) {
          await handleError(
            backupError,
            emailAccount.email,
            emailAccount.id,
            label,
            modelOptions.modelName,
          );
          throw backupError;
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
    const [options, ...restArgs] = args;

    const generate = async () => {
      logger.trace("Generating object", {
        label,
        system: options.system?.slice(0, MAX_LOG_LENGTH),
        prompt: options.prompt?.slice(0, MAX_LOG_LENGTH),
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
            logger.info("Repairing text", { label });
            const fixed = jsonrepair(text);
            return fixed;
          },
          ...options,
          ...commonOptions,
          model: modelOptions.model,
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
      });

      return result;
    };

    try {
      return await withNetworkRetry(generate, {
        label,
        // Also retry on validation errors for generateObject
        shouldRetry: (error) =>
          NoObjectGeneratedError.isInstance(error) ||
          TypeValidationError.isInstance(error),
      });
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
        captureException(error, {
          userEmail,
          extra: { label },
        });
      }
    },
    onError: (error) => {
      logger.error("Error in chat completion stream", {
        label,
        userEmail,
        error,
      });
      captureException(error, {
        userEmail,
        extra: { label },
      });
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
