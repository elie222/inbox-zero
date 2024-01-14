import prisma from "@/utils/prisma";

const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;

export async function upgradeToPremium(options: {
  userId: string;
  isLifetime: boolean;
  lemonSqueezyRenewsAt?: Date;
  lemonSqueezySubscriptionId?: number;
  lemonSqueezySubscriptionItemId?: number;
  lemonSqueezyCustomerId?: number;
  lemonSqueezyProductId?: number;
  lemonSqueezyVariantId?: number;
}) {
  const { userId, isLifetime, ...rest } = options;

  const lemonSqueezyRenewsAt = options.isLifetime
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
  console.log("🚀 ~ file: server.ts:27 ~ data:", data);

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
