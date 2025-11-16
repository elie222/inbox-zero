"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { isDefined } from "@/utils/types";
import {
  extractDomainFromEmail,
  extractEmailAddress,
  extractNameFromEmail,
} from "@/utils/email";
import { findUnsubscribeLink } from "@/utils/parse/parseHtml.server";
import { internalDateToDate } from "@/utils/date";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";

const PAGE_SIZE = 20; // avoid setting too high because it will hit the rate limit
// const PAUSE_AFTER_RATE_LIMIT = 10_000;
const MAX_PAGES = 50;

export const loadEmailStatsAction = actionClient
  .metadata({ name: "loadEmailStats" })
  .inputSchema(z.object({ loadBefore: z.boolean() }))
  .action(
    async ({
      parsedInput: { loadBefore },
      ctx: { emailAccountId, logger },
    }) => {
      // Get email account with provider information
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          account: {
            select: { provider: true },
          },
        },
      });

      if (!emailAccount?.account?.provider) {
        throw new SafeError("Email account or provider not found");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider: emailAccount.account.provider,
        logger,
      });

      await loadEmails(
        {
          emailAccountId,
          emailProvider,
          logger,
        },
        {
          loadBefore,
        },
      );
    },
  );

async function loadEmails(
  {
    emailAccountId,
    emailProvider,
    logger,
  }: {
    emailAccountId: string;
    emailProvider: EmailProvider;
    logger: Logger;
  },
  { loadBefore }: { loadBefore: boolean },
) {
  let pages = 0;

  const newestEmailSaved = await prisma.emailMessage.findFirst({
    where: { emailAccountId },
    orderBy: { date: "desc" },
  });

  const after = newestEmailSaved?.date;
  logger.info("Loading emails after", { after });

  // First pagination loop - load emails after the newest saved email
  let nextPageToken: string | undefined;
  while (pages < MAX_PAGES) {
    logger.info("After Page", { pages, nextPageToken });
    const res = await saveBatch({
      emailAccountId,
      emailProvider,
      logger,
      nextPageToken,
      after,
      before: undefined,
    });

    nextPageToken = res.data.nextPageToken ?? undefined;

    if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;

    pages++;

    if (!nextPageToken) break;
  }

  logger.info("Completed emails after", { after, pages });

  if (!loadBefore || !newestEmailSaved) return { pages };

  const oldestEmailSaved = await prisma.emailMessage.findFirst({
    where: { emailAccountId },
    orderBy: { date: "asc" },
  });

  const before = oldestEmailSaved?.date;
  logger.info("Loading emails before", { before });

  // shouldn't happen, but prevents TS errors
  if (!before) return { pages };

  // Second pagination loop - load emails before the oldest saved email
  // Reset nextPageToken for this new pagination sequence
  nextPageToken = undefined;
  while (pages < MAX_PAGES) {
    logger.info("Before Page", { pages, nextPageToken });
    const res = await saveBatch({
      emailAccountId,
      emailProvider,
      logger,
      nextPageToken,
      before,
      after: undefined,
    });

    nextPageToken = res.data.nextPageToken ?? undefined;

    if (!res.data.messages || res.data.messages.length < PAGE_SIZE) break;

    pages++;

    if (!nextPageToken) break;
  }

  logger.info("Completed emails before", { before, pages });

  return { pages };
}

async function saveBatch({
  emailAccountId,
  emailProvider,
  logger,
  nextPageToken,
  before,
  after,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
  nextPageToken?: string;
} & (
  | { before: Date; after: undefined }
  | { before: undefined; after: Date }
  | { before: undefined; after: undefined }
)) {
  const res = await emailProvider.getMessagesWithPagination({
    maxResults: PAGE_SIZE,
    pageToken: nextPageToken,
    before,
    after,
  });

  const messages = await emailProvider.getMessagesBatch(
    res.messages?.map((m) => m.id).filter(isDefined) || [],
  );

  const emailsToSave = messages
    .map((m) => {
      const unsubscribeLink =
        findUnsubscribeLink(m.textHtml) || m.headers["list-unsubscribe"];

      const date = internalDateToDate(m.internalDate);
      if (!date) {
        logger.error("No date for email", {
          messageId: m.id,
          date: m.internalDate,
        });
        return;
      }

      return {
        threadId: m.threadId,
        messageId: m.id,
        from: extractEmailAddress(m.headers.from),
        fromName: extractNameFromEmail(m.headers.from),
        fromDomain: extractDomainFromEmail(m.headers.from),
        to: m.headers.to ? extractEmailAddress(m.headers.to) : "Missing",
        date,
        unsubscribeLink,
        read: !m.labelIds?.includes("UNREAD"),
        sent: !!m.labelIds?.includes("SENT"),
        draft: !!m.labelIds?.includes("DRAFT"),
        inbox: !!m.labelIds?.includes("INBOX"),
        emailAccountId,
      };
    })
    .filter(isDefined);

  logger.info("Saving", { count: emailsToSave.length });

  await prisma.emailMessage.createMany({
    data: emailsToSave,
    skipDuplicates: true, // Skip if email already exists (based on unique constraint)
  });

  return {
    data: {
      messages: res.messages,
      nextPageToken: res.nextPageToken,
    },
  };
}
