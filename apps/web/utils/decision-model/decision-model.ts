import { env } from "@/env";
import type { User } from "@/generated/prisma/client";
import { assertTrialAiUsageAllowed } from "@/utils/llms/model-usage-guard";
import { enforceSensitiveDataPolicy } from "@/utils/llms/sensitive-content";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { saveAiUsage } from "@/utils/usage";
import { decideWithTypeSafe } from "./typesafe";

type DecisionInstructions = string | Record<string, string>;

export type DecisionQuestion =
  | {
      type: "choice";
      instructions: DecisionInstructions;
      criteria: Record<string, string>;
    }
  | {
      type: "yesNo";
      instructions: DecisionInstructions;
      criteria?: { true: DecisionInstructions; false: DecisionInstructions };
    };

export type DecisionAnswer =
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { type: "yesNo"; probability: number };

export type DecisionModelResponse = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  answers: Record<string, DecisionAnswer | undefined>;
};

export type DecisionModelConfig = {
  provider: "typesafe";
  model: string;
  apiKey: string;
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

  const response = await sendToProvider({
    config,
    state: request.prompt,
    questions: request.instructions,
  });

  await saveAiUsage({
    userId: emailAccount.userId,
    email: emailAccount.email,
    emailAccountId: emailAccount.id,
    provider: config.provider,
    model: config.model,
    usage: {
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      totalTokens: response.inputTokens + response.outputTokens,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokenDetails: {
        textTokens: response.outputTokens,
        reasoningTokens: undefined,
      },
    },
    label,
  });

  return response;
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

function sendToProvider(options: {
  config: DecisionModelConfig;
  state: Record<string, unknown>;
  questions: Record<string, DecisionQuestion>;
}): Promise<DecisionModelResponse> {
  switch (options.config.provider) {
    case "typesafe":
      return decideWithTypeSafe(options);
  }
}

function getDeploymentDecisionModelConfig(): DecisionModelConfig | null {
  if (!env.DEFAULT_DECISION_MODEL || !env.TYPESAFE_API_KEY) return null;

  return {
    provider: "typesafe",
    model: env.DEFAULT_DECISION_MODEL.slice("typesafe:".length),
    apiKey: env.TYPESAFE_API_KEY,
  };
}
