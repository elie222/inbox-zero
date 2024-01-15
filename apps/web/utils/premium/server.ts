import prisma from "@/utils/prisma";
import { PremiumTier } from "@prisma/client";

const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;

export async function upgradeToPremium(options: {
  userId: string;
  tier: PremiumTier;
  lemonSqueezyRenewsAt: Date | null;
  lemonSqueezySubscriptionId: number | null;
  lemonSqueezySubscriptionItemId: number | null;
  lemonSqueezyOrderId: number | null;
  lemonSqueezyCustomerId: number | null;
  lemonSqueezyProductId: number | null;
  lemonSqueezyVariantId: number | null;
}) {
  const { userId, ...rest } = options;

  const lemonSqueezyRenewsAt =
    options.tier === PremiumTier.LIFETIME
      ? new Date(Date.now() + TEN_YEARS)
      : options.lemonSqueezyRenewsAt;

  const user = await prisma.user.findFirstOrThrow({
    where: { id: options.userId },
    select: { premiumId: true },
  });

  const data = {
    ...rest,
    lemonSqueezyRenewsAt,
  };

  if (user.premiumId) {
    return await prisma.premium.update({
      where: { id: user.premiumId },
      data,
      select: { users: { select: { email: true } } },
    });
  } else {
    return await prisma.premium.create({
      data: {
        users: { connect: { id: options.userId } },
        ...data,
      },
      select: { users: { select: { email: true } } },
    });
  }
}

export async function extendPremium(options: {
  premiumId: string;
  lemonSqueezyRenewsAt: Date;
}) {
  return await prisma.premium.update({
    where: { id: options.premiumId },
    data: {
      lemonSqueezyRenewsAt: options.lemonSqueezyRenewsAt,
    },
    select: {
      users: {
        select: { email: true },
      },
    },
  });
}

export async function cancelPremium(options: {
  premiumId: string;
  lemonSqueezyEndsAt: Date;
}) {
  return await prisma.premium.update({
    where: { id: options.premiumId },
    data: {
      lemonSqueezyRenewsAt: options.lemonSqueezyEndsAt,
    },
    select: {
      users: {
        select: { email: true },
      },
    },
  });
}

export async function editEmailAccountsAccess(options: {
  premiumId: string;
  count: number;
}) {
  const { count } = options;
  if (!count) return;

  return await prisma.premium.update({
    where: { id: options.premiumId },
    data: {
      emailAccountsAccess:
        count > 0 ? { increment: count } : { decrement: count },
    },
    select: {
      users: {
        select: { email: true },
      },
    },
  });
}
