import sumBy from "lodash/sumBy";
import { updateSubscriptionItemQuantity } from "@/app/api/lemon-squeezy/api";
import prisma from "@/utils/prisma";
import { FeatureAccess, PremiumTier } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("premium");

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
  lemonLicenseKey?: string;
  lemonLicenseInstanceId?: string;
  emailAccountsAccess?: number;
}) {
  const { userId, ...rest } = options;

  const lemonSqueezyRenewsAt =
    options.tier === PremiumTier.LIFETIME
      ? new Date(Date.now() + TEN_YEARS)
      : options.lemonSqueezyRenewsAt;

  const user = await prisma.user.findUnique({
    where: { id: options.userId },
    select: { premiumId: true },
  });

  if (!user) throw new Error(`User not found for id ${options.userId}`);

  const data = {
    ...rest,
    lemonSqueezyRenewsAt,
    ...getTierAccess(options.tier),
  };

  if (user.premiumId) {
    return await prisma.premium.update({
      where: { id: user.premiumId },
      data,
      select: { users: { select: { email: true } } },
    });
  }
  return await prisma.premium.create({
    data: {
      users: { connect: { id: options.userId } },
      admins: { connect: { id: options.userId } },
      ...data,
    },
    select: { users: { select: { email: true } } },
  });
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

export async function cancelPremium({
  premiumId,
  lemonSqueezyEndsAt,
  variantId,
  expired,
}: {
  premiumId: string;
  lemonSqueezyEndsAt: Date;
  variantId?: number;
  expired: boolean;
}) {
  if (variantId) {
    // Check if the premium exists for the given variant
    // If the user changed plans we won't find it in the database
    // And that's okay because the user is on a different plan
    const premium = await prisma.premium.findUnique({
      where: { id: premiumId, lemonSqueezyVariantId: variantId },
      select: { id: true },
    });
    if (!premium) return null;
  }

  return await prisma.premium.update({
    where: { id: premiumId },
    data: {
      lemonSqueezyRenewsAt: lemonSqueezyEndsAt,
      ...(expired
        ? {
            bulkUnsubscribeAccess: null,
            aiAutomationAccess: null,
            coldEmailBlockerAccess: null,
          }
        : {}),
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

function getTierAccess(tier: PremiumTier) {
  switch (tier) {
    case PremiumTier.BASIC_MONTHLY:
    case PremiumTier.BASIC_ANNUALLY:
      return {
        bulkUnsubscribeAccess: FeatureAccess.UNLOCKED,
        aiAutomationAccess: FeatureAccess.LOCKED,
        coldEmailBlockerAccess: FeatureAccess.LOCKED,
      };
    case PremiumTier.PRO_MONTHLY:
    case PremiumTier.PRO_ANNUALLY:
      return {
        bulkUnsubscribeAccess: FeatureAccess.UNLOCKED,
        aiAutomationAccess: FeatureAccess.UNLOCKED_WITH_API_KEY,
        coldEmailBlockerAccess: FeatureAccess.UNLOCKED_WITH_API_KEY,
      };
    case PremiumTier.BUSINESS_MONTHLY:
    case PremiumTier.BUSINESS_ANNUALLY:
    case PremiumTier.COPILOT_MONTHLY:
    case PremiumTier.LIFETIME:
      return {
        bulkUnsubscribeAccess: FeatureAccess.UNLOCKED,
        aiAutomationAccess: FeatureAccess.UNLOCKED,
        coldEmailBlockerAccess: FeatureAccess.UNLOCKED,
      };
    default:
      throw new Error(`Unknown premium tier: ${tier}`);
  }
}

export async function updateAccountSeats({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          lemonSqueezySubscriptionItemId: true,
          users: {
            select: {
              _count: { select: { emailAccounts: true } },
            },
          },
        },
      },
    },
  });

  if (!user) throw new Error(`User not found for id ${userId}`);

  const { premium } = user;

  if (!premium) {
    logger.warn("User has no premium", { userId });
    return;
  }

  if (!premium.lemonSqueezySubscriptionItemId) {
    logger.warn("User has no lemonSqueezySubscriptionItemId", { userId });
    return;
  }

  // Count all email accounts for all users
  const totalSeats = sumBy(premium.users, (user) => user._count.emailAccounts);

  await updateSubscriptionItemQuantity({
    id: premium.lemonSqueezySubscriptionItemId,
    quantity: totalSeats,
  });
}
