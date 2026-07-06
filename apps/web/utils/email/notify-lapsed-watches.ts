import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import {
  getPremiumUserFilter,
  getUserTier,
  hasAiAccess,
  premiumEntitlementSelect,
} from "@/utils/premium";
import {
  addUserErrorMessageWithNotification,
  ErrorType,
} from "@/utils/error-messages";

// Grace period so a few missed or failed cron runs don't trigger a notification.
const MIN_LAPSE_MS = 24 * 60 * 60 * 1000;
// Only notify recent lapses. This is not a backfill: accounts that lapsed long
// ago must never receive this email.
const MAX_LAPSE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * State-based detection of email accounts whose watch/subscription silently
 * stopped renewing. Runs after the watch renewal pass, so anything still
 * expired here has been failing renewal despite the cron.
 *
 * Notification is once per lapse: `addUserErrorMessageWithNotification`
 * only emails while no `emailSentAt` is recorded for the error type, and the
 * error is cleared when a lapsed watch is successfully re-established.
 */
export async function notifyLapsedWatches({ logger }: { logger: Logger }) {
  const emailAccounts = await getRecentlyLapsedEmailAccounts();

  if (!emailAccounts.length) return { notified: 0 };

  logger.info("Found recently lapsed watch accounts", {
    count: emailAccounts.length,
  });

  let notified = 0;

  for (const emailAccount of emailAccounts) {
    const { user } = emailAccount;

    const userHasAiAccess = hasAiAccess(
      getUserTier(user.premium),
      !!user.aiApiKey,
    );
    if (!userHasAiAccess) continue;

    await addUserErrorMessageWithNotification({
      userId: emailAccount.userId,
      userEmail: emailAccount.email,
      emailAccountId: emailAccount.id,
      errorType: ErrorType.EMAIL_WATCH_LAPSED,
      errorMessage: `Email automation for ${emailAccount.email} has stopped. Please reconnect your account to resume automation.`,
      logger: logger.with({ emailAccountId: emailAccount.id }),
    });

    notified++;
  }

  logger.info("Processed lapsed watch notifications", { notified });

  return { notified };
}

async function getRecentlyLapsedEmailAccounts() {
  const now = Date.now();

  return prisma.emailAccount.findMany({
    where: {
      ...getPremiumUserFilter(),
      account: { disconnectedAt: null },
      watchEmailsExpirationDate: {
        gte: new Date(now - MAX_LAPSE_MS),
        lt: new Date(now - MIN_LAPSE_MS),
      },
    },
    select: {
      id: true,
      email: true,
      userId: true,
      user: {
        select: {
          aiApiKey: true,
          premium: { select: premiumEntitlementSelect },
        },
      },
    },
  });
}
