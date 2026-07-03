import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { GmailLabel } from "@/utils/gmail/label";
import { internalDateToDate } from "@/utils/date";
import {
  extractDomainFromEmail,
  extractEmailAddress,
  extractNameFromEmail,
} from "@/utils/email";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import {
  cleanUnsubscribeLink,
  parseListUnsubscribeHeader,
} from "@/utils/parse/unsubscribe";
import type { ParsedMessage } from "@/utils/types";
import { isDefined } from "@/utils/types";

type EmailMessageStatsRow = {
  threadId: string;
  messageId: string;
  from: string;
  fromName: string;
  fromDomain: string;
  to: string;
  date: Date;
  unsubscribeLink: string | null | undefined;
  read: boolean;
  sent: boolean;
  draft: boolean;
  inbox: boolean;
  emailAccountId: string;
};

export async function upsertEmailMessageStatsBatch({
  emailAccountId,
  messages,
  logger,
}: {
  emailAccountId: string;
  messages: ParsedMessage[];
  logger: Logger;
}) {
  const emailsToSave = messages
    .map((message) =>
      toEmailMessageStatsRow({ emailAccountId, message, logger }),
    )
    .filter(isDefined);

  logger.info("Saving", { count: emailsToSave.length });

  await saveEmailMessages(emailsToSave);
}

export async function upsertEmailMessageStats({
  emailAccountId,
  message,
  logger,
}: {
  emailAccountId: string;
  message: ParsedMessage;
  logger: Logger;
}) {
  await upsertEmailMessageStatsBatch({
    emailAccountId,
    messages: [message],
    logger,
  });
}

export async function deleteEmailMessageStats({
  emailAccountId,
  messageId,
  threadId,
  reason,
  logger,
}: {
  emailAccountId: string;
  messageId: string;
  threadId?: string | null;
  reason: string;
  logger: Logger;
}) {
  const result = await prisma.emailMessage.deleteMany({
    where: {
      emailAccountId,
      messageId,
      ...(threadId ? { threadId } : {}),
    },
  });

  logger.info("Deleted EmailMessage stats", {
    emailAccountId,
    messageId,
    threadId,
    reason,
    deletedCount: result.count,
  });
}

export async function reconcileEmailMessageStatsFromParsedMessage({
  emailAccountId,
  message,
  logger,
  reason,
}: {
  emailAccountId: string;
  message: ParsedMessage;
  logger: Logger;
  reason: string;
}) {
  if (shouldExcludeFromEmailMessageStats(message)) {
    await deleteEmailMessageStats({
      emailAccountId,
      messageId: message.id,
      threadId: message.threadId,
      reason,
      logger,
    });
    return false;
  }

  await upsertEmailMessageStats({ emailAccountId, message, logger });
  return true;
}

export function shouldExcludeFromEmailMessageStats(message: ParsedMessage) {
  const labels = message.labelIds ?? [];
  return (
    labels.includes(GmailLabel.TRASH) ||
    labels.includes(GmailLabel.SPAM) ||
    labels.includes(GmailLabel.DRAFT)
  );
}

function toEmailMessageStatsRow({
  emailAccountId,
  message,
  logger,
}: {
  emailAccountId: string;
  message: ParsedMessage;
  logger: Logger;
}): EmailMessageStatsRow | undefined {
  const unsubscribeLink = mergeUnsubscribeSources({
    htmlUnsubscribeLink: findUnsubscribeLink(message.textHtml),
    listUnsubscribeHeader: message.headers["list-unsubscribe"],
  });

  const date = internalDateToDate(message.internalDate);
  if (!date) {
    logger.error("No date for email", {
      messageId: message.id,
      date: message.internalDate,
    });
    return;
  }

  return {
    threadId: message.threadId,
    messageId: message.id,
    from: extractEmailAddress(message.headers.from),
    fromName: extractNameFromEmail(message.headers.from),
    fromDomain: extractDomainFromEmail(message.headers.from),
    to: message.headers.to
      ? extractEmailAddress(message.headers.to)
      : "Missing",
    date,
    unsubscribeLink,
    read: !message.labelIds?.includes(GmailLabel.UNREAD),
    sent: !!message.labelIds?.includes(GmailLabel.SENT),
    draft: !!message.labelIds?.includes(GmailLabel.DRAFT),
    inbox: !!message.labelIds?.includes(GmailLabel.INBOX),
    emailAccountId,
  };
}

async function saveEmailMessages(emails: EmailMessageStatsRow[]) {
  if (emails.length === 0) return;

  const rows = emails.map(
    (email) => Prisma.sql`(
      ${randomUUID()}::text,
      ${email.emailAccountId}::text,
      ${email.threadId}::text,
      ${email.messageId}::text,
      ${email.date}::timestamp,
      ${email.from}::text,
      ${email.fromName}::text,
      ${email.fromDomain}::text,
      ${email.to}::text,
      ${email.unsubscribeLink}::text,
      ${email.read}::boolean,
      ${email.sent}::boolean,
      ${email.draft}::boolean,
      ${email.inbox}::boolean,
      NOW(),
      NOW()
    )`,
  );

  await prisma.$executeRaw`
    INSERT INTO "EmailMessage" (
      "id",
      "emailAccountId",
      "threadId",
      "messageId",
      "date",
      "from",
      "fromName",
      "fromDomain",
      "to",
      "unsubscribeLink",
      "read",
      "sent",
      "draft",
      "inbox",
      "createdAt",
      "updatedAt"
    )
    VALUES ${Prisma.join(rows)}
    ON CONFLICT ("emailAccountId", "threadId", "messageId") DO UPDATE SET
      "date" = EXCLUDED."date",
      "from" = EXCLUDED."from",
      "fromName" = EXCLUDED."fromName",
      "fromDomain" = EXCLUDED."fromDomain",
      "to" = EXCLUDED."to",
      "unsubscribeLink" = EXCLUDED."unsubscribeLink",
      "read" = EXCLUDED."read",
      "sent" = EXCLUDED."sent",
      "draft" = EXCLUDED."draft",
      "inbox" = EXCLUDED."inbox",
      "updatedAt" = NOW()
  `;
}

function mergeUnsubscribeSources({
  htmlUnsubscribeLink,
  listUnsubscribeHeader,
}: {
  htmlUnsubscribeLink?: string | null;
  listUnsubscribeHeader?: string | null;
}) {
  if (!listUnsubscribeHeader) return cleanUnsubscribeLink(htmlUnsubscribeLink);

  const normalizedHtmlLink = cleanUnsubscribeLink(htmlUnsubscribeLink);
  if (!normalizedHtmlLink) return listUnsubscribeHeader;

  const headerLinks = parseListUnsubscribeHeader(listUnsubscribeHeader);
  if (headerLinks.includes(normalizedHtmlLink)) return listUnsubscribeHeader;

  return `${listUnsubscribeHeader}, <${normalizedHtmlLink}>`;
}
