import { env } from "@/env";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { createPremiumForUser } from "@/utils/premium/create-premium";
import {
  getRemainingUnsubscribeCredits,
  getUnsubscribePeriod,
  getUserTier,
  hasUnsubscribeAccess,
  isPremiumRecord,
  premiumEntitlementSelect,
} from "@/utils/premium";

export type UnsubscribeCreditReservation = "premium" | "reserved" | "denied";

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
 * Atomically takes one free-tier credit before a cookie-route action.
 * Premium records are not debited. `denied` means the conditional update
 * changed no row, so the caller must not apply the action.
 */
export async function reserveUnsubscribeCredit({
  userId,
}: {
  userId: string;
}): Promise<UnsubscribeCreditReservation> {
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
  if (isPremiumRecord(user.premium)) return "premium";

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

  if (resetResult.count > 0) return "reserved";

  const debit = await prisma.premium.updateMany({
    where: {
      id: premium.id,
      unsubscribeMonth: currentPeriod,
      unsubscribeCredits: { gt: 0 },
    },
    data: { unsubscribeCredits: { decrement: 1 } },
  });

  return debit.count > 0 ? "reserved" : "denied";
}

/**
 * Spends one free-tier credit after a successful web action. A debit that
 * loses the race changes no row. Cookie routes use `reserveUnsubscribeCredit`
 * before the action instead, so this is not called on that path.
 */
export async function consumeUnsubscribeCredit({ userId }: { userId: string }) {
  await reserveUnsubscribeCredit({ userId });
}

/** Gives back a credit reserved for an action that did not succeed. */
export async function refundUnsubscribeCredit({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          id: true,
          ...premiumEntitlementSelect,
        },
      },
    },
  });

  if (!user?.premium || isPremiumRecord(user.premium)) return;

  await prisma.premium.updateMany({
    where: {
      id: user.premium.id,
      unsubscribeMonth: getUnsubscribePeriod(),
      unsubscribeCredits: { lt: env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS },
    },
    data: { unsubscribeCredits: { increment: 1 } },
  });
}

export async function releaseUnsubscribeCreditReservation({
  userId,
  reservation,
  logger,
}: {
  userId: string;
  reservation: UnsubscribeCreditReservation;
  logger: Logger;
}) {
  if (reservation !== "reserved") return;

  try {
    await refundUnsubscribeCredit({ userId });
  } catch (error) {
    logger.error("Failed to refund unsubscribe credit", { error });
  }
}
