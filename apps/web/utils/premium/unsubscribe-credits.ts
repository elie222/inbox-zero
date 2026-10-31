import { env } from "@/env";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { createPremiumForUser } from "@/utils/premium/create-premium";
import {
  getUnsubscribePeriod,
  isPremiumRecord,
  premiumEntitlementSelect,
} from "@/utils/premium";

/**
 * Spends one free-tier credit after a successful web unsubscribe action.
 * Premium records are unchanged. Mail and provider reads do not call this.
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
