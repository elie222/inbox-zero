"use server";

import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { ColdEmailStatus } from "@prisma/client";
import { getLabel, labelThread } from "@/utils/gmail/label";
import { GmailLabel } from "@/utils/gmail/label";
import { getThreads } from "@/utils/gmail/thread";
import { inboxZeroLabels } from "@/utils/label";
import { emailToContent } from "@/utils/mail";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import {
  coldEmailBlockerBody,
  markNotColdEmailBody,
  updateColdEmailPromptBody,
  updateColdEmailSettingsBody,
} from "@/utils/actions/cold-email.validation";
import { actionClient } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";

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
  .action(async ({ ctx: { emailAccountId }, parsedInput: { sender } }) => {
    const gmail = await getGmailClientForEmail({ emailAccountId });

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
      removeColdEmailLabelFromSender(gmail, sender),
    ]);
  });

async function removeColdEmailLabelFromSender(
  gmail: gmail_v1.Gmail,
  sender: string,
) {
  // 1. find cold email label
  // 2. find emails from sender
  // 3. remove cold email label from emails

  const label = await getLabel({
    gmail,
    name: inboxZeroLabels.cold_email.name,
  });
  if (!label?.id) return;

  const threads = await getThreads(`from:${sender}`, [label.id], gmail);

  for (const thread of threads.threads || []) {
    if (!thread.id) continue;
    await labelThread({
      gmail,
      threadId: thread.id,
      addLabelIds: [GmailLabel.INBOX],
      removeLabelIds: [label.id],
    });
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
