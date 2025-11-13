import sumBy from "lodash/sumBy";
import { after } from "next/server";
import { updateSubscriptionItemQuantity } from "@/ee/billing/lemon/index";
import { updateStripeSubscriptionItemQuantity } from "@/ee/billing/stripe/index";
import prisma from "@/utils/prisma";
import type { PremiumTier, Prisma } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import { hasTierAccess, isPremium } from "@/utils/premium";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("premium");

export async function upgradeToPremiumLemon(options: {
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
  const { userId, ...data } = options;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premiumId: true },
  });

  if (!user) {
    logger.error("User not found", { userId });
    throw new Error("User not found");
  }

  const premiumRecord = user.premiumId
    ? await prisma.premium.update({
        where: { id: user.premiumId },
        data,
        select: { users: { select: { id: true, email: true } } },
      })
    : await prisma.premium.create({
        data: {
          users: { connect: { id: userId } },
          admins: { connect: { id: userId } },
          ...data,
        },
        select: { users: { select: { id: true, email: true } } },
      });

  after(() => {
    const userIds = premiumRecord.users.map((premiumUser) => premiumUser.id);
    ensureEmailAccountsWatched({ userIds }).catch((error) => {
      logger.error("Failed to ensure email watches after premium upgrade", {
        userIds,
        error,
      });
    });
  });

  return premiumRecord;
}

export async function extendPremiumLemon(options: {
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

export async function cancelPremiumLemon({
  premiumId,
  lemonSqueezyEndsAt,
  variantId,
}: {
  premiumId: string;
  lemonSqueezyEndsAt: Date;
  variantId?: number;
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
    data: { lemonSqueezyRenewsAt: lemonSqueezyEndsAt },
    select: { users: { select: { email: true } } },
  });
}

export async function updateAccountSeats({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          lemonSqueezySubscriptionItemId: true,
          stripeSubscriptionItemId: true,
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

  // Count all email accounts for all users
  const totalSeats = sumBy(premium.users, (user) => user._count.emailAccounts);

  await updateAccountSeatsForPremium(premium, totalSeats);
}

export async function updateAccountSeatsForPremium(
  premium: {
    stripeSubscriptionItemId: string | null;
    lemonSqueezySubscriptionItemId?: number | null;
  },
  totalSeats: number,
) {
  if (premium.stripeSubscriptionItemId) {
    await updateStripeSubscriptionItemQuantity({
      subscriptionItemId: premium.stripeSubscriptionItemId,
      quantity: totalSeats,
    });
  } else if (premium.lemonSqueezySubscriptionItemId) {
    await updateSubscriptionItemQuantity({
      id: premium.lemonSqueezySubscriptionItemId,
      quantity: totalSeats,
    });
  }
}

export async function checkHasAccess({
  userId,
  minimumTier,
}: {
  userId: string;
  minimumTier: PremiumTier;
}): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          tier: true,
          stripeSubscriptionStatus: true,
          lemonSqueezyRenewsAt: true,
        },
      },
    },
  });

  if (!user) throw new SafeError("User not found");

  if (
    !isPremium(
      user?.premium?.lemonSqueezyRenewsAt || null,
      user?.premium?.stripeSubscriptionStatus || null,
    )
  ) {
    return false;
  }

  return hasTierAccess({
    tier: user.premium?.tier || null,
    minimumTier,
  });
}
