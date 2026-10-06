import { NewsletterStatus } from "@/generated/prisma/enums";
import type { BulkSenderActionName } from "@/utils/actions/unsubscriber.validation";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import {
  releaseUnsubscribeCreditReservation,
  reserveUnsubscribeCredit,
} from "@/utils/premium/unsubscribe-credits";
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

export function senderActionsRequireUnsubscribeAccess(
  actions: { action: BulkSenderActionName }[],
) {
  return actions.some(
    (action) =>
      action.action === "unsubscribe" || action.action === "auto_archived",
  );
}

export async function applySenderBulkActions({
  actions,
  emailAccountId,
  emailProvider,
  userId,
  logger,
}: {
  actions: { senderEmail: string; action: BulkSenderActionName }[];
  emailAccountId: string;
  emailProvider: EmailProvider;
  userId: string;
  logger: Logger;
}): Promise<BulkSenderActionResult[]> {
  const results: BulkSenderActionResult[] = [];

  for (const action of actions) {
    results.push(
      await applySenderBulkAction({
        action,
        emailAccountId,
        emailProvider,
        userId,
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
  userId,
  logger,
}: {
  action: { senderEmail: string; action: BulkSenderActionName };
  emailAccountId: string;
  emailProvider: EmailProvider;
  userId: string;
  logger: Logger;
}): Promise<BulkSenderActionResult> {
  try {
    switch (action.action) {
      case "unsubscribe":
        return await unsubscribeSender({
          senderEmail: action.senderEmail,
          emailAccountId,
          emailProvider,
          userId,
          logger,
        });
      case "approved":
        return await setStatus({
          senderEmail: action.senderEmail,
          status: NewsletterStatus.APPROVED,
          consumeCredit: false,
          emailAccountId,
          emailProvider,
          userId,
          logger,
        });
      case "auto_archived":
        return await setStatus({
          senderEmail: action.senderEmail,
          status: NewsletterStatus.AUTO_ARCHIVED,
          consumeCredit: true,
          emailAccountId,
          emailProvider,
          userId,
          logger,
        });
      case "clear":
        return await setStatus({
          senderEmail: action.senderEmail,
          status: null,
          consumeCredit: false,
          emailAccountId,
          emailProvider,
          userId,
          logger,
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
  userId,
  logger,
}: {
  senderEmail: string;
  emailAccountId: string;
  emailProvider: EmailProvider;
  userId: string;
  logger: Logger;
}): Promise<BulkSenderActionResult> {
  const reservation = await reserveUnsubscribeCredit({ userId });
  if (reservation === "denied") return allowanceResult(senderEmail);

  try {
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
      await releaseUnsubscribeCreditReservation({
        userId,
        reservation,
        logger,
      });
      return {
        senderEmail,
        ok: false,
        status: result.status,
        reason: result.unsubscribe.reason ?? "request_failed",
      };
    }

    return { senderEmail, ok: true, status: result.status };
  } catch (error) {
    await releaseUnsubscribeCreditReservation({ userId, reservation, logger });
    throw error;
  }
}

async function setStatus({
  senderEmail,
  status,
  consumeCredit: shouldConsumeCredit,
  emailAccountId,
  emailProvider,
  userId,
  logger,
}: {
  senderEmail: string;
  status: NewsletterStatus | null;
  consumeCredit: boolean;
  emailAccountId: string;
  emailProvider: EmailProvider;
  userId: string;
  logger: Logger;
}): Promise<BulkSenderActionResult> {
  const reservation = shouldConsumeCredit
    ? await reserveUnsubscribeCredit({ userId })
    : null;
  if (reservation === "denied") return allowanceResult(senderEmail);

  try {
    const result = await setSenderStatusWithAutoArchive({
      emailAccountId,
      emailProvider,
      senderEmail,
      status,
    });

    return { senderEmail, ok: true, status: result.status };
  } catch (error) {
    if (reservation) {
      await releaseUnsubscribeCreditReservation({
        userId,
        reservation,
        logger,
      });
    }
    throw error;
  }
}

function allowanceResult(senderEmail: string): BulkSenderActionResult {
  return {
    senderEmail,
    ok: false,
    status: null,
    reason: "unsubscribe_allowance",
  };
}
