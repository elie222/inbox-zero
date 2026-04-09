import {
  isGoogleProvider,
  isImapProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { Logger } from "@/utils/logger";
import { processHistoryForUser as processGoogleHistoryForUser } from "@/app/api/google/webhook/process-history";
import { processHistoryForUser as processOutlookHistoryForUser } from "@/app/api/outlook/webhook/process-history";

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
    if (!resourceData) {
      throw new Error(
        "resourceData is required for Outlook history processing",
      );
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

  // IMAP uses polling, not webhooks - skip gracefully
  if (isImapProvider(provider)) {
    logger.info("Skipping webhook history processing for IMAP account");
    return;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
