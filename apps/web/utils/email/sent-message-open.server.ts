import "server-only";
import { randomBytes } from "node:crypto";
import prisma from "@/utils/prisma";
import { toAbsoluteUrl } from "@/utils/branding";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import type { SendEmailBody } from "@/utils/types/mail";
import {
  appendSentMessageOpenPixel,
  isSentMessageOpenToken,
  SENT_MESSAGE_OPEN_TOKEN_LENGTH,
  sentMessageOpenPath,
} from "@/utils/email/sent-message-open";

export function createSentMessageOpenToken() {
  return randomBytes((SENT_MESSAGE_OPEN_TOKEN_LENGTH * 3) / 4).toString(
    "base64url",
  );
}

export async function withSentMessageOpenTracking({
  emailAccountId,
  threadId,
  email,
  logger,
}: {
  emailAccountId: string;
  threadId?: string | null;
  email: SendEmailBody;
  logger: Logger;
}): Promise<{ email: SendEmailBody; token: string | null }> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { sentMessageOpenTrackingEnabled: true },
  });
  if (!account?.sentMessageOpenTrackingEnabled) {
    return { email, token: null };
  }

  const token = createSentMessageOpenToken();
  if (!isSentMessageOpenToken(token)) {
    logger.error("Generated an invalid sent-message open token");
    return { email, token: null };
  }

  try {
    await prisma.sentMessageOpen.create({
      data: {
        token,
        emailAccountId,
        threadId: threadId || undefined,
      },
    });
  } catch (error) {
    logger.error("Failed to create sent-message open tracking", { error });
    return { email, token: null };
  }

  return {
    email: {
      ...email,
      messageHtml: appendSentMessageOpenPixel(
        email.messageHtml,
        toAbsoluteUrl(sentMessageOpenPath(token)),
      ),
    },
    token,
  };
}

export async function associateSentMessageOpen({
  token,
  messageId,
  threadId,
  logger,
}: {
  token: string | null;
  messageId?: string | null;
  threadId?: string | null;
  logger: Logger;
}) {
  if (!token || !messageId) return;
  try {
    await prisma.sentMessageOpen.update({
      where: { token },
      data: {
        messageId,
        ...(threadId ? { threadId } : {}),
      },
    });
  } catch (error) {
    if (isDuplicateError(error, ["emailAccountId", "messageId"])) {
      logger.warn("Sent-message open already associated with this message");
      return;
    }
    logger.error("Failed to associate sent-message open tracking", { error });
  }
}

export async function recordSentMessageOpen(token: string) {
  if (!isSentMessageOpenToken(token)) return;
  const now = new Date();
  const firstOpen = await prisma.sentMessageOpen.updateMany({
    where: { token, firstOpenedAt: null },
    data: { firstOpenedAt: now, lastOpenedAt: now, openCount: 1 },
  });
  if (firstOpen.count > 0) return;
  await prisma.sentMessageOpen.updateMany({
    where: { token },
    data: { lastOpenedAt: now, openCount: { increment: 1 } },
  });
}

export async function sendHtmlEmailWithOpenTracking({
  emailAccountId,
  threadId,
  email,
  emailProvider,
  logger,
}: {
  emailAccountId: string;
  threadId?: string | null;
  email: SendEmailBody;
  emailProvider: EmailProvider;
  logger: Logger;
}) {
  const prepared = await withSentMessageOpenTracking({
    emailAccountId,
    threadId: threadId ?? email.replyToEmail?.threadId,
    email,
    logger,
  });
  const result = await emailProvider.sendEmailWithHtml(prepared.email);
  await associateSentMessageOpen({
    token: prepared.token,
    messageId: result.messageId,
    threadId: result.threadId,
    logger,
  });
  return result;
}
