import {
  APICallError,
  type ModelMessage,
  type Tool,
  ToolLoopAgent,
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
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { saveAiUsage } from "@/utils/usage";
import type { EmailAccountWithAI, UserAIFields } from "@/utils/llms/types";
import {
  addUserErrorMessageWithNotification,
  ErrorType,
} from "@/utils/error-messages";
import {
  captureException,
  isAnthropicInsufficientBalanceError,
  isAWSThrottlingError,
  isIncorrectOpenAIAPIKeyError,
  isInsufficientCreditsError,
  isInvalidAIModelError,
  isOpenAIAPIKeyDeactivatedError,
  isAiQuotaExceededError,
  isServiceUnavailableError,
  markAsHandledUserKeyError,
  SafeError,
} from "@/utils/error";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createScopedLogger } from "@/utils/logger";
import { withNetworkRetry, withLLMRetry } from "./retry";

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
  emailAccount: Pick<EmailAccountWithAI, "email" | "id" | "userId">;
  label: string;
  modelOptions: ReturnType<typeof getModel>;
}): typeof generateText {
  return async (...args) => {
    const [options, ...restArgs] = args;

    const generate = async (model: LanguageModelV3) => {
      const systemText =
        typeof options.system === "string" ? options.system : undefined;

      logger.trace("Generating text", {
        label,
        system: systemText?.slice(0, MAX_LOG_LENGTH),
        prompt: options.prompt?.slice(0, MAX_LOG_LENGTH),
      });

      const result = await generateText(
        {
          ...options,
          ...commonOptions,
          providerOptions: {
            ...commonOptions.providerOptions,
            ...modelOptions.providerOptions,
            ...options.providerOptions,
          },
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
      return await withLLMRetry(
        () => withNetworkRetry(() => generate(modelOptions.model), { label }),
        { label },
      );
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
          return await withLLMRetry(
            () =>
              withNetworkRetry(() => generate(modelOptions.backupModel!), {
                label,
              }),
            { label },
          );
        } catch (backupError) {
          await handleError(
            backupError,
            emailAccount.userId,
            emailAccount.email,
            emailAccount.id,
            label,
            modelOptions.modelName,
            modelOptions.hasUserApiKey,
          );
          throw backupError;
        }
      }

      await handleError(
        error,
        emailAccount.userId,
        emailAccount.email,
        emailAccount.id,
        label,
        modelOptions.modelName,
        modelOptions.hasUserApiKey,
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
  emailAccount: Pick<EmailAccountWithAI, "email" | "id" | "userId">;
  label: string;
  modelOptions: ReturnType<typeof getModel>;
}): typeof generateObject {
  return async (...args) => {
    const [options, ...restArgs] = args;

    const generate = async () => {
      const systemText =
        typeof options.system === "string" ? options.system : undefined;

      logger.trace("Generating object", {
        label,
        system: systemText?.slice(0, MAX_LOG_LENGTH),
        prompt: options.prompt?.slice(0, MAX_LOG_LENGTH),
      });

      if (
        !systemText?.includes("JSON") &&
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
          providerOptions: {
            ...commonOptions.providerOptions,
            ...modelOptions.providerOptions,
            ...options.providerOptions,
          },
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
      return await withLLMRetry(
        () =>
          withNetworkRetry(generate, {
            label,
            shouldRetry: (error) =>
              NoObjectGeneratedError.isInstance(error) ||
              TypeValidationError.isInstance(error),
          }),
        { label },
      );
    } catch (error) {
      await handleError(
        error,
        emailAccount.userId,
        emailAccount.email,
        emailAccount.id,
        label,
        modelOptions.modelName,
        modelOptions.hasUserApiKey,
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
  const mergedProviderOptions = {
    ...commonOptions.providerOptions,
    ...providerOptions,
  };

  const result = streamText({
    model,
    messages,
    tools,
    stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
    ...commonOptions,
    providerOptions: {
      ...mergedProviderOptions,
    },
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

export async function toolCallAgentStream({
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

  const mergedProviderOptions = {
    ...commonOptions.providerOptions,
    ...providerOptions,
  };

  const agent = new ToolLoopAgent({
    model,
    tools,
    stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
    ...commonOptions,
    providerOptions: mergedProviderOptions,
    onFinish: async (result) => {
      const usagePromise = saveAiUsage({
        email: userEmail,
        provider,
        model: modelName,
        usage: result.totalUsage,
        label,
      });

      const finishPromise = onFinish?.(
        result as Parameters<
          NonNullable<StreamTextOnFinishCallback<Record<string, Tool>>>
        >[0],
      );

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
  });

  try {
    return await agent.stream({
      messages,
      experimental_transform: smoothStream({ chunking: "word" }),
      onStepFinish: onStepFinish
        ? async (stepResult) => {
            await onStepFinish(
              stepResult as Parameters<
                NonNullable<
                  StreamTextOnStepFinishCallback<Record<string, Tool>>
                >
              >[0],
            );
          }
        : undefined,
    });
  } catch (error) {
    logger.error("Error in chat completion stream", {
      label,
      userEmail,
      error,
    });
    captureException(error, {
      userEmail,
      extra: { label },
    });
    throw error;
  }
}

async function handleError(
  error: unknown,
  userId: string,
  userEmail: string,
  emailAccountId: string,
  label: string,
  modelName: string,
  hasUserApiKey: boolean,
) {
  const isUserKeyInsufficientCredits =
    hasUserApiKey &&
    APICallError.isInstance(error) &&
    isInsufficientCreditsError(error);

  if (isUserKeyInsufficientCredits) {
    logger.warn("User API key has insufficient credits", {
      userId,
      emailAccountId,
      label,
      modelName,
    });
  } else {
    logger.error("Error in LLM call", {
      error,
      userId,
      userEmail,
      emailAccountId,
      label,
      modelName,
    });
  }

  if (RetryError.isInstance(error) && isAiQuotaExceededError(error)) {
    return await addUserErrorMessageWithNotification({
      userId,
      userEmail,
      emailAccountId,
      errorType: ErrorType.AI_QUOTA_ERROR,
      errorMessage:
        "Your AI provider has rejected requests due to rate limits or quota. Please check your provider account if this persists.",
      logger,
    });
  }

  if (APICallError.isInstance(error)) {
    if (isIncorrectOpenAIAPIKeyError(error)) {
      return await addUserErrorMessageWithNotification({
        userId,
        userEmail,
        emailAccountId,
        errorType: ErrorType.INCORRECT_OPENAI_API_KEY,
        errorMessage:
          "Your OpenAI API key is invalid. Please update it in your settings.",
        logger,
      });
    }

    if (isInvalidAIModelError(error)) {
      await addUserErrorMessageWithNotification({
        userId,
        userEmail,
        emailAccountId,
        errorType: ErrorType.INVALID_AI_MODEL,
        errorMessage:
          "The AI model you specified does not exist. Please check your settings.",
        logger,
      });
      throw new SafeError(
        "The AI model you specified does not exist. Please update your AI settings.",
      );
    }

    if (isOpenAIAPIKeyDeactivatedError(error)) {
      return await addUserErrorMessageWithNotification({
        userId,
        userEmail,
        emailAccountId,
        errorType: ErrorType.OPENAI_API_KEY_DEACTIVATED,
        errorMessage:
          "Your OpenAI API key has been deactivated. Please update it in your settings.",
        logger,
      });
    }

    if (isAnthropicInsufficientBalanceError(error)) {
      return await addUserErrorMessageWithNotification({
        userId,
        userEmail,
        emailAccountId,
        errorType: ErrorType.ANTHROPIC_INSUFFICIENT_BALANCE,
        errorMessage:
          "Your Anthropic account has insufficient credits. Please add credits or update your settings.",
        logger,
      });
    }

    if (isInsufficientCreditsError(error) && hasUserApiKey) {
      markAsHandledUserKeyError(error);
      return await addUserErrorMessageWithNotification({
        userId,
        userEmail,
        emailAccountId,
        errorType: ErrorType.INSUFFICIENT_CREDITS,
        errorMessage:
          "Your AI provider account has insufficient credits. Please add credits or update your API key in settings.",
        logger,
      });
    }
  }
}
