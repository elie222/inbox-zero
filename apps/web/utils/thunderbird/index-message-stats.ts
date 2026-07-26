import {
  extractDomainFromEmail,
  extractEmailAddress,
  extractNameFromEmail,
} from "@/utils/email";
import prisma from "@/utils/prisma";
import { upsertSenderRecord } from "@/utils/senders/record";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { getHttpUnsubscribeLink } from "@/utils/parse/unsubscribe";
import type { ParsedMessage } from "@/utils/types";
import type { Logger } from "@/utils/logger";

/** Index processed Thunderbird mail so Bulk Unsubscribe/Archive can list senders. */
export async function indexThunderbirdMessageForStats({
  emailAccountId,
  message,
  listUnsubscribeHeader,
  logger,
}: {
  emailAccountId: string;
  message: ParsedMessage;
  listUnsubscribeHeader?: string | null;
  logger: Logger;
}) {
  const fromHeader = message.headers.from || "";
  const fromEmail = extractEmailAddress(fromHeader).toLowerCase();
  if (!fromEmail) return;

  const date =
    message.date instanceof Date
      ? message.date
      : message.date
        ? new Date(message.date)
        : new Date();

  const unsubscribeLink =
    getHttpUnsubscribeLink({
      unsubscribeLink: findUnsubscribeLink(message.textHtml),
      listUnsubscribeHeader:
        listUnsubscribeHeader || message.headers["list-unsubscribe"] || null,
    }) || null;

  try {
    await prisma.emailMessage.upsert({
      where: {
        emailAccountId_threadId_messageId: {
          emailAccountId,
          threadId: message.threadId,
          messageId: message.id,
        },
      },
      create: {
        emailAccountId,
        threadId: message.threadId,
        messageId: message.id,
        date,
        from: fromEmail,
        fromName: extractNameFromEmail(fromHeader) || null,
        fromDomain: extractDomainFromEmail(fromEmail) || fromEmail,
        to: message.headers.to || "",
        unsubscribeLink,
        read: message.labelIds?.includes("READ") === true,
        sent: false,
        draft: false,
        inbox: true,
      },
      update: {
        date,
        from: fromEmail,
        fromName: extractNameFromEmail(fromHeader) || null,
        fromDomain: extractDomainFromEmail(fromEmail) || fromEmail,
        to: message.headers.to || "",
        ...(unsubscribeLink ? { unsubscribeLink } : {}),
        read: message.labelIds?.includes("READ") === true,
      },
    });

    await upsertSenderRecord({
      emailAccountId,
      newsletterEmail: fromEmail,
      changes: {
        name: extractNameFromEmail(fromHeader) || null,
      },
    });
  } catch (error) {
    logger.warn("Failed to index Thunderbird message for sender stats", {
      error,
      messageId: message.id,
    });
  }
}
