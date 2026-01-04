"use server";

import prisma from "@/utils/prisma";
import { GroupItemSource } from "@/generated/prisma/enums";
import { emailToContent } from "@/utils/mail";
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

async function removeColdEmailLabelFromSender(
  emailProvider: EmailProvider,
  sender: string,
  coldEmailRule: { actions: { labelId: string | null }[] },
) {
  const labelIds = coldEmailRule.actions
    .map((action) => action.labelId)
    .filter((id): id is string => Boolean(id));

  if (labelIds.length === 0) return;

  const { threads } = await emailProvider.getThreadsWithQuery({
    query: { fromEmail: sender },
    maxResults: 100,
  });

  for (const thread of threads) {
    await emailProvider.removeThreadLabels(thread.id, labelIds);
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

      const content = emailToContent({
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
      });

      return response;
    },
  );
