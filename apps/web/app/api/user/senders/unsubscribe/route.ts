import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { withEmailAccount } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import { unsubscribeSenderBody } from "@/utils/actions/unsubscriber.validation";
import {
  consumeUnsubscribeCredit,
  userHasUnsubscribeAccess,
} from "@/utils/premium/unsubscribe-credits";
import { getSenderUnsubscribeSource } from "@/utils/senders/source";
import { unsubscribeAllowanceErrorResponse } from "@/utils/senders/unsubscribe-allowance";
import { unsubscribeSenderAndMark } from "@/utils/senders/unsubscribe";
import type { Logger } from "@/utils/logger";

export type UnsubscribeSenderResponse = Awaited<
  ReturnType<typeof unsubscribeSenderAndMark>
>;

export const maxDuration = 180;

/**
 * Tries RFC 8058 one-click POST, then a simple HTML form, then the isolated
 * browser worker when configured. Otherwise uses the existing HTTP GET
 * fallback. Check `unsubscribe.success` in the response: when it is false
 * the sender was left unchanged and the caller should fall back to opening
 * `unsubscribeLink`.
 *
 * `{ senderEmail }` is enough. When the link and header are omitted they are
 * resolved from the sender's recent mail. A successful unsubscribe spends one
 * free-tier credit. Callers without allowance receive 403
 * `unsubscribe_allowance`.
 */
export const POST = withEmailAccount(
  "user/senders/unsubscribe",
  async (request) => {
    const { senderEmail, unsubscribeLink, listUnsubscribeHeader } =
      unsubscribeSenderBody.parse(await request.json());
    const { emailAccountId, userId } = request.auth;

    if (!(await userHasUnsubscribeAccess({ userId }))) {
      return unsubscribeAllowanceErrorResponse();
    }

    const source =
      unsubscribeLink || listUnsubscribeHeader
        ? { unsubscribeLink, listUnsubscribeHeader }
        : await loadOmittedUnsubscribeSource({
            emailAccountId,
            userId,
            senderEmail,
            logger: request.logger,
          });

    const result = await unsubscribeSenderAndMark({
      emailAccountId,
      senderEmail,
      unsubscribeLink: source.unsubscribeLink,
      listUnsubscribeHeader: source.listUnsubscribeHeader,
      logger: request.logger,
    });

    if (result.unsubscribe.success) {
      try {
        await consumeUnsubscribeCredit({ userId });
      } catch (error) {
        // The sender is already unsubscribed. A credit-write failure must not
        // look like the unsubscribe failed and invite a second attempt.
        request.logger.error("Failed to consume unsubscribe credit", { error });
      }
    }

    return NextResponse.json(result satisfies UnsubscribeSenderResponse);
  },
);

async function loadOmittedUnsubscribeSource({
  emailAccountId,
  userId,
  senderEmail,
  logger,
}: {
  emailAccountId: string;
  userId: string;
  senderEmail: string;
  logger: Logger;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId },
    select: { account: { select: { provider: true } } },
  });

  if (!emailAccount?.account.provider) {
    throw new SafeError("Email account not found", 404);
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
    logger,
  });

  return getSenderUnsubscribeSource({
    senderEmail,
    emailProvider,
    logger,
  });
}
