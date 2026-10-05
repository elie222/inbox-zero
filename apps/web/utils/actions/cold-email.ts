"use server";

import chunk from "lodash/chunk";
import prisma from "@/utils/prisma";
import { GroupItemSource } from "@/generated/prisma/enums";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import {
  coldEmailBlockerBody,
  markNotColdEmailBody,
} from "@/utils/actions/cold-email.validation";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import { getColdEmailRule } from "@/utils/cold-email/cold-email-rule";
import { internalDateToDate } from "@/utils/date";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { emailToContentForAI } from "@/utils/ai/content-sanitizer";

export const markNotColdEmailAction = actionClient
  .metadata({ name: "markNotColdEmail" })
  .inputSchema(markNotColdEmailBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { sender },
    }) => {
      const [emailProvider, coldEmailRule] = await Promise.all([
        createEmailProvider({
          emailAccountId,
          provider,
          logger,
        }),
        getColdEmailRule(emailAccountId),
      ]);

      if (!coldEmailRule) {
        throw new SafeError("Cold email rule not found");
      }

      await Promise.all([
        // Mark as excluded so AI doesn't match it again
        saveLearnedPattern({
          emailAccountId,
          from: sender,
          ruleId: coldEmailRule.id,
          exclude: true,
          logger,
          source: GroupItemSource.USER,
        }),
        removeColdEmailLabelFromSender(emailProvider, sender, coldEmailRule),
      ]);
    },
  );

// Each thread costs a fetch plus a label update, so very large senders are
// capped to keep the action responsive.
const MAX_THREADS_TO_UNLABEL = 500;
const THREAD_PAGE_SIZE = 100;
const UNLABEL_CONCURRENCY = 10;

async function removeColdEmailLabelFromSender(
  emailProvider: EmailProvider,
  sender: string,
  coldEmailRule: { actions: { labelId: string | null }[] },
) {
  const labelIds = [
    ...new Set(
      coldEmailRule.actions
        .map((action) => action.labelId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (labelIds.length === 0) return;

  // Collect ids before mutating so removing labels can't shift later pages.
  // Filtering by label covers archived mail, not just the inbox.
  const threadIds = new Set<string>();
  for (const labelId of labelIds) {
    let pageToken: string | undefined;
    do {
      const page = await emailProvider.getThreadsWithQuery({
        query: { fromEmail: sender, labelId },
        maxResults: THREAD_PAGE_SIZE,
        pageToken,
        messageFormat: "metadata",
      });
      for (const thread of page.threads) {
        if (threadIds.size >= MAX_THREADS_TO_UNLABEL) break;
        threadIds.add(thread.id);
      }
      pageToken = page.nextPageToken;
    } while (pageToken && threadIds.size < MAX_THREADS_TO_UNLABEL);
  }

  for (const batch of chunk([...threadIds], UNLABEL_CONCURRENCY)) {
    await Promise.all(
      batch.map((threadId) =>
        emailProvider.removeThreadLabels(threadId, labelIds),
      ),
    );
  }
}

export const testColdEmailAction = actionClient
  .metadata({ name: "testColdEmail" })
  .inputSchema(coldEmailBlockerBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: {
        from,
        subject,
        textHtml,
        textPlain,
        snippet,
        threadId,
        messageId,
        date,
      },
    }) => {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        include: {
          user: { select: { aiProvider: true, aiModel: true, aiApiKey: true } },
          account: { select: { provider: true } },
        },
      });

      if (!emailAccount) throw new SafeError("Email account not found");

      const coldEmailRule = await getColdEmailRule(emailAccountId);

      if (!coldEmailRule) throw new SafeError("Cold email rule not found");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const content = emailToContentForAI({
        textHtml: textHtml || undefined,
        textPlain: textPlain || undefined,
        snippet: snippet || "",
      });

      const response = await isColdEmail({
        email: {
          from,
          to: "",
          subject,
          content,
          date: date ? internalDateToDate(String(date)) : undefined,
          threadId: threadId || undefined,
          id: messageId || "",
        },
        emailAccount,
        provider: emailProvider,
        modelType: "chat",
        coldEmailRule,
        logger,
      });

      return response;
    },
  );
