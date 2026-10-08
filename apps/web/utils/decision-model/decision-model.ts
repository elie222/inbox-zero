import { createGateway } from "@ai-sdk/gateway";
import { createOpenAI } from "@ai-sdk/openai";
import type {
  Experimental_DecisionModelV4,
  JSONObject,
} from "@ai-sdk/provider";
import {
  type Experimental_DecisionQuestion,
  type Experimental_DecisionResult,
  experimental_decide,
} from "ai";
import { env } from "@/env";
import type { User } from "@/generated/prisma/client";
import { assertTrialAiUsageAllowed } from "@/utils/llms/model-usage-guard";
import { enforceSensitiveDataPolicy } from "@/utils/llms/sensitive-content";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { saveAiUsage } from "@/utils/usage";
import { createSystemOneDecisionModel } from "./system-one";

export type DecisionQuestion = Experimental_DecisionQuestion;

export type DecisionAnswer =
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { type: "boolean"; probability: number };

export type DecisionModelResponse = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  answers: Record<string, DecisionAnswer | undefined>;
};

type DecideResult = Experimental_DecisionResult<
  Record<string, DecisionQuestion>
>;

export type DecisionModelConfig = {
  provider: "typesafe" | "openrouter" | "gateway" | "openai";
  modelId: string;
  model: Experimental_DecisionModelV4;
};

/** The optional decision model for this account, or null for the LLM path. */
export async function getDecisionModelConfig(
  emailAccount: Pick<EmailAccountWithAI, "userId">,
): Promise<DecisionModelConfig | null> {
  const config = getDeploymentDecisionModelConfig();
  if (!config) return null;

  const user = await prisma.user.findUnique({
    where: { id: emailAccount.userId },
    select: { decisionModelEnabled: true, aiApiKey: true },
  });

  return user && isDecisionModelEnabledForUser(user) ? config : null;
}

/**
 * An explicit user choice wins. Otherwise the deployment default applies,
 * except for users with their own AI key because they chose where their data
 * goes.
 */
export function isDecisionModelEnabledForUser(
  user: Pick<User, "decisionModelEnabled" | "aiApiKey">,
) {
  if (user.decisionModelEnabled !== null) return user.decisionModelEnabled;
  return !user.aiApiKey && env.DEFAULT_DECISION_MODEL_ENABLED;
}

export function isDecisionModelAvailable() {
  return !!getDeploymentDecisionModelConfig();
}

/**
 * Sends structured state to the configured decision model. Trial limits,
 * sensitive-data policy, and usage accounting match the LLM path.
 */
export async function runDecisionModel({
  config,
  emailAccount,
  state,
  questions,
  label,
  logger,
}: {
  config: DecisionModelConfig;
  emailAccount: EmailAccountWithAI;
  state: Record<string, unknown>;
  questions: Record<string, DecisionQuestion>;
  label: string;
  logger: Logger;
}): Promise<DecisionModelResponse> {
  await assertTrialAiUsageAllowed({
    userEmail: emailAccount.email,
    hasUserApiKey: false,
    label,
    userId: emailAccount.userId,
    emailAccountId: emailAccount.id,
  });

  const request = enforceSensitiveDataPolicy({
    options: { prompt: state, instructions: questions },
    policy: emailAccount.sensitiveDataPolicy,
    label,
    logger,
    userId: emailAccount.userId,
    emailAccountId: emailAccount.id,
  });

  const result = await experimental_decide({
    model: config.model,
    state: request.prompt as JSONObject,
    questions: request.instructions,
    // Every caller falls back to the LLM, which is the better retry.
    maxRetries: 0,
  });

  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  const providerReportedCost = getProviderCost(result, config.provider);

  await saveAiUsage({
    userId: emailAccount.userId,
    email: emailAccount.email,
    emailAccountId: emailAccount.id,
    provider: config.provider,
    model: config.modelId,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: {
        textTokens: outputTokens,
        reasoningTokens: undefined,
      },
    },
    providerReportedCost,
    providerCostSource:
      providerReportedCost === undefined
        ? undefined
        : `${config.provider}_usage`,
    providerRequestIds: result.response.id ? [result.response.id] : undefined,
    label,
  });

  return {
    model: result.response.modelId,
    inputTokens,
    outputTokens,
    answers: Object.fromEntries(
      Object.entries(result.answers).map(([id, answer]) => [
        id,
        toDecisionAnswer(id, answer, result),
      ]),
    ),
  };
}

export async function runDecisionModelOrFallback<T>({
  emailAccount,
  logger,
  feature,
  decide,
  fallback,
}: {
  emailAccount: EmailAccountWithAI;
  logger: Logger;
  feature: string;
  decide: (config: DecisionModelConfig) => Promise<T>;
  fallback: () => Promise<T>;
}): Promise<T> {
  let config: DecisionModelConfig | null;
  try {
    config = await getDecisionModelConfig(emailAccount);
  } catch (error) {
    logger.warn("Decision model configuration failed, falling back to LLM", {
      error,
      feature,
    });
    return fallback();
  }

  if (!config) return fallback();

  try {
    return await decide(config);
  } catch (error) {
    logger.warn("Decision model failed, falling back to LLM", {
      error,
      feature,
    });
    return fallback();
  }
}

function getDeploymentDecisionModelConfig() {
  return env.DEFAULT_DECISION_MODEL
    ? createDecisionModelConfig(env.DEFAULT_DECISION_MODEL)
    : null;
}

/**
 * Resolves a `provider:model` entry, or null when neither the provider key
 * nor LLM_API_KEY is set, matching how LLM entries resolve keys.
 */
export function createDecisionModelConfig(
  providerAndModel: string,
): DecisionModelConfig | null {
  const separatorIndex = providerAndModel.indexOf(":");
  const provider = providerAndModel.slice(0, separatorIndex);
  const modelId = providerAndModel.slice(separatorIndex + 1);

  switch (provider) {
    case "typesafe": {
      const apiKey = env.TYPESAFE_API_KEY || env.LLM_API_KEY;
      if (!apiKey) return null;
      return {
        provider,
        modelId,
        model: createSystemOneDecisionModel({
          provider,
          url: "https://api.typesafe.ai/v1/systemone",
          apiKey,
          modelId,
        }),
      };
    }
    case "openrouter": {
      const apiKey = env.OPENROUTER_API_KEY || env.LLM_API_KEY;
      if (!apiKey) return null;
      return {
        provider,
        modelId,
        model: createSystemOneDecisionModel({
          provider,
          url: "https://openrouter.ai/api/alpha/decisions",
          apiKey,
          modelId,
        }),
      };
    }
    case "gateway": {
      const apiKey = env.AI_GATEWAY_API_KEY || env.LLM_API_KEY;
      if (!apiKey) return null;
      return {
        provider,
        modelId,
        model: createGateway({ apiKey }).decisionModel(modelId),
      };
    }
    case "openai": {
      const apiKey = env.OPENAI_API_KEY || env.LLM_API_KEY;
      if (!apiKey) return null;
      return {
        provider,
        modelId,
        model: createOpenAI({ apiKey }).decisionModel(modelId),
      };
    }
    default:
      return null;
  }
}

/**
 * Callers threshold on choice confidence, so a choice must come with a
 * distribution. Providers that report their own confidence (System One,
 * OpenAI) put it in provider metadata; otherwise it is the chosen option's
 * probability.
 */
function toDecisionAnswer(
  id: string,
  answer: DecideResult["answers"][string],
  result: DecideResult,
): DecisionAnswer | undefined {
  if (answer.type === "boolean") return answer;
  if (answer.type !== "choice" || !answer.probabilities) return;

  return {
    type: "choice",
    choice: answer.choice,
    confidence:
      getProviderConfidence(result, id) ?? answer.probabilities[answer.choice],
    probabilities: answer.probabilities,
  };
}

function getProviderConfidence(result: DecideResult, id: string) {
  for (const metadata of Object.values(result.providerMetadata ?? {})) {
    const confidence = metadata.confidence;
    if (isJsonObject(confidence) && typeof confidence[id] === "number") {
      return confidence[id];
    }
  }
}

function getProviderCost(
  result: DecideResult,
  provider: DecisionModelConfig["provider"],
) {
  const usage = result.providerMetadata?.[provider]?.usage;
  return isJsonObject(usage) && typeof usage.cost === "number"
    ? usage.cost
    : undefined;
}

function isJsonObject(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
