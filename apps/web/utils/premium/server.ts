import prisma from "@/utils/prisma";

const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;

export async function upgradeUserToPremium(options: {
  userId: string;
  isLifetime: boolean;
  lemonSqueezyRenewsAt?: Date;
  lemonSqueezySubscriptionId?: string;
  lemonSqueezyCustomerId?: number;
}) {
  const lemonSqueezyRenewsAt = options.isLifetime
    ? new Date(Date.now() + TEN_YEARS)
    : options.lemonSqueezyRenewsAt;

  return await prisma.user.update({
    where: { id: options.userId },
    data: {
      lemonSqueezyRenewsAt,
      lemonSqueezySubscriptionId: options.lemonSqueezySubscriptionId,
      lemonSqueezyCustomerId: options.lemonSqueezyCustomerId,
    },
    select: { email: true },
  });
}

export async function extendUserPremium(options: {
  userId: string;
  lemonSqueezyRenewsAt: Date;
}) {
  return await prisma.user.update({
    where: { id: options.userId },
    data: {
      lemonSqueezyRenewsAt: options.lemonSqueezyRenewsAt,
    },
    select: { email: true },
  });
}

export async function cancelUserPremium(options: {
  userId: string;
  lemonSqueezyEndsAt: Date;
}) {
  return await prisma.user.update({
    where: { id: options.userId },
    data: {
      lemonSqueezyRenewsAt: options.lemonSqueezyEndsAt,
    },
    select: { email: true },
  });
}
