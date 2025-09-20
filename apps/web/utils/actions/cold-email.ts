"use server";

import prisma from "@/utils/prisma";
import { ColdEmailStatus } from "@prisma/client";
import { emailToContent } from "@/utils/mail";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import {
  coldEmailBlockerBody,
  markNotColdEmailBody,
  updateColdEmailPromptBody,
  updateColdEmailSettingsBody,
} from "@/utils/actions/cold-email.validation";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";

export const updateColdEmailSettingsAction = actionClient
  .metadata({ name: "updateColdEmailSettings" })
  .schema(updateColdEmailSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { coldEmailBlocker, coldEmailDigest },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          coldEmailBlocker,
          coldEmailDigest: coldEmailDigest ?? undefined,
        },
      });
    },
  );

export const updateColdEmailPromptAction = actionClient
  .metadata({ name: "updateColdEmailPrompt" })
  .schema(updateColdEmailPromptBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { coldEmailPrompt } }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { coldEmailPrompt },
      });
    },
  );

export const markNotColdEmailAction = actionClient
  .metadata({ name: "markNotColdEmail" })
  .schema(markNotColdEmailBody)
  .action(
    async ({ ctx: { emailAccountId, provider }, parsedInput: { sender } }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
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
        removeColdEmailLabelFromSender(emailProvider, sender),
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
  emailProvider: EmailProvider,
  sender: string,
) {
  // 1. find cold email label
  // 2. find emails from sender
  // 3. remove cold email label from emails

  const label = await emailProvider.getOrCreateInboxZeroLabel("cold_email");
  if (!label?.id) return;

  const threads = await getThreadsFromSender(emailProvider, sender, label.id);

  for (const thread of threads) {
    if (!thread.id) continue;
    await emailProvider.removeThreadLabel(thread.id, label.id);
  }
}

export const testColdEmailAction = actionClient
  .metadata({ name: "testColdEmail" })
  .schema(coldEmailBlockerBody)
  .action(
    async ({
      ctx: { emailAccountId, provider },
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

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
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
      });

      return response;
    },
  );
