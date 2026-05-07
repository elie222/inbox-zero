import { env } from "@/env";
import { getWeeklyUsageCost } from "@/utils/redis/usage";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import {
  addUserErrorMessageWithNotification,
  ErrorType,
} from "@/utils/error-messages";

const logger = createScopedLogger("llms/model-usage-guard");

export const TRIAL_AI_LIMIT_REACHED_MESSAGE =
  "Your trial has reached the AI usage limit. Upgrade to continue using AI automation.";

export async function assertTrialAiUsageAllowed(options: {
  userEmail: string;
  hasUserApiKey: boolean;
  label: string;
  userId?: string;
  emailAccountId?: string;
}): Promise<void> {
  const weeklyLimitUsd = env.AI_TRIAL_WEEKLY_SPEND_LIMIT_USD;
  if (!weeklyLimitUsd) return;
  if (options.hasUserApiKey) return;
  if (!options.userId || !options.emailAccountId) return;

  let weeklySpendUsd = 0;
  try {
    weeklySpendUsd = await getWeeklyUsageCost({ email: options.userEmail });
  } catch (error) {
    logger.error("Failed to evaluate trial AI spend guard", {
      label: options.label,
      userId: options.userId,
      emailAccountId: options.emailAccountId,
      error,
    });
    return;
  }

  if (weeklySpendUsd < weeklyLimitUsd) return;

  const user = await prisma.user.findUnique({
    where: { id: options.userId },
    select: {
      errorMessages: true,
      premium: {
        select: {
          stripeSubscriptionStatus: true,
          lemonSubscriptionStatus: true,
        },
      },
    },
  });

  if (!isTrialPremium(user?.premium)) return;

  const errorMessages = user?.errorMessages as
    | Record<string, { message?: string }>
    | null
    | undefined;
  const hasExistingTrialLimitError =
    !!errorMessages?.[ErrorType.TRIAL_AI_LIMIT_REACHED];

  logger.warn("Blocking trial AI call due to weekly spend", {
    label: options.label,
    userId: options.userId,
    emailAccountId: options.emailAccountId,
    weeklySpendUsd,
    weeklyLimitUsd,
  });

  if (!hasExistingTrialLimitError) {
    await addUserErrorMessageWithNotification({
      userId: options.userId,
      userEmail: options.userEmail,
      emailAccountId: options.emailAccountId,
      errorType: ErrorType.TRIAL_AI_LIMIT_REACHED,
      errorMessage: TRIAL_AI_LIMIT_REACHED_MESSAGE,
      logger,
    });
  }

  throw new SafeError(TRIAL_AI_LIMIT_REACHED_MESSAGE);
}

export async function shouldForceNanoModel(options: {
  userEmail: string;
  hasUserApiKey: boolean;
  label: string;
  userId?: string;
  emailAccountId?: string;
}): Promise<{
  shouldForce: boolean;
  weeklySpendUsd: number | null;
  weeklyLimitUsd: number | null;
}> {
  const weeklyLimitUsd = env.AI_NANO_WEEKLY_SPEND_LIMIT_USD;
  if (!weeklyLimitUsd)
    return {
      shouldForce: false,
      weeklySpendUsd: null,
      weeklyLimitUsd: null,
    };

  if (options.hasUserApiKey) {
    return { shouldForce: false, weeklySpendUsd: null, weeklyLimitUsd };
  }

  if (!env.NANO_LLM_PROVIDER || !env.NANO_LLM_MODEL) {
    logger.warn("Nano model guard enabled but nano model is not configured", {
      label: options.label,
      userId: options.userId,
      emailAccountId: options.emailAccountId,
    });
    return { shouldForce: false, weeklySpendUsd: null, weeklyLimitUsd };
  }

  try {
    const weeklySpendUsd = await getWeeklyUsageCost({
      email: options.userEmail,
    });
    return {
      shouldForce: weeklySpendUsd >= weeklyLimitUsd,
      weeklySpendUsd,
      weeklyLimitUsd,
    };
  } catch (error) {
    logger.error("Failed to evaluate nano model guard", {
      label: options.label,
      userId: options.userId,
      emailAccountId: options.emailAccountId,
      error,
    });
    return { shouldForce: false, weeklySpendUsd: null, weeklyLimitUsd };
  }
}

function isTrialPremium(
  premium:
    | {
        stripeSubscriptionStatus?: string | null;
        lemonSubscriptionStatus?: string | null;
      }
    | null
    | undefined,
) {
  return (
    premium?.stripeSubscriptionStatus === "trialing" ||
    premium?.lemonSubscriptionStatus === "on_trial"
  );
}
