import { isEmailProviderRateLimitError } from "@/utils/email/is-provider-rate-limit-error";
import type { Logger } from "@/utils/logger";
import { backfillRecentOutlookMessages } from "@/utils/outlook/backfill-recent-messages";
import {
  markOutlookRateLimitCatchUp,
  takeOutlookRateLimitCatchUp,
} from "@/utils/redis/outlook-rate-limit-catch-up";

// Covers mail that arrived just before the first skipped notification.
const CATCH_UP_BUFFER_MS = 5 * 60 * 1000;
const CATCH_UP_MAX_MESSAGES = 100;

/**
 * Processes mail whose notifications were skipped while Microsoft was rate
 * limiting the account. If the account is rate limited again partway through,
 * the window is put back so a later notification can finish it.
 */
export async function catchUpAfterOutlookRateLimit({
  emailAccount,
  logger,
}: {
  emailAccount: {
    id: string;
    email: string;
    watchEmailsSubscriptionId: string | null;
  };
  logger: Logger;
}) {
  const since = await takeOutlookRateLimitCatchUp(emailAccount.id, logger);
  if (!since) return;

  const log = logger.with({ catchUpSince: since.toISOString() });
  log.info("Catching up on Outlook mail skipped during rate limit");

  try {
    const result = await backfillRecentOutlookMessages({
      emailAccountId: emailAccount.id,
      emailAddress: emailAccount.email,
      subscriptionId: emailAccount.watchEmailsSubscriptionId ?? undefined,
      after: new Date(since.getTime() - CATCH_UP_BUFFER_MS),
      maxMessages: CATCH_UP_MAX_MESSAGES,
      logger: log,
    });

    if (result.rateLimited) {
      await markOutlookRateLimitCatchUp({
        emailAccountId: emailAccount.id,
        since,
        logger: log,
      });
    }
  } catch (error) {
    if (isEmailProviderRateLimitError({ error, provider: "microsoft" })) {
      await markOutlookRateLimitCatchUp({
        emailAccountId: emailAccount.id,
        since,
        logger: log,
      });
      log.warn("Outlook rate-limit catch-up deferred by another rate limit");
      return;
    }

    log.error("Failed to catch up on Outlook mail skipped during rate limit", {
      error,
    });
  }
}
