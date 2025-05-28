import {
  createContact,
  upgradedToPremium,
  cancelledPremium,
} from "@inboxzero/loops";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("stripe/syncStripeDataToDb");

export async function handleLoopsEvents({
  currentPremium,
  newSubscription,
  newTier,
}: {
  currentPremium: {
    stripeSubscriptionStatus: string | null;
    stripeTrialEnd: Date | null;
    tier: string | null;
    users: { email: string; name: string | null }[];
    admins: { email: string; name: string | null }[];
  } | null;
  newSubscription: any;
  newTier: string | null;
}) {
  try {
    if (!currentPremium) return;

    const email =
      currentPremium.users[0]?.email || currentPremium.admins[0]?.email;
    const name =
      currentPremium.users[0]?.name || currentPremium.admins[0]?.name;

    if (!email) {
      logger.warn("No email found for premium user");
      return;
    }

    // 1. Trial started - new trial end date and no previous subscription status
    const hasNewTrial =
      newSubscription.trial_end &&
      newSubscription.trial_end > Date.now() / 1000 &&
      !currentPremium.stripeSubscriptionStatus;

    if (hasNewTrial) {
      logger.info("Trial started", { email });
      await createContact(email, name?.split(" ")[0]);
    }

    // 2. First real payment - transition from trial to active or direct to active
    const wasInTrial =
      currentPremium.stripeTrialEnd &&
      currentPremium.stripeTrialEnd > new Date();
    const isNowActive = newSubscription.status === "active";
    const noLongerInTrial =
      !newSubscription.trial_end ||
      newSubscription.trial_end <= Date.now() / 1000;

    const isFirstPayment =
      isNowActive &&
      ((wasInTrial && noLongerInTrial) || // Completed trial
        !currentPremium.stripeSubscriptionStatus || // First subscription
        currentPremium.stripeSubscriptionStatus === "incomplete");

    if (isFirstPayment) {
      logger.info("First real payment", { email, tier: newTier });
      if (newTier) {
        await upgradedToPremium(email, newTier);
      }
    }

    // 3. Subscription cancelled
    const wasCancelled =
      (newSubscription.status === "canceled" ||
        newSubscription.status === "unpaid" ||
        newSubscription.status === "incomplete_expired") &&
      currentPremium.stripeSubscriptionStatus !== newSubscription.status;

    if (wasCancelled) {
      logger.info("Subscription cancelled", { email });
      await cancelledPremium(email);
    }
  } catch (error) {
    logger.error("Error handling Loops events", { error });
    // Don't throw - we don't want Loops errors to break sync
  }
}
