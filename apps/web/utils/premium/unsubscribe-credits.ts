import { env } from "@/env";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { createPremiumForUser } from "@/utils/premium/create-premium";
import {
  getRemainingUnsubscribeCredits,
  getUnsubscribePeriod,
  getUserTier,
  hasUnsubscribeAccess,
  isPremiumRecord,
  premiumEntitlementSelect,
} from "@/utils/premium";

/**
 * Same allowance the web UI uses: an active premium record, or remaining free
 * credits for the current period. A missing premium row still has the monthly
 * free allowance.
 */
export async function userHasUnsubscribeAccess({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          unsubscribeCredits: true,
          unsubscribeMonth: true,
          ...premiumEntitlementSelect,
        },
      },
    },
  });

  if (!user) return false;

  const premium = user.premium;
  return (
    isPremiumRecord(premium) ||
    hasUnsubscribeAccess(
      getUserTier(premium),
      getRemainingUnsubscribeCredits({
        unsubscribeCredits: premium?.unsubscribeCredits,
        unsubscribeMonth: premium?.unsubscribeMonth,
      }),
    )
  );
}

/**
 * Spends one free-tier credit. Premium records are unchanged. Shared with the
 * web client's decrement action so the cookie routes and the web UI stay in
 * step without decrementing twice on the web path.
 */
export async function consumeUnsubscribeCredit({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          id: true,
          unsubscribeCredits: true,
          unsubscribeMonth: true,
          ...premiumEntitlementSelect,
        },
      },
    },
  });

  if (!user) throw new SafeError("User not found");

  if (isPremiumRecord(user.premium)) return;

  const currentPeriod = getUnsubscribePeriod();
  const premium = user.premium || (await createPremiumForUser({ userId }));

  const resetResult = await prisma.premium.updateMany({
    where: {
      id: premium.id,
      OR: [
        { unsubscribeMonth: null },
        { unsubscribeMonth: { not: currentPeriod } },
      ],
    },
    data: {
      unsubscribeCredits: env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS - 1,
      unsubscribeMonth: currentPeriod,
    },
  });

  if (resetResult.count > 0) return;

  await prisma.premium.updateMany({
    where: {
      id: premium.id,
      unsubscribeMonth: currentPeriod,
      unsubscribeCredits: { gt: 0 },
    },
    data: { unsubscribeCredits: { decrement: 1 } },
  });
}
