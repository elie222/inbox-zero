import sumBy from "lodash/sumBy";
import { hasIncludedEmailAccountsStripePriceId } from "@/app/(app)/premium/config";
import { updateSubscriptionItemQuantity } from "@/ee/billing/lemon/index";
import { updateStripeSubscriptionItemQuantity } from "@/ee/billing/stripe/index";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("premium");

export async function updateAccountSeats({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premium: { select: { id: true } } },
  });

  if (!user) throw new Error(`User not found for id ${userId}`);

  if (!user.premium) {
    logger.warn("User has no premium", { userId });
    return;
  }

  await syncPremiumSeats(user.premium.id);
}

export async function syncPremiumSeats(premiumId: string) {
  const premium = await prisma.premium.findUnique({
    where: { id: premiumId },
    select: {
      lemonSqueezySubscriptionItemId: true,
      stripeSubscriptionItemId: true,
      stripePriceId: true,
      users: {
        select: { _count: { select: { emailAccounts: true } } },
      },
    },
  });

  if (!premium) {
    logger.warn("Premium not found", { premiumId });
    return;
  }

  const totalSeats = getStripeBillingQuantity({
    priceId: premium.stripePriceId,
    users: premium.users,
  });
  await updateAccountSeatsForPremium(premium, totalSeats);
}

export async function addUserToPremium({
  visitorId,
  premiumId,
}: {
  visitorId: string;
  premiumId: string;
}) {
  await prisma.premium.update({
    where: { id: premiumId },
    data: { users: { connect: { id: visitorId } } },
  });
  await syncPremiumSeats(premiumId);
}

export async function removeUserFromPremium({
  visitorId,
  premiumId,
}: {
  visitorId: string;
  premiumId: string;
}) {
  await prisma.premium.update({
    where: { id: premiumId },
    data: { users: { disconnect: { id: visitorId } } },
  });
  await syncPremiumSeats(premiumId);
}

export async function removeFromPendingInvites({
  email,
  premiumId,
}: {
  email: string;
  premiumId: string;
}) {
  const premium = await prisma.premium.findUnique({
    where: { id: premiumId },
    select: { pendingInvites: true },
  });

  if (!premium) return;

  const currentPendingInvites = premium.pendingInvites || [];
  const updatedPendingInvites = currentPendingInvites.filter(
    (pendingEmail) => pendingEmail !== email,
  );

  if (currentPendingInvites.length !== updatedPendingInvites.length) {
    await prisma.premium.update({
      where: { id: premiumId },
      data: { pendingInvites: { set: updatedPendingInvites } },
    });
  }
}

export async function claimPendingPremiumInvite({
  visitorId,
  email,
  premiumId,
}: {
  visitorId: string;
  email: string;
  premiumId: string;
}) {
  await removeFromPendingInvites({ email, premiumId });
  await addUserToPremium({ visitorId, premiumId });
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
      logger,
    });
  } else if (premium.lemonSqueezySubscriptionItemId) {
    await updateSubscriptionItemQuantity({
      id: premium.lemonSqueezySubscriptionItemId,
      quantity: totalSeats,
      logger,
    });
  }
}

export function getStripeBillingQuantity({
  priceId,
  users,
}: {
  priceId: string | null | undefined;
  users: { _count: { emailAccounts: number } }[];
}): number {
  const totalSeats = hasIncludedEmailAccountsStripePriceId(priceId)
    ? sumBy(users, (user) =>
        user._count.emailAccounts <= 1
          ? user._count.emailAccounts
          : user._count.emailAccounts - 1,
      )
    : sumBy(users, (user) => user._count.emailAccounts);

  return Math.max(1, totalSeats);
}
