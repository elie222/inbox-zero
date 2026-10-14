import prisma from "@/utils/prisma";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import {
  getUserTier,
  hasAiAccess,
  hasTierAccess,
  isPremiumRecord,
} from "@/utils/premium";
import { RERUN_UPGRADE_MESSAGE } from "@/utils/premium/rerun";
import { getUserTrialAiUsageLimitStatus } from "@/utils/llms/model-usage-guard";

export async function assertBulkRunAccess(
  userId: string,
  options: { includeRead: boolean; rerun: boolean },
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premium: true, aiApiKey: true },
  });
  if (!user) throw new SafeError("User not found");
  if (!env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    const tier = getUserTier(user.premium);
    if (!isPremiumRecord(user.premium) || !hasAiAccess(tier, !!user.aiApiKey))
      throw new SafeError("AI access is required to process past emails.");
    if (
      (options.includeRead || options.rerun) &&
      !hasTierAccess({ tier, minimumTier: "PROFESSIONAL_MONTHLY" })
    )
      throw new SafeError(RERUN_UPGRADE_MESSAGE);
  }
  const usage = await getUserTrialAiUsageLimitStatus({ userId });
  if (usage.status !== "allowed") throw new SafeError(usage.message);
  return user.premium?.stripeSubscriptionStatus === "trialing"
    ? 200
    : undefined;
}
