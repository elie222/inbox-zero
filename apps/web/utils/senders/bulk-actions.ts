import { NewsletterStatus } from "@/generated/prisma/enums";
import type { BulkSenderActionName } from "@/utils/actions/unsubscriber.validation";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { getSenderUnsubscribeSource } from "@/utils/senders/source";
import {
  setSenderStatusWithAutoArchive,
  unsubscribeSenderAndMark,
} from "@/utils/senders/unsubscribe";

export type BulkSenderActionResult = {
  senderEmail: string;
  ok: boolean;
  status: NewsletterStatus | null;
  reason?: string;
};

export async function applySenderBulkActions({
  actions,
  emailAccountId,
  emailProvider,
  logger,
}: {
  actions: { senderEmail: string; action: BulkSenderActionName }[];
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<BulkSenderActionResult[]> {
  const results: BulkSenderActionResult[] = [];

  for (const action of actions) {
    results.push(
      await applySenderBulkAction({
        action,
        emailAccountId,
        emailProvider,
        logger,
      }),
    );
  }

  return results;
}

async function applySenderBulkAction({
  action,
  emailAccountId,
  emailProvider,
  logger,
}: {
  action: { senderEmail: string; action: BulkSenderActionName };
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<BulkSenderActionResult> {
  try {
    switch (action.action) {
      case "unsubscribe":
        return await unsubscribeSender({
          senderEmail: action.senderEmail,
          emailAccountId,
          emailProvider,
          logger,
        });
      case "approved":
        return await setStatus({
          senderEmail: action.senderEmail,
          status: NewsletterStatus.APPROVED,
          emailAccountId,
          emailProvider,
        });
      case "auto_archived":
        return await setStatus({
          senderEmail: action.senderEmail,
          status: NewsletterStatus.AUTO_ARCHIVED,
          emailAccountId,
          emailProvider,
        });
      case "clear":
        return await setStatus({
          senderEmail: action.senderEmail,
          status: null,
          emailAccountId,
          emailProvider,
        });
    }
  } catch (error) {
    logger.error("Bulk sender action failed", {
      error,
      action: action.action,
    });
    logger.trace("Bulk sender action failed for sender", {
      senderEmail: action.senderEmail,
    });
    return {
      senderEmail: action.senderEmail,
      ok: false,
      status: null,
      reason: "request_failed",
    };
  }
}

async function unsubscribeSender({
  senderEmail,
  emailAccountId,
  emailProvider,
  logger,
}: {
  senderEmail: string;
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<BulkSenderActionResult> {
  const source = await getSenderUnsubscribeSource({
    senderEmail,
    emailProvider,
    logger,
  });
  const result = await unsubscribeSenderAndMark({
    emailAccountId,
    senderEmail,
    unsubscribeLink: source.unsubscribeLink,
    listUnsubscribeHeader: source.listUnsubscribeHeader,
    logger,
  });

  if (!result.unsubscribe.success) {
    return {
      senderEmail,
      ok: false,
      status: result.status,
      reason: result.unsubscribe.reason ?? "request_failed",
    };
  }

  return { senderEmail, ok: true, status: result.status };
}

async function setStatus({
  senderEmail,
  status,
  emailAccountId,
  emailProvider,
}: {
  senderEmail: string;
  status: NewsletterStatus | null;
  emailAccountId: string;
  emailProvider: EmailProvider;
}): Promise<BulkSenderActionResult> {
  const result = await setSenderStatusWithAutoArchive({
    emailAccountId,
    emailProvider,
    senderEmail,
    status,
  });

  return { senderEmail, ok: true, status: result.status };
}
