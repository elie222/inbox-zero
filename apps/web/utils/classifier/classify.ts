import { env } from "@/env";
import type { User } from "@/generated/prisma/client";
import { classifyWithTypeSafe } from "@/utils/classifier/typesafe";
import { assertTrialAiUsageAllowed } from "@/utils/llms/model-usage-guard";
import { enforceSensitiveDataPolicy } from "@/utils/llms/sensitive-content";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

// Classifiers are models that answer structured questions (pick one of these
// labels, yes or no) with probabilities, rather than generating text.

type QuestionInstructions = string | Record<string, string>;

export type ClassifierQuestion =
  | {
      type: "choice";
      instructions: QuestionInstructions;
      criteria: Record<string, string>;
    }
  | { type: "yesNo"; instructions: QuestionInstructions };

export type ClassifierAnswer =
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { type: "yesNo"; probability: number };

export type ClassifierResponse = {
  model: string;
  inputTokens: number;
  answers: Record<string, ClassifierAnswer | undefined>;
};

export type ClassifierConfig = {
  provider: "typesafe";
  model: string;
  apiKey: string;
};

/** The classifier this account uses, or null to use the LLM path instead. */
export async function getClassifierConfig(
  emailAccount: Pick<EmailAccountWithAI, "userId">,
): Promise<ClassifierConfig | null> {
  const config = getDeploymentClassifierConfig();
  if (!config) return null;

  const user = await prisma.user.findUnique({
    where: { id: emailAccount.userId },
    select: { classifierEnabled: true, aiApiKey: true },
  });

  return user && isClassifierEnabledForUser(user) ? config : null;
}

/**
 * An explicit user choice wins. Otherwise the deployment default applies,
 * except for users with their own AI key: they chose where their email goes,
 * so a deployment default never sends it to a classifier provider.
 */
export function isClassifierEnabledForUser(
  user: Pick<User, "classifierEnabled" | "aiApiKey">,
) {
  if (user.classifierEnabled !== null) return user.classifierEnabled;
  return !user.aiApiKey && env.DEFAULT_CLASSIFIER_ENABLED;
}

export function isClassifierAvailable() {
  return !!getDeploymentClassifierConfig();
}

/**
 * Sends email-derived state to an external classifier. Trial usage limits and
 * the account's sensitive data policy apply first; either can throw.
 */
export async function classify({
  config,
  emailAccount,
  state,
  questions,
  label,
  logger,
}: {
  config: ClassifierConfig;
  emailAccount: EmailAccountWithAI;
  state: Record<string, unknown>;
  questions: Record<string, ClassifierQuestion>;
  label: string;
  logger: Logger;
}): Promise<ClassifierResponse> {
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

  switch (config.provider) {
    case "typesafe":
      return classifyWithTypeSafe({
        config,
        state: request.prompt,
        questions: request.instructions,
      });
  }
}

function getDeploymentClassifierConfig(): ClassifierConfig | null {
  // env.ts only accepts typesafe:<model> and requires TYPESAFE_API_KEY with it.
  if (!env.DEFAULT_CLASSIFIER || !env.TYPESAFE_API_KEY) return null;

  return {
    provider: "typesafe",
    model: env.DEFAULT_CLASSIFIER.slice("typesafe:".length),
    apiKey: env.TYPESAFE_API_KEY,
  };
}
