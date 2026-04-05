import { env } from "@/env";
import { getWeeklyUsageCost } from "@/utils/redis/usage";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("llms/model-usage-guard");

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
