import type Stripe from "stripe";
import { getStripe } from "@/ee/billing/stripe";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const ENDED_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
]);

// A deleted account can no longer reach the billing portal, so a subscription
// left running would keep charging someone with no way to cancel it.
export async function cancelStripeSubscriptionForDeletedUser({
  userId,
  logger,
}: {
  userId: string;
  logger: Logger;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          stripeSubscriptionId: true,
          _count: { select: { users: true } },
        },
      },
    },
  });

  const premium = user?.premium;
  if (!premium?.stripeSubscriptionId) return;

  // Other members still rely on a shared plan.
  if (premium._count.users > 1) {
    logger.info("Keeping shared Stripe subscription on account deletion", {
      subscriptionId: premium.stripeSubscriptionId,
    });
    return;
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(
    premium.stripeSubscriptionId,
  );
  if (ENDED_STATUSES.has(subscription.status)) return;

  await stripe.subscriptions.cancel(subscription.id, undefined, {
    idempotencyKey: `account-deletion-cancel-${subscription.id}`,
  });

  logger.info("Canceled Stripe subscription on account deletion", {
    subscriptionId: subscription.id,
  });
}
