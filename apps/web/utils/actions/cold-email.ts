"use server";

import prisma from "@/utils/prisma";
import { ColdEmailStatus } from "@prisma/client";
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
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@prisma/client";

export const markNotColdEmailAction = actionClient
  .metadata({ name: "markNotColdEmail" })
  .inputSchema(markNotColdEmailBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { sender },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      await Promise.all([
        prisma.coldEmail.update({
          where: {
            emailAccountId_fromEmail: {
              emailAccountId,
              fromEmail: sender,
            },
          },
          data: {
            status: ColdEmailStatus.USER_REJECTED_COLD,
          },
        }),
        removeColdEmailLabelFromSender(emailAccountId, emailProvider, sender),
      ]);
    },
  );

/**
 * Helper function to get threads from a specific sender using the email provider
 */
async function getThreadsFromSender(
  emailProvider: EmailProvider,
  sender: string,
  labelId?: string,
): Promise<{ id: string }[]> {
  const { threads } = await emailProvider.getThreadsWithQuery({
    query: {
      fromEmail: sender,
      labelId,
    },
    maxResults: 100,
  });

  return threads.map((thread) => ({ id: thread.id }));
}

async function removeColdEmailLabelFromSender(
  emailAccountId: string,
  emailProvider: EmailProvider,
  sender: string,
) {
  // 1. find cold email label
  // 2. find emails from sender
  // 3. remove cold email label from emails

  const coldEmailRule = await getColdEmailRule(emailAccountId);
  if (!coldEmailRule) return;

  const labels = await emailProvider.getLabels();

  // NOTE: this doesn't work completely if the user set 2 labels:
  const label =
    labels.find((label) => label.id === coldEmailRule.actions?.[0]?.labelId) ||
    labels.find((label) => label.name === getRuleLabel(SystemType.COLD_EMAIL));

  if (!label?.id) return;

  const threads = await getThreadsFromSender(emailProvider, sender, label.id);

  for (const thread of threads) {
    if (!thread.id) continue;
    await emailProvider.removeThreadLabel(thread.id, label.id);
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
          date: date ? new Date(date) : undefined,
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
