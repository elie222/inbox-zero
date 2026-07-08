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
  watchLapsedErrorKey,
} from "@/utils/error-messages";

// A few missed or failed cron runs shouldn't trigger a notification.
const MIN_LAPSE_MS = 24 * 60 * 60 * 1000;
// Not a backfill: accounts that lapsed long ago must never receive this email.
const MAX_LAPSE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACCOUNTS_PER_RUN = 500;
const NOTIFY_CONCURRENCY = 10;

export async function notifyLapsedWatches({ logger }: { logger: Logger }) {
  const emailAccounts = await getRecentlyLapsedEmailAccounts();

  if (!emailAccounts.length) return { notified: 0 };

  logger.info("Found recently lapsed watch accounts", {
    count: emailAccounts.length,
    truncated: emailAccounts.length === MAX_ACCOUNTS_PER_RUN,
  });

  let notified = 0;

  for (let i = 0; i < emailAccounts.length; i += NOTIFY_CONCURRENCY) {
    const batch = emailAccounts.slice(i, i + NOTIFY_CONCURRENCY);
    const results = await Promise.all(
      batch.map((emailAccount) => notifyIfEligible(emailAccount, logger)),
    );
    notified += results.filter(Boolean).length;
  }

  logger.info("Processed lapsed watch notifications", { notified });

  return { notified };
}

async function notifyIfEligible(
  emailAccount: Awaited<
    ReturnType<typeof getRecentlyLapsedEmailAccounts>
  >[number],
  logger: Logger,
): Promise<boolean> {
  const { user } = emailAccount;

  const userHasAiAccess = hasAiAccess(
    getUserTier(user.premium),
    !!user.aiApiKey,
  );
  if (!userHasAiAccess) return false;

  await addUserErrorMessageWithNotification({
    userId: emailAccount.userId,
    userEmail: emailAccount.email,
    emailAccountId: emailAccount.id,
    errorType: ErrorType.EMAIL_WATCH_LAPSED,
    storageKey: watchLapsedErrorKey(emailAccount.id),
    errorMessage: `Email automation for ${emailAccount.email} has stopped. Please reconnect your account to resume automation.`,
    logger: logger.with({ emailAccountId: emailAccount.id }),
  });

  return true;
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
    take: MAX_ACCOUNTS_PER_RUN,
  });
}
