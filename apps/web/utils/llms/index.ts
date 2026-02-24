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
import { env } from "@/env";
import { saveAiUsage } from "@/utils/usage";
import type { EmailAccountWithAI, UserAIFields } from "@/utils/llms/types";
import {
  addUserErrorMessageWithNotification,
  ErrorType,
} from "@/utils/error-messages";
import {
  captureException,
  isAnthropicInsufficientBalanceError,
  isIncorrectOpenAIAPIKeyError,
  isInsufficientCreditsError,
  isInvalidAIModelError,
  isOpenAIAPIKeyDeactivatedError,
  isAiQuotaExceededError,
  markAsHandledUserKeyError,
  SafeError,
} from "@/utils/error";
import {
  getModel,
  type ModelType,
  type ResolvedModel,
  type SelectModel,
} from "@/utils/llms/model";
import { shouldForceNanoModel } from "@/utils/llms/model-usage-guard";
import { Provider } from "@/utils/llms/config";
import { createScopedLogger } from "@/utils/logger";
import {
  extractLLMErrorInfo,
  isTransientNetworkError,
  withNetworkRetry,
  withLLMRetry,
} from "./retry";

const logger = createScopedLogger("llms");

const MAX_LOG_LENGTH = 200;
const NO_USER_AI_FIELDS: UserAIFields = {
  aiProvider: null,
  aiModel: null,
  aiApiKey: null,
};

type LLMProviderOptions = Record<string, Record<string, JSONValue>>;

const commonOptions: {
  experimental_telemetry: { isEnabled: boolean };
  headers?: Record<string, string>;
  providerOptions?: LLMProviderOptions;
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
    const { modelOptions: effectiveModelOptions, modelCandidates } =
      await resolveModelCandidates({
        modelOptions,
        userEmail: emailAccount.email,
        userId: emailAccount.userId,
        emailAccountId: emailAccount.id,
        label,
      });

    const generate = async (candidate: ResolvedModel) => {
      const systemText =
        typeof options.system === "string" ? options.system : undefined;

      logger.trace("Generating text", {
        label,
        system: systemText?.slice(0, MAX_LOG_LENGTH),
        prompt: options.prompt?.slice(0, MAX_LOG_LENGTH),
      });

      const providerOptions = buildProviderOptions({
        provider: candidate.provider,
        modelProviderOptions: candidate.providerOptions as
          | LLMProviderOptions
          | undefined,
        requestProviderOptions: options.providerOptions as
          | LLMProviderOptions
          | undefined,
        userId: emailAccount.userId,
        label,
        emailAccountId: emailAccount.id,
      });

      const result = await generateText(
        {
          ...options,
          ...commonOptions,
          providerOptions,
          model: candidate.model,
        },
        ...restArgs,
      );

      if (result.usage) {
        await saveAiUsage({
          email: emailAccount.email,
          usage: result.usage,
          provider: candidate.provider,
          model: candidate.modelName,
          label,
          hasUserApiKey: effectiveModelOptions.hasUserApiKey,
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

    for (let index = 0; index < modelCandidates.length; index++) {
      const candidate = modelCandidates[index];
      const nextCandidate = modelCandidates[index + 1];

      try {
        return await withLLMRetry(
          () => withNetworkRetry(() => generate(candidate), { label }),
          { label },
        );
      } catch (error) {
        if (nextCandidate && shouldFallbackToNextModel(error)) {
          logger.warn("LLM call failed, trying fallback model", {
            label,
            provider: candidate.provider,
            model: candidate.modelName,
            fallbackProvider: nextCandidate.provider,
            fallbackModel: nextCandidate.modelName,
            error,
          });
          continue;
        }

        await handleError(
          error,
          emailAccount.userId,
          emailAccount.email,
          emailAccount.id,
          label,
          candidate.modelName,
          effectiveModelOptions.hasUserApiKey,
        );
        throw error;
      }
    }

    throw new Error("No models available for generation");
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
    const { modelOptions: effectiveModelOptions, modelCandidates } =
      await resolveModelCandidates({
        modelOptions,
        userEmail: emailAccount.email,
        userId: emailAccount.userId,
        emailAccountId: emailAccount.id,
        label,
      });

    const generate = async (candidate: ResolvedModel) => {
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

      const providerOptions = buildProviderOptions({
        provider: candidate.provider,
        modelProviderOptions: candidate.providerOptions as
          | LLMProviderOptions
          | undefined,
        requestProviderOptions: options.providerOptions as
          | LLMProviderOptions
          | undefined,
        userId: emailAccount.userId,
        label,
        emailAccountId: emailAccount.id,
      });

      const result = await generateObject(
        {
          experimental_repairText: async ({ text }) => {
            logger.info("Repairing text", { label });
            const fixed = jsonrepair(text);
            return fixed;
          },
          ...options,
          ...commonOptions,
          providerOptions,
          model: candidate.model,
        },
        ...restArgs,
      );

      if (result.usage) {
        await saveAiUsage({
          email: emailAccount.email,
          usage: result.usage,
          provider: candidate.provider,
          model: candidate.modelName,
          label,
          hasUserApiKey: effectiveModelOptions.hasUserApiKey,
        });
      }

      logger.trace("Generated object", {
        label,
        result: result.object,
      });

      return result;
    };

    for (let index = 0; index < modelCandidates.length; index++) {
      const candidate = modelCandidates[index];
      const nextCandidate = modelCandidates[index + 1];

      try {
        return await withLLMRetry(
          () =>
            withNetworkRetry(() => generate(candidate), {
              label,
              shouldRetry: (error) =>
                NoObjectGeneratedError.isInstance(error) ||
                TypeValidationError.isInstance(error),
            }),
          { label },
        );
      } catch (error) {
        if (nextCandidate && shouldFallbackToNextModel(error)) {
          logger.warn("LLM object generation failed, trying fallback model", {
            label,
            provider: candidate.provider,
            model: candidate.modelName,
            fallbackProvider: nextCandidate.provider,
            fallbackModel: nextCandidate.modelName,
            error,
          });
          continue;
        }

        await handleError(
          error,
          emailAccount.userId,
          emailAccount.email,
          emailAccount.id,
          label,
          candidate.modelName,
          effectiveModelOptions.hasUserApiKey,
        );
        throw error;
      }
    }

    throw new Error("No models available for generation");
  };
}

export async function chatCompletionStream({
  userAi,
  modelType,
  messages,
  tools,
  maxSteps,
  userId,
  emailAccountId,
  userEmail,
  usageLabel: label,
  providerOptions: requestProviderOptions,
  onFinish,
  onStepFinish,
}: {
  userAi: UserAIFields;
  modelType?: ModelType;
  messages: ModelMessage[];
  tools?: Record<string, Tool>;
  maxSteps?: number;
  userId?: string;
  emailAccountId?: string;
  userEmail: string;
  usageLabel: string;
  providerOptions?: LLMProviderOptions;
  onFinish?: StreamTextOnFinishCallback<Record<string, Tool>>;
  onStepFinish?: StreamTextOnStepFinishCallback<Record<string, Tool>>;
}) {
  const { modelOptions, modelCandidates } = await resolveModelCandidates({
    modelOptions: getModel(userAi, modelType),
    userEmail,
    userId,
    emailAccountId,
    label,
  });

  for (let index = 0; index < modelCandidates.length; index++) {
    const candidate = modelCandidates[index];
    const nextCandidate = modelCandidates[index + 1];
    const providerOptions = buildProviderOptions({
      provider: candidate.provider,
      modelProviderOptions: candidate.providerOptions as
        | LLMProviderOptions
        | undefined,
      requestProviderOptions,
      userId,
      label,
      emailAccountId,
    });

    try {
      return streamText({
        model: candidate.model,
        messages,
        tools,
        stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
        ...commonOptions,
        providerOptions: providerOptions,
        experimental_transform: smoothStream({ chunking: "word" }),
        onStepFinish,
        onFinish: async (result) => {
          const usagePromise = saveAiUsage({
            email: userEmail,
            provider: candidate.provider,
            model: candidate.modelName,
            usage: result.usage,
            label,
            hasUserApiKey: modelOptions.hasUserApiKey,
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
    } catch (error) {
      if (nextCandidate && shouldFallbackToNextModel(error)) {
        logger.warn("Chat completion failed, trying fallback model", {
          label,
          provider: candidate.provider,
          model: candidate.modelName,
          fallbackProvider: nextCandidate.provider,
          fallbackModel: nextCandidate.modelName,
          error,
        });
        continue;
      }

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

  throw new Error("No models available for chat completion stream");
}

export async function toolCallAgentStream({
  userAi,
  modelType,
  messages,
  tools,
  maxSteps,
  userId,
  emailAccountId,
  userEmail,
  usageLabel: label,
  providerOptions: requestProviderOptions,
  onFinish,
  onStepFinish,
}: {
  userAi: UserAIFields;
  modelType?: ModelType;
  messages: ModelMessage[];
  tools?: Record<string, Tool>;
  maxSteps?: number;
  userId?: string;
  emailAccountId?: string;
  userEmail: string;
  usageLabel: string;
  providerOptions?: LLMProviderOptions;
  onFinish?: StreamTextOnFinishCallback<Record<string, Tool>>;
  onStepFinish?: StreamTextOnStepFinishCallback<Record<string, Tool>>;
}) {
  const { modelOptions, modelCandidates } = await resolveModelCandidates({
    modelOptions: getModel(userAi, modelType),
    userEmail,
    userId,
    emailAccountId,
    label,
  });

  for (let index = 0; index < modelCandidates.length; index++) {
    const candidate = modelCandidates[index];
    const nextCandidate = modelCandidates[index + 1];
    const providerOptions = buildProviderOptions({
      provider: candidate.provider,
      modelProviderOptions: candidate.providerOptions as
        | LLMProviderOptions
        | undefined,
      requestProviderOptions,
      userId,
      label,
      emailAccountId,
    });

    const agent = new ToolLoopAgent({
      model: candidate.model,
      tools,
      stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
      ...commonOptions,
      providerOptions,
      onFinish: async (result) => {
        const usagePromise = saveAiUsage({
          email: userEmail,
          provider: candidate.provider,
          model: candidate.modelName,
          usage: result.totalUsage,
          label,
          hasUserApiKey: modelOptions.hasUserApiKey,
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
      if (nextCandidate && shouldFallbackToNextModel(error)) {
        logger.warn("Tool-call stream failed, trying fallback model", {
          label,
          provider: candidate.provider,
          model: candidate.modelName,
          fallbackProvider: nextCandidate.provider,
          fallbackModel: nextCandidate.modelName,
          error,
        });
        continue;
      }

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

  throw new Error("No models available for tool-call stream");
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

async function getCostControlledModelOptions({
  modelOptions,
  userEmail,
  userId,
  emailAccountId,
  label,
}: {
  modelOptions: SelectModel;
  userEmail: string;
  userId?: string;
  emailAccountId?: string;
  label: string;
}): Promise<SelectModel> {
  const guard = await shouldForceNanoModel({
    userEmail,
    hasUserApiKey: modelOptions.hasUserApiKey,
    label,
    userId,
    emailAccountId,
  });

  if (!guard.shouldForce) return modelOptions;

  try {
    const nanoModelOptions = getModel(NO_USER_AI_FIELDS, "nano");
    const isResolvedConfiguredNanoModel =
      !!env.NANO_LLM_PROVIDER &&
      !!env.NANO_LLM_MODEL &&
      nanoModelOptions.provider === env.NANO_LLM_PROVIDER &&
      nanoModelOptions.modelName === env.NANO_LLM_MODEL;

    if (!isResolvedConfiguredNanoModel) {
      logger.warn(
        "Nano usage guard triggered but nano model is not available",
        {
          label,
          userId,
          emailAccountId,
          weeklySpendUsd: guard.weeklySpendUsd,
          weeklyLimitUsd: guard.weeklyLimitUsd,
          configuredProvider: env.NANO_LLM_PROVIDER,
          configuredModel: env.NANO_LLM_MODEL,
          resolvedProvider: nanoModelOptions.provider,
          resolvedModel: nanoModelOptions.modelName,
        },
      );
      return modelOptions;
    }

    if (
      nanoModelOptions.provider === modelOptions.provider &&
      nanoModelOptions.modelName === modelOptions.modelName
    ) {
      return modelOptions;
    }

    logger.info("Switching to nano model due to weekly AI spend", {
      label,
      userId,
      emailAccountId,
      weeklySpendUsd: guard.weeklySpendUsd,
      weeklyLimitUsd: guard.weeklyLimitUsd,
      previousProvider: modelOptions.provider,
      previousModel: modelOptions.modelName,
      nextProvider: nanoModelOptions.provider,
      nextModel: nanoModelOptions.modelName,
    });

    return nanoModelOptions;
  } catch (error) {
    logger.error("Failed to resolve nano model during usage guard", {
      label,
      userId,
      emailAccountId,
      error,
    });
    return modelOptions;
  }
}

async function resolveModelCandidates({
  modelOptions,
  userEmail,
  userId,
  emailAccountId,
  label,
}: {
  modelOptions: SelectModel;
  userEmail: string;
  userId?: string;
  emailAccountId?: string;
  label: string;
}): Promise<{ modelOptions: SelectModel; modelCandidates: ResolvedModel[] }> {
  const effectiveModelOptions = await getCostControlledModelOptions({
    modelOptions,
    userEmail,
    userId,
    emailAccountId,
    label,
  });

  return {
    modelOptions: effectiveModelOptions,
    modelCandidates: getModelCandidates(effectiveModelOptions),
  };
}

function getModelCandidates(modelOptions: SelectModel): ResolvedModel[] {
  const primaryModel: ResolvedModel = {
    provider: modelOptions.provider,
    modelName: modelOptions.modelName,
    model: modelOptions.model,
    providerOptions: modelOptions.providerOptions,
  };

  return [primaryModel, ...modelOptions.fallbackModels];
}

function shouldFallbackToNextModel(error: unknown): boolean {
  if (RetryError.isInstance(error) && isAiQuotaExceededError(error)) {
    return true;
  }

  const llmErrorInfo = extractLLMErrorInfo(error);
  if (llmErrorInfo.retryable) return true;

  return isTransientNetworkError(error);
}

function mergeProviderOptions(
  ...providerOptionsList: (LLMProviderOptions | undefined)[]
) {
  const merged: LLMProviderOptions = {};

  for (const options of providerOptionsList) {
    if (!options) continue;

    for (const [providerKey, value] of Object.entries(options)) {
      merged[providerKey] = {
        ...(merged[providerKey] || {}),
        ...value,
      };
    }
  }

  return merged;
}

function buildProviderOptions({
  provider,
  modelProviderOptions,
  requestProviderOptions,
  userId,
  label,
  emailAccountId,
}: {
  provider: string;
  modelProviderOptions?: LLMProviderOptions;
  requestProviderOptions?: LLMProviderOptions;
  userId?: string;
  label?: string;
  emailAccountId?: string;
}) {
  const mergedProviderOptions = mergeProviderOptions(
    commonOptions.providerOptions,
    modelProviderOptions,
    requestProviderOptions,
  );

  return withOpenRouterMetadata({
    provider,
    providerOptions: mergedProviderOptions,
    userId,
    label,
    emailAccountId,
  });
}

function withOpenRouterMetadata({
  provider,
  providerOptions,
  userId,
  label,
  emailAccountId,
}: {
  provider: string;
  providerOptions: LLMProviderOptions;
  userId?: string;
  label?: string;
  emailAccountId?: string;
}) {
  if (provider !== Provider.OPENROUTER) return providerOptions;

  const openRouterOptions = providerOptions.openrouter || {};
  const nextOpenRouterOptions: Record<string, JSONValue> = {
    ...openRouterOptions,
  };

  let changed = false;

  if (
    userId &&
    !(typeof openRouterOptions.user === "string" && openRouterOptions.user)
  ) {
    nextOpenRouterOptions.user = userId;
    changed = true;
  }

  const openRouterTrace = isJsonObject(openRouterOptions.trace)
    ? openRouterOptions.trace
    : undefined;

  const nextTrace: Record<string, JSONValue> = {
    ...(openRouterTrace || {}),
  };
  let traceChanged = false;

  if (label && typeof nextTrace.trace_name !== "string") {
    nextTrace.trace_name = label;
    traceChanged = true;
  }

  if (label && typeof nextTrace.generation_name !== "string") {
    nextTrace.generation_name = label;
    traceChanged = true;
  }

  if (emailAccountId && typeof nextTrace.email_account_id !== "string") {
    nextTrace.email_account_id = emailAccountId;
    traceChanged = true;
  }

  if (traceChanged) {
    nextOpenRouterOptions.trace = nextTrace;
    changed = true;
  }

  if (!changed) return providerOptions;

  return {
    ...providerOptions,
    openrouter: nextOpenRouterOptions,
  };
}

function isJsonObject(
  value: JSONValue | undefined,
): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
