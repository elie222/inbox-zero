import { env } from "@/env";
import { getWeeklyUsageCost } from "@/utils/redis/usage";
import { createScopedLogger, type Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { redis } from "@/utils/redis";
import { sendActionRequiredEmail } from "@inboxzero/resend";
import { createUnsubscribeToken } from "@/utils/unsubscribe";

const logger = createScopedLogger("llms/model-usage-guard");
const TRIAL_AI_LIMIT_NOTIFICATION_TTL_SECONDS = 60 * 24 * 60 * 60;

export const TRIAL_AI_LIMIT_REACHED_MESSAGE =
  "Your trial has reached the AI usage limit. Start your paid plan now to continue using AI automation.";

type TrialAiUsageLimitStatus =
  | { status: "allowed" }
  | {
      status: "trial_ai_limit_reached";
      message: string;
      weeklySpendUsd: number;
      weeklyLimitUsd: number;
    };

export async function getUserTrialAiUsageLimitStatus(options: {
  userId: string;
}): Promise<TrialAiUsageLimitStatus> {
  const weeklyLimitUsd = env.AI_TRIAL_WEEKLY_SPEND_LIMIT_USD;
  if (!weeklyLimitUsd) return { status: "allowed" };

  const user = await prisma.user.findUnique({
    where: { id: options.userId },
    select: {
      email: true,
      aiApiKey: true,
      emailAccounts: { select: { email: true } },
      premium: {
        select: {
          stripeSubscriptionStatus: true,
          lemonSubscriptionStatus: true,
        },
      },
    },
  });

  if (!user || user.aiApiKey || !isTrialPremium(user.premium)) {
    return { status: "allowed" };
  }

  let weeklySpendUsd = 0;
  try {
    weeklySpendUsd = await getWeeklyUsageCost({
      userId: options.userId,
      legacyEmails: getLegacyUsageEmails(user),
    });
  } catch (error) {
    logger.error("Failed to evaluate trial AI spend status", {
      userId: options.userId,
      error,
    });
    return { status: "allowed" };
  }

  return getTrialAiUsageLimitStatus({ weeklySpendUsd, weeklyLimitUsd });
}

export async function assertTrialAiUsageAllowed(options: {
  userEmail: string;
  hasUserApiKey: boolean;
  label: string;
  userId?: string;
  emailAccountId?: string;
}): Promise<void> {
  if (options.hasUserApiKey) return;
  if (!options.userId || !options.emailAccountId) return;

  const status = await getUserTrialAiUsageLimitStatus({
    userId: options.userId,
  });
  if (status.status === "allowed") return;

  logger.warn("Blocking trial AI call due to weekly spend", {
    label: options.label,
    userId: options.userId,
    emailAccountId: options.emailAccountId,
    weeklySpendUsd: status.weeklySpendUsd,
    weeklyLimitUsd: status.weeklyLimitUsd,
  });

  await sendTrialAiLimitReachedEmailOnce({
    userId: options.userId,
    userEmail: options.userEmail,
    emailAccountId: options.emailAccountId,
    logger,
  });

  throw new SafeError(TRIAL_AI_LIMIT_REACHED_MESSAGE);
}

async function sendTrialAiLimitReachedEmailOnce({
  userId,
  userEmail,
  emailAccountId,
  logger,
}: {
  userId: string;
  userEmail: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const key = getTrialAiLimitNotificationKey(userId);
  const claimedNotification = await redis.set(key, new Date().toISOString(), {
    ex: TRIAL_AI_LIMIT_NOTIFICATION_TTL_SECONDS,
    nx: true,
  });

  if (!claimedNotification) return;

  try {
    const unsubscribeToken = await createUnsubscribeToken({ emailAccountId });

    await sendActionRequiredEmail({
      from: env.RESEND_FROM_EMAIL,
      to: userEmail,
      emailProps: {
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
        email: userEmail,
        unsubscribeToken,
        errorType: "Trial AI Limit Reached",
        errorMessage: TRIAL_AI_LIMIT_REACHED_MESSAGE,
        actionUrl: "/premium",
        actionLabel: "Start paid plan now",
      },
    });

    logger.info("Sent action required email", {
      errorType: "trialAiLimitReached",
    });
  } catch (emailError) {
    logger.error("Failed to send trial AI limit email", {
      error: emailError,
    });

    try {
      await redis.del(key);
    } catch (redisError) {
      logger.error("Failed to clear trial AI limit notification marker", {
        userId,
        error: redisError,
      });
    }
  }
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
  if (!options.userId) {
    return { shouldForce: false, weeklySpendUsd: null, weeklyLimitUsd };
  }

  try {
    const weeklySpendUsd = await getWeeklyUsageCost({
      userId: options.userId,
      legacyEmails: [options.userEmail],
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

function getLegacyUsageEmails(user: {
  email: string | null;
  emailAccounts: Array<{ email: string }>;
}) {
  return Array.from(
    new Set([user.email, ...user.emailAccounts.map(({ email }) => email)]),
  ).flatMap((email) => (email ? [email] : []));
}

function getTrialAiUsageLimitStatus({
  weeklySpendUsd,
  weeklyLimitUsd,
}: {
  weeklySpendUsd: number;
  weeklyLimitUsd: number;
}): TrialAiUsageLimitStatus {
  if (weeklySpendUsd < weeklyLimitUsd) return { status: "allowed" };

  return {
    status: "trial_ai_limit_reached",
    message: TRIAL_AI_LIMIT_REACHED_MESSAGE,
    weeklySpendUsd,
    weeklyLimitUsd,
  };
}

function getTrialAiLimitNotificationKey(userId: string) {
  return `trial-ai-limit-notification:${userId}`;
}
