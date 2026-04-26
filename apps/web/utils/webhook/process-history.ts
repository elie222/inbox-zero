import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { Logger } from "@/utils/logger";
import { processHistoryForUser as processGoogleHistoryForUser } from "@/app/api/google/webhook/process-history";
import { processHistoryForUser as processOutlookHistoryForUser } from "@/app/api/outlook/webhook/process-history";
import { backfillRecentOutlookMessages } from "@/utils/outlook/backfill-recent-messages";
import prisma from "@/utils/prisma";

const OUTLOOK_ADMIN_RECONCILE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const OUTLOOK_ADMIN_RECONCILE_MAX_MESSAGES = 100;

export async function processProviderHistory({
  provider,
  emailAddress,
  historyId,
  startHistoryId,
  subscriptionId,
  resourceData,
  logger,
}: {
  provider: string;
  emailAddress: string;
  historyId?: number;
  startHistoryId?: number;
  subscriptionId?: string;
  resourceData?: {
    id: string;
    conversationId?: string;
  };
  logger: Logger;
}) {
  if (isGoogleProvider(provider)) {
    await processGoogleHistoryForUser(
      {
        emailAddress,
        historyId: historyId || 0,
      },
      {
        startHistoryId: startHistoryId?.toString(),
      },
      logger,
    );
    return;
  }

  if (isMicrosoftProvider(provider)) {
    if (!resourceData?.id) {
      const result = await backfillRecentOutlookMessages({
        emailAccountId: await getEmailAccountIdOrThrow(emailAddress),
        emailAddress,
        subscriptionId,
        after: new Date(Date.now() - OUTLOOK_ADMIN_RECONCILE_LOOKBACK_MS),
        maxMessages: OUTLOOK_ADMIN_RECONCILE_MAX_MESSAGES,
        logger,
      });

      logger.info("Reconciled recent Outlook messages from provider history", {
        emailAddress,
        processedCount: result.processedCount,
        candidateCount: result.candidateCount,
      });
      return;
    }

    await (subscriptionId
      ? processOutlookHistoryForUser({
          subscriptionId,
          resourceData,
          logger,
        })
      : processOutlookHistoryForUser({
          emailAddress,
          resourceData,
          logger,
        }));
    return;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function getEmailAccountIdOrThrow(emailAddress: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email: emailAddress.toLowerCase() },
    select: { id: true },
  });

  if (!emailAccount) {
    throw new Error("Email account not found for Outlook history processing");
  }

  return emailAccount.id;
}
