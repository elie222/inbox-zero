import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import prisma from "@/utils/prisma";
import { sendComposeDraft } from "@/utils/email/compose-draft";
import { env } from "@/env";
import { toAbsoluteUrl } from "@/utils/branding";
import { secureCompareBuffers } from "@/utils/crypto-compare";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import type { SendEmailBody } from "@/utils/types/mail";
import {
  appendSentMessageOpenPixel,
  isSentMessageOpenToken,
  sentMessageOpenPath,
  stripSentMessageOpenPixels,
} from "./sent-message-open";

const SENT_MESSAGE_OPEN_TOKEN_PAYLOAD_BYTES = 18;
const SENT_MESSAGE_OPEN_TOKEN_MAC_BYTES = 6;

export function createSentMessageOpenToken() {
  const payload = randomBytes(SENT_MESSAGE_OPEN_TOKEN_PAYLOAD_BYTES);
  return Buffer.concat([payload, sentMessageOpenTokenMac(payload)]).toString(
    "base64url",
  );
}

export function isAuthenticSentMessageOpenToken(token: string) {
  if (!isSentMessageOpenToken(token)) return false;
  const bytes = Buffer.from(token, "base64url");
  if (
    bytes.length !==
    SENT_MESSAGE_OPEN_TOKEN_PAYLOAD_BYTES + SENT_MESSAGE_OPEN_TOKEN_MAC_BYTES
  ) {
    return false;
  }
  const payload = bytes.subarray(0, SENT_MESSAGE_OPEN_TOKEN_PAYLOAD_BYTES);
  const mac = bytes.subarray(SENT_MESSAGE_OPEN_TOKEN_PAYLOAD_BYTES);
  return secureCompareBuffers(mac, sentMessageOpenTokenMac(payload));
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
  const messageHtml = stripSentMessageOpenPixels(email.messageHtml);
  let account: { sentMessageOpenTrackingEnabled: boolean } | null = null;
  try {
    account = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { sentMessageOpenTrackingEnabled: true },
    });
  } catch (error) {
    logger.error("Failed to read sent-message open tracking setting", {
      error,
    });
    return { email: { ...email, messageHtml }, token: null };
  }
  if (!account?.sentMessageOpenTrackingEnabled) {
    return {
      email: { ...email, messageHtml },
      token: null,
    };
  }

  const token = createSentMessageOpenToken();
  if (!isSentMessageOpenToken(token)) {
    logger.error("Generated an invalid sent-message open token");
    return { email: { ...email, messageHtml }, token: null };
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
    return { email: { ...email, messageHtml }, token: null };
  }

  return {
    email: {
      ...email,
      messageHtml: appendSentMessageOpenPixel(
        messageHtml,
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
  if (!isAuthenticSentMessageOpenToken(token)) return;
  const now = new Date();
  const firstOpen = await prisma.sentMessageOpen.updateMany({
    where: { token, firstOpenedAt: null },
    data: { firstOpenedAt: now, lastOpenedAt: now, openCount: 1 },
  });
  if (firstOpen.count > 0) return;
  await prisma.sentMessageOpen.updateMany({
    where: {
      token,
      lastOpenedAt: { lt: new Date(now.getTime() - 5000) },
    },
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
  const result = email.composeSessionId
    ? await sendComposeDraft({
        emailAccountId,
        sessionId: email.composeSessionId,
        provider: emailProvider,
        email: prepared.email,
      })
    : await emailProvider.sendEmailWithHtml(prepared.email);
  await associateSentMessageOpen({
    token: prepared.token,
    messageId: result.messageId,
    threadId: result.threadId,
    logger,
  });
  return result;
}

function sentMessageOpenTokenMac(payload: Buffer) {
  return createHmac("sha256", env.EMAIL_ENCRYPT_SALT)
    .update(payload)
    .digest()
    .subarray(0, SENT_MESSAGE_OPEN_TOKEN_MAC_BYTES);
}
