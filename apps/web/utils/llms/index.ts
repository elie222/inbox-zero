import {
  APICallError,
  type ModelMessage,
  type Tool,
  ToolLoopAgent,
  type JSONValue,
  type FlexibleSchema,
  type InferSchema,
  type GenerateObjectResult,
  generateObject,
  generateText,
  RetryError,
  streamText,
  smoothStream,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type StreamTextOnStepFinishCallback,
  type PrepareStepFunction,
  NoObjectGeneratedError,
  TypeValidationError,
} from "ai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { withTracing } from "@posthog/ai/vercel";
import { jsonrepair } from "jsonrepair";
import { env } from "@/env";
import { saveAiUsage } from "@/utils/usage";
import type { EmailAccountWithAI, UserAIFields } from "@/utils/llms/types";
import {
  addUserErrorMessageWithNotification,
  ErrorType,
} from "@/utils/error-messages";
import {
  attachLlmRepairMetadata,
  captureException,
  isAnthropicInsufficientBalanceError,
  isContentFilterRefusal,
  isIncorrectOpenAIAPIKeyError,
  isInsufficientCreditsError,
  isInvalidAIModelError,
  type LlmRepairMetadata,
  isOpenAIAPIKeyDeactivatedError,
  isAiQuotaExceededError,
  markAsHandledUserKeyError,
  SafeError,
} from "@/utils/error";
import { hash } from "@/utils/hash";
import {
  getModel,
  type ModelType,
  type ResolvedModel,
  type SelectModel,
} from "@/utils/llms/model";
import { shouldForceNanoModel } from "@/utils/llms/model-usage-guard";
import { Provider } from "@/utils/llms/config";
import { createScopedLogger } from "@/utils/logger";
import { getPosthogLlmClient, isPosthogLlmEvalApproved } from "@/utils/posthog";
import {
  applyPromptHardeningToMessages,
  applyPromptHardeningToSystem,
  type PromptHardening,
} from "@/utils/ai/security";
import {
  enforceSensitiveDataPolicy,
  redactSensitiveContentForLogging,
} from "@/utils/llms/sensitive-content";
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
type RepairCandidateKind = "original" | "trimmed" | "unwrapped" | "extracted";
type RepairResultKind = "object-or-array" | "string-wrapped-object-or-array";
type RepairAttemptState = {
  inputLength: number;
  inputFingerprint: string;
  startsWithQuote: boolean;
  startsWithBrace: boolean;
  startsWithBracket: boolean;
  looksCodeFenced: boolean;
  candidateKindsTried: RepairCandidateKind[];
  successfulCandidateKind?: RepairCandidateKind;
};

type ProviderCostSource =
  | "openrouter_usage"
  | "openrouter_usage_with_step_fallback"
  | "openrouter_step_usage_sum";

type UsageMetadata = {
  providerReportedCost?: number;
  providerUpstreamInferenceCost?: number;
  providerCostSource?: ProviderCostSource;
  stepCount?: number;
  toolCallCount?: number;
};
type LlmEmailAccount = {
  sensitiveDataPolicy?: EmailAccountWithAI["sensitiveDataPolicy"];
  email: EmailAccountWithAI["email"];
  id: EmailAccountWithAI["id"];
  userId: EmailAccountWithAI["userId"];
};

export type ToolCallAgentResolvedModel = {
  excludedTools: string[];
  modelName?: string;
  provider: string;
  providerOptions: LLMProviderOptions;
  replacedTools: string[];
};

const commonOptions: {
  experimental_telemetry: { isEnabled: boolean };
  headers?: Record<string, string>;
  providerOptions?: LLMProviderOptions;
} = { experimental_telemetry: { isEnabled: true } };

export function createGenerateText({
  emailAccount,
  label,
  modelOptions,
  promptHardening,
  onModelUsed,
}: {
  emailAccount: LlmEmailAccount;
  label: string;
  modelOptions: ReturnType<typeof getModel>;
  promptHardening: PromptHardening;
  onModelUsed?: (candidate: {
    provider: string;
    modelName: string;
  }) => void | Promise<void>;
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
      const systemText = applyPromptHardeningToSystem({
        system: typeof options.system === "string" ? options.system : undefined,
        promptHardening,
      });
      const protectedOptions = enforceSensitiveDataPolicy({
        options: { ...options, system: systemText },
        policy: emailAccount.sensitiveDataPolicy,
        logger,
        label,
        userId: emailAccount.userId,
        emailAccountId: emailAccount.id,
      });

      logger.trace("Generating text", {
        label,
        promptHardening,
        system: redactSensitiveContentForLogging(
          typeof protectedOptions.system === "string"
            ? protectedOptions.system
            : undefined,
        )?.slice(0, MAX_LOG_LENGTH),
        prompt: redactSensitiveContentForLogging(
          typeof protectedOptions.prompt === "string"
            ? protectedOptions.prompt
            : undefined,
        )?.slice(0, MAX_LOG_LENGTH),
      });

      const providerOptions = buildProviderOptions({
        provider: candidate.provider,
        modelName: candidate.modelName,
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
          ...protectedOptions,
          ...commonOptions,
          providerOptions,
          model: withPosthogTracing({
            model: candidate.model,
            userEmail: emailAccount.email,
            userId: emailAccount.userId,
            emailAccountId: emailAccount.id,
            label,
            provider: candidate.provider,
            modelName: candidate.modelName,
          }),
        },
        ...restArgs,
      );

      await onModelUsed?.({
        provider: candidate.provider,
        modelName: candidate.modelName,
      });

      if (result.usage) {
        await saveUsageWithMetadata({
          result,
          usage: result.usage,
          email: emailAccount.email,
          emailAccountId: emailAccount.id,
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
        if (error instanceof SafeError) throw error;

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
  promptHardening,
  onModelUsed,
}: {
  emailAccount: LlmEmailAccount;
  label: string;
  modelOptions: ReturnType<typeof getModel>;
  promptHardening: PromptHardening;
  onModelUsed?: (candidate: {
    provider: string;
    modelName: string;
  }) => void | Promise<void>;
}): typeof generateObject {
  return async function generateWithFallback<
    SCHEMA extends FlexibleSchema<unknown> = FlexibleSchema<JSONValue>,
    OUTPUT extends
      | "object"
      | "array"
      | "enum"
      | "no-schema" = InferSchema<SCHEMA> extends string ? "enum" : "object",
    RESULT = OUTPUT extends "array"
      ? Array<InferSchema<SCHEMA>>
      : InferSchema<SCHEMA>,
  >(
    options: Parameters<typeof generateObject<SCHEMA, OUTPUT, RESULT>>[0],
  ): Promise<GenerateObjectResult<RESULT>> {
    const { modelOptions: effectiveModelOptions, modelCandidates } =
      await resolveModelCandidates({
        modelOptions,
        userEmail: emailAccount.email,
        userId: emailAccount.userId,
        emailAccountId: emailAccount.id,
        label,
      });
    let latestRepairAttempt: RepairAttemptState | undefined;

    const generate = async (candidate: ResolvedModel) => {
      const systemText = applyPromptHardeningToSystem({
        system: typeof options.system === "string" ? options.system : undefined,
        promptHardening,
      });
      const protectedOptions = enforceSensitiveDataPolicy({
        options: { ...options, system: systemText },
        policy: emailAccount.sensitiveDataPolicy,
        logger,
        label,
        userId: emailAccount.userId,
        emailAccountId: emailAccount.id,
      });

      logger.trace("Generating object", {
        label,
        promptHardening,
        system: redactSensitiveContentForLogging(
          typeof protectedOptions.system === "string"
            ? protectedOptions.system
            : undefined,
        )?.slice(0, MAX_LOG_LENGTH),
        prompt: redactSensitiveContentForLogging(
          typeof protectedOptions.prompt === "string"
            ? protectedOptions.prompt
            : undefined,
        )?.slice(0, MAX_LOG_LENGTH),
      });

      // Only warn for prompt-shaped calls. Messages-shaped callers (no
      // `prompt` string) are out of scope; scanning every message for
      // the literal "JSON" would be brittle and noisy.
      const systemIncludesJson =
        typeof protectedOptions.system === "string" &&
        protectedOptions.system.includes("JSON");
      if (
        !systemIncludesJson &&
        typeof protectedOptions.prompt === "string" &&
        !protectedOptions.prompt.includes("JSON")
      ) {
        logger.warn("Missing JSON in prompt", { label });
      }

      const providerOptions = buildProviderOptions({
        provider: candidate.provider,
        modelName: candidate.modelName,
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

      const request = {
        experimental_repairText: async ({ text }: { text: string }) => {
          logger.info("Repairing text", { label });
          const repairResult = repairObjectText(text, label);
          latestRepairAttempt = repairResult.attempt;
          return repairResult.text;
        },
        ...protectedOptions,
        ...commonOptions,
        providerOptions,
        model: withPosthogTracing({
          model: candidate.model,
          userEmail: emailAccount.email,
          userId: emailAccount.userId,
          emailAccountId: emailAccount.id,
          label,
          provider: candidate.provider,
          modelName: candidate.modelName,
        }),
      } as unknown as Parameters<
        typeof generateObject<SCHEMA, OUTPUT, RESULT>
      >[0];

      const result = await generateObject<SCHEMA, OUTPUT, RESULT>(request);

      await onModelUsed?.({
        provider: candidate.provider,
        modelName: candidate.modelName,
      });

      if (result.usage) {
        await saveUsageWithMetadata({
          result,
          usage: result.usage,
          email: emailAccount.email,
          emailAccountId: emailAccount.id,
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
      latestRepairAttempt = undefined;

      try {
        return await withLLMRetry(
          () =>
            withNetworkRetry(() => generate(candidate), {
              label,
              shouldRetry: (error) =>
                (NoObjectGeneratedError.isInstance(error) &&
                  !isContentFilterRefusal(error)) ||
                TypeValidationError.isInstance(error),
            }),
          { label },
        );
      } catch (error) {
        if (error instanceof SafeError) throw error;

        attachLlmRepairMetadata(
          error,
          buildRepairMetadata({
            attempt: latestRepairAttempt,
            label,
            provider: candidate.provider,
            model: candidate.modelName,
          }),
        );

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
  promptHardening,
  tools,
  maxSteps,
  userId,
  emailAccountId,
  userEmail,
  usageLabel: label,
  providerOptions: requestProviderOptions,
  sensitiveDataPolicy,
  onFinish,
  onStepFinish,
}: {
  userAi: UserAIFields;
  modelType?: ModelType;
  messages: ModelMessage[];
  promptHardening: PromptHardening;
  tools?: Record<string, Tool>;
  maxSteps?: number;
  userId?: string;
  emailAccountId: string;
  userEmail: string;
  usageLabel: string;
  providerOptions?: LLMProviderOptions;
  sensitiveDataPolicy?: string | null;
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
  const hardenedMessages = applyPromptHardeningToMessages({
    messages,
    promptHardening,
  });
  const protectedMessages = enforceSensitiveDataPolicy({
    options: { messages: hardenedMessages },
    policy: sensitiveDataPolicy,
    logger,
    label,
    userId,
    emailAccountId,
  }).messages;

  for (let index = 0; index < modelCandidates.length; index++) {
    const candidate = modelCandidates[index];
    const nextCandidate = modelCandidates[index + 1];
    const providerOptions = buildProviderOptions({
      provider: candidate.provider,
      modelName: candidate.modelName,
      modelProviderOptions: candidate.providerOptions as
        | LLMProviderOptions
        | undefined,
      requestProviderOptions,
      userId,
      label,
      emailAccountId,
    });
    const model = withPosthogTracing({
      model: candidate.model,
      userEmail,
      userId,
      emailAccountId,
      label,
      provider: candidate.provider,
      modelName: candidate.modelName,
    });

    try {
      return streamText({
        model,
        messages: protectedMessages as ModelMessage[],
        tools,
        stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
        ...commonOptions,
        providerOptions: providerOptions,
        experimental_transform: smoothStream({ chunking: "word" }),
        onStepFinish,
        onFinish: async (result) => {
          const usagePromise = saveUsageWithMetadata({
            result,
            usage: result.usage,
            email: userEmail,
            emailAccountId,
            provider: candidate.provider,
            model: candidate.modelName,
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
  promptHardening,
  tools,
  activeTools,
  prepareStep,
  maxSteps,
  userId,
  emailAccountId,
  userEmail,
  usageLabel: label,
  providerOptions: requestProviderOptions,
  onFinish,
  onStepFinish,
  onModelResolved,
  sensitiveDataPolicy,
  temperature,
}: {
  userAi: UserAIFields;
  modelType?: ModelType;
  messages: ModelMessage[];
  promptHardening: PromptHardening;
  tools?: Record<string, Tool>;
  activeTools?: Array<string>;
  prepareStep?: PrepareStepFunction<Record<string, Tool>>;
  maxSteps?: number;
  userId?: string;
  emailAccountId: string;
  userEmail: string;
  usageLabel: string;
  providerOptions?: LLMProviderOptions;
  onFinish?: StreamTextOnFinishCallback<Record<string, Tool>>;
  onStepFinish?: StreamTextOnStepFinishCallback<Record<string, Tool>>;
  onModelResolved?: (resolvedModel: ToolCallAgentResolvedModel) => void;
  sensitiveDataPolicy?: string | null;
  temperature?: number;
}) {
  const { modelOptions, modelCandidates } = await resolveModelCandidates({
    modelOptions: getModel(userAi, modelType),
    userEmail,
    userId,
    emailAccountId,
    label,
  });
  const hardenedMessages = applyPromptHardeningToMessages({
    messages,
    promptHardening,
  });
  const protectedMessages = enforceSensitiveDataPolicy({
    options: { messages: hardenedMessages },
    policy: sensitiveDataPolicy,
    logger,
    label,
    userId,
    emailAccountId,
  }).messages;

  for (let index = 0; index < modelCandidates.length; index++) {
    const candidate = modelCandidates[index];
    const nextCandidate = modelCandidates[index + 1];
    const providerOptions = buildProviderOptions({
      provider: candidate.provider,
      modelName: candidate.modelName,
      modelProviderOptions: candidate.providerOptions as
        | LLMProviderOptions
        | undefined,
      requestProviderOptions,
      userId,
      label,
      emailAccountId,
    });
    const model = withPosthogTracing({
      model: candidate.model,
      userEmail,
      userId,
      emailAccountId,
      label,
      provider: candidate.provider,
      modelName: candidate.modelName,
    });
    const candidateTools = tools;
    const excludedTools: string[] = [];
    const replacedTools: string[] = [];

    if (replacedTools.length > 0) {
      logger.warn("Replacing incompatible tools for model", {
        provider: candidate.provider,
        modelName: candidate.modelName,
        replacedTools,
      });
    }

    if (excludedTools.length > 0) {
      logger.warn("Excluding unsupported tools for model", {
        provider: candidate.provider,
        modelName: candidate.modelName,
        excludedTools,
      });
    }

    onModelResolved?.({
      provider: candidate.provider,
      modelName: candidate.modelName,
      providerOptions,
      replacedTools,
      excludedTools,
    });

    const agent = new ToolLoopAgent({
      model,
      tools: candidateTools,
      activeTools: activeTools as
        | Array<keyof typeof candidateTools>
        | undefined,
      prepareStep,
      stopWhen: maxSteps ? stepCountIs(maxSteps) : undefined,
      temperature,
      ...commonOptions,
      providerOptions,
      onFinish: async (result) => {
        const usagePromise = saveUsageWithMetadata({
          result,
          usage: result.totalUsage,
          email: userEmail,
          emailAccountId,
          provider: candidate.provider,
          model: candidate.modelName,
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
        messages: protectedMessages as ModelMessage[],
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
    const notifyUser = async (
      errorType: (typeof ErrorType)[keyof typeof ErrorType],
      errorMessage: string,
    ) => {
      if (hasUserApiKey) markAsHandledUserKeyError(error);
      await addUserErrorMessageWithNotification({
        userId,
        userEmail,
        emailAccountId,
        errorType,
        errorMessage,
        logger,
      });
    };

    if (isIncorrectOpenAIAPIKeyError(error)) {
      return await notifyUser(
        ErrorType.INCORRECT_API_KEY,
        "Your AI API key is invalid. Please update it in your settings.",
      );
    }

    if (isInvalidAIModelError(error)) {
      await notifyUser(
        ErrorType.INVALID_AI_MODEL,
        "The AI model you specified does not exist or is unavailable. Please check your settings.",
      );
      throw new SafeError(
        "The AI model you specified does not exist or is unavailable. Please update your AI settings.",
      );
    }

    if (isOpenAIAPIKeyDeactivatedError(error)) {
      return await notifyUser(
        ErrorType.API_KEY_DEACTIVATED,
        "Your AI API key has been deactivated. Please update it in your settings.",
      );
    }

    if (
      isAnthropicInsufficientBalanceError(error) ||
      (isInsufficientCreditsError(error) && hasUserApiKey)
    ) {
      return await notifyUser(
        ErrorType.INSUFFICIENT_CREDITS,
        "Your AI provider account has insufficient credits. Please add credits or update your API key in settings.",
      );
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
  if (label === "assistant-chat") {
    return modelOptions;
  }

  const guard = await shouldForceNanoModel({
    userEmail,
    hasUserApiKey: modelOptions.hasUserApiKey,
    label,
    userId,
    emailAccountId,
  });

  if (!guard.shouldForce) {
    return modelOptions;
  }

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
}): Promise<{
  modelOptions: SelectModel;
  modelCandidates: ResolvedModel[];
}> {
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

  if (isContentFilterRefusal(error)) return true;

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
  modelName,
  modelProviderOptions,
  requestProviderOptions,
  userId,
  label,
  emailAccountId,
}: {
  provider: string;
  modelName?: string;
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

  const withMetadata = withOpenRouterMetadata({
    provider,
    providerOptions: mergedProviderOptions,
    userId,
    label,
    emailAccountId,
  });

  return normalizeOpenRouterReasoningOptions({
    provider,
    modelName,
    providerOptions: withMetadata,
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

function normalizeOpenRouterReasoningOptions({
  provider,
  modelName,
  providerOptions,
}: {
  provider: string;
  modelName?: string;
  providerOptions: LLMProviderOptions;
}) {
  if (provider !== Provider.OPENROUTER) return providerOptions;
  if (!isOpenRouterXaiGrokModel(modelName)) return providerOptions;

  const openRouterOptions = providerOptions.openrouter;
  if (!isJsonObject(openRouterOptions)) return providerOptions;

  const reasoningOptions = openRouterOptions.reasoning;
  if (!isJsonObject(reasoningOptions)) return providerOptions;

  const { max_tokens: _maxTokens, ...restReasoningOptions } = reasoningOptions;
  const normalizedReasoning: Record<string, JSONValue> = {
    ...restReasoningOptions,
  };

  if (
    !("enabled" in normalizedReasoning) &&
    !("effort" in normalizedReasoning)
  ) {
    normalizedReasoning.enabled = true;
  }

  return {
    ...providerOptions,
    openrouter: {
      ...openRouterOptions,
      reasoning: normalizedReasoning,
    },
  };
}

function isOpenRouterXaiGrokModel(modelName?: string) {
  return modelName?.toLowerCase().startsWith("x-ai/grok-");
}

function repairObjectText(text: string, label: string) {
  const attempt = createRepairAttemptState(text);
  let lastError: unknown;

  for (const candidate of getRepairCandidates(text)) {
    attempt.candidateKindsTried.push(candidate.kind);

    try {
      const repaired = jsonrepair(candidate.text);
      const normalized = normalizeRepairedObjectText(repaired);

      if (normalized) {
        attempt.successfulCandidateKind = candidate.kind;
        return { text: normalized.text, attempt };
      }
    } catch (error) {
      lastError = error;
    }
  }

  logger.warn("Failed to repair invalid JSON response", {
    label,
    length: text.length,
    startsWithQuote: /^[\s]*['"`]/.test(text),
    startsWithBrace: /^[\s]*\{/.test(text),
    startsWithBracket: /^[\s]*\[/.test(text),
    error: lastError,
  });

  return { text, attempt };
}

function getRepairCandidates(text: string) {
  const trimmed = text.trim();
  const unwrapped = unwrapQuotedJson(trimmed);
  const extracted = extractBalancedJsonRegions(trimmed);

  return dedupeRepairCandidates([
    { kind: "unwrapped", text: unwrapped },
    ...extracted.map((region) => ({
      kind: "extracted" as const,
      text: region,
    })),
    { kind: "trimmed", text: trimmed },
    { kind: "original", text },
  ]);
}

function extractBalancedJsonRegions(text: string): string[] {
  const regions: string[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      const region = walkBalancedJsonFrom(text, i);
      if (region) {
        regions.push(region);
        i += region.length;
        continue;
      }
    }
    i++;
  }

  return regions.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    if (a[0] === b[0]) return 0;
    return a[0] === "{" ? -1 : 1;
  });
}

function walkBalancedJsonFrom(
  text: string,
  openIdx: number,
): string | undefined {
  const openChar = text[openIdx];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let stringChar: string | undefined;
  let escaped = false;

  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inString) {
      if (ch === "\\") {
        escaped = true;
      } else if (ch === stringChar) {
        inString = false;
        stringChar = undefined;
      }
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        if (ch !== closeChar) return;
        return text.slice(openIdx, i + 1);
      }
    }
  }
}

function unwrapQuotedJson(text: string) {
  if (text.length < 2) return;

  const wrapChar = text[0];
  const supportedWrapChars = new Set(["'", '"', "`"]);

  if (!supportedWrapChars.has(wrapChar) || text.at(-1) !== wrapChar) return;

  const inner = text.slice(1, -1).trim();

  if (!inner.startsWith("{") && !inner.startsWith("[")) return;

  return inner;
}

function normalizeRepairedObjectText(
  text: string,
): { text: string; kind: RepairResultKind } | undefined {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return { text: trimmed, kind: "object-or-array" };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "string") return;

    const inner = parsed.trim();
    if (inner.startsWith("{") || inner.startsWith("[")) {
      return { text: inner, kind: "string-wrapped-object-or-array" };
    }
  } catch {
    return;
  }
}

function createRepairAttemptState(text: string): RepairAttemptState {
  return {
    inputLength: text.length,
    inputFingerprint: hash(text) || "",
    startsWithQuote: /^[\s]*['"`]/.test(text),
    startsWithBrace: /^[\s]*\{/.test(text),
    startsWithBracket: /^[\s]*\[/.test(text),
    looksCodeFenced: /^[\s]*```/.test(text),
    candidateKindsTried: [],
  };
}

function buildRepairMetadata({
  attempt,
  label,
  provider,
  model,
}: {
  attempt: RepairAttemptState | undefined;
  label: string;
  provider: string;
  model: string;
}): LlmRepairMetadata | undefined {
  if (!attempt) return;

  return {
    attempted: true,
    successful: Boolean(attempt.successfulCandidateKind),
    label,
    provider,
    model,
    ...attempt,
  };
}

function dedupeRepairCandidates(
  candidates: Array<{ kind: RepairCandidateKind; text: string | undefined }>,
): Array<{ kind: RepairCandidateKind; text: string }> {
  const seen = new Set<string>();

  return candidates.flatMap((candidate) => {
    if (!candidate.text || seen.has(candidate.text)) return [];

    seen.add(candidate.text);
    return [{ kind: candidate.kind, text: candidate.text }];
  });
}

function getUsageMetadata(result: unknown): UsageMetadata {
  const stepCount = getStepCount(result);
  const toolCallCount = getToolCallCount(result);
  const providerCost = getOpenRouterProviderCost(result);

  return {
    stepCount,
    toolCallCount,
    providerReportedCost: providerCost.providerReportedCost,
    providerUpstreamInferenceCost: providerCost.providerUpstreamInferenceCost,
    providerCostSource: providerCost.providerCostSource,
  };
}

async function saveUsageWithMetadata({
  result,
  usage,
  email,
  emailAccountId,
  provider,
  model,
  label,
  hasUserApiKey,
}: {
  result: unknown;
  usage: Parameters<typeof saveAiUsage>[0]["usage"];
  email: string;
  emailAccountId: string;
  provider: string;
  model: string;
  label: string;
  hasUserApiKey: boolean;
}) {
  const usageMetadata = getUsageMetadata(result);

  await saveAiUsage({
    email,
    emailAccountId,
    usage,
    provider,
    model,
    label,
    hasUserApiKey,
    providerReportedCost: usageMetadata.providerReportedCost,
    providerUpstreamInferenceCost: usageMetadata.providerUpstreamInferenceCost,
    providerCostSource: usageMetadata.providerCostSource,
    stepCount: usageMetadata.stepCount,
    toolCallCount: usageMetadata.toolCallCount,
  });
}

function getStepCount(result: unknown) {
  const steps = getObjectArrayProperty(result, "steps");
  if (!steps) return;

  return steps.length;
}

function getToolCallCount(result: unknown) {
  const steps = getObjectArrayProperty(result, "steps");
  if (!steps) {
    return getObjectArrayProperty(result, "toolCalls")?.length;
  }

  return steps.reduce((count, step) => {
    const toolCalls = getObjectArrayProperty(step, "toolCalls");
    return count + (toolCalls?.length ?? 0);
  }, 0);
}

function getOpenRouterProviderCost(result: unknown): {
  providerReportedCost?: number;
  providerUpstreamInferenceCost?: number;
  providerCostSource?: ProviderCostSource;
} {
  const directUsage = getOpenRouterUsage(result);

  const steps = getObjectArrayProperty(result, "steps");
  if (!steps && !directUsage) return {};

  let totalCost = 0;
  let foundCost = false;
  let totalUpstreamInferenceCost = 0;
  let foundUpstreamInferenceCost = false;

  if (steps) {
    for (const step of steps) {
      const stepUsage = getOpenRouterUsage(step);
      if (!stepUsage) continue;

      if (stepUsage.cost !== undefined) {
        totalCost += stepUsage.cost;
        foundCost = true;
      }

      if (stepUsage.upstreamInferenceCost !== undefined) {
        totalUpstreamInferenceCost += stepUsage.upstreamInferenceCost;
        foundUpstreamInferenceCost = true;
      }
    }
  }

  const providerReportedCost =
    directUsage?.cost ?? (foundCost ? totalCost : undefined);
  const providerUpstreamInferenceCost =
    directUsage?.upstreamInferenceCost ??
    (foundUpstreamInferenceCost ? totalUpstreamInferenceCost : undefined);

  if (
    providerReportedCost === undefined &&
    providerUpstreamInferenceCost === undefined
  ) {
    return {};
  }

  return {
    providerReportedCost,
    providerUpstreamInferenceCost,
    providerCostSource: getOpenRouterCostSource({
      directUsage,
      usedStepFallback:
        (directUsage?.cost === undefined && foundCost) ||
        (directUsage?.upstreamInferenceCost === undefined &&
          foundUpstreamInferenceCost),
    }),
  };
}

function getOpenRouterCostSource({
  directUsage,
  usedStepFallback,
}: {
  directUsage: ReturnType<typeof getOpenRouterUsage>;
  usedStepFallback: boolean;
}) {
  if (directUsage && usedStepFallback) {
    return "openrouter_usage_with_step_fallback";
  }

  if (directUsage) return "openrouter_usage";

  return "openrouter_step_usage_sum";
}

function getOpenRouterUsage(value: unknown): {
  cost?: number;
  upstreamInferenceCost?: number;
} | null {
  const providerMetadata = getObjectProperty(value, "providerMetadata");
  const openRouterMetadata = getObjectProperty(providerMetadata, "openrouter");
  const usage = getObjectProperty(openRouterMetadata, "usage");
  const costDetails = getObjectProperty(usage, "cost_details");
  const cost = getFiniteNumber(getProperty(usage, "cost"));
  const upstreamInferenceCost = getFiniteNumber(
    getProperty(costDetails, "upstream_inference_cost"),
  );

  if (cost === undefined && upstreamInferenceCost === undefined) return null;

  return { cost, upstreamInferenceCost };
}

function getObjectArrayProperty(value: unknown, key: string) {
  const property = getProperty(value, key);
  if (!Array.isArray(property)) return;

  return property.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );
}

function getObjectProperty(value: unknown, key: string) {
  const property = getProperty(value, key);
  if (
    typeof property !== "object" ||
    property === null ||
    Array.isArray(property)
  ) {
    return;
  }

  return property as Record<string, unknown>;
}

function getProperty(value: unknown, key: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return;
  }

  const record = value as Record<string, unknown>;
  return record[key];
}

function getFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
}

function isJsonObject(
  value: JSONValue | undefined,
): value is Record<string, JSONValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withPosthogTracing({
  model,
  userEmail,
  userId,
  emailAccountId,
  label,
  provider,
  modelName,
}: {
  model: LanguageModelV3;
  userEmail: string;
  userId?: string;
  emailAccountId?: string;
  label: string;
  provider: string;
  modelName: string;
}) {
  const posthogClient = getPosthogLlmClient();
  if (!posthogClient) return model;
  const llmEvalsEnabled = isPosthogLlmEvalApproved(userEmail);

  return withTracing(model, posthogClient, {
    posthogDistinctId: userEmail,
    posthogPrivacyMode: !llmEvalsEnabled,
    posthogProperties: {
      label,
      $ai_span_name: label,
      provider,
      model: modelName,
      emailAccountId,
      llmEvalsEnabled,
      ...(userId ? { userId } : {}),
    },
  });
}
