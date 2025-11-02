"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getOutlookClientWithRefresh } from "@/utils/outlook/client";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getMessages as getGmailMessages } from "@/utils/gmail/message";
import { getMessages as getOutlookMessages } from "@/utils/outlook/message";
import { PREVIEW_RUN_COUNT } from "@/app/(app)/[emailAccountId]/clean/consts";
import { subDays } from "date-fns";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("action/clean-preview");

const getPreviewEmailsBody = z.object({
  daysOld: z.number(),
});

export const getPreviewEmailsAction = actionClient
  .metadata({ name: "getPreviewEmails" })
  .schema(getPreviewEmailsBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { daysOld } }) => {
    // Fetch full email account with tokens
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      include: {
        tokens: true,
        account: {
          select: {
            provider: true,
          },
        },
      },
    });

    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    if (!emailAccount.tokens) {
      throw new Error("No account tokens found");
    }

    const isGmail = isGoogleProvider(emailAccount.account.provider);
    const after = Math.floor(subDays(new Date(), daysOld).getTime() / 1000);

    try {
      if (isGmail) {
        const gmail = await getGmailClientWithRefresh({
          accessToken: emailAccount.tokens.access_token,
          refreshToken: emailAccount.tokens.refresh_token,
          expiresAt: emailAccount.tokens.expires_at,
          emailAccountId: emailAccount.id,
        });

        const messages = await getGmailMessages(gmail, {
          query: `in:inbox after:${after}`,
          maxResults: PREVIEW_RUN_COUNT,
        });

        return messages.messages.map((message) => ({
          id: message.id || "",
          threadId: message.threadId || "",
          snippet: message.snippet || "",
          from: message.parsedMessage.headers.from || "",
          subject: message.parsedMessage.headers.subject || "",
          date: message.parsedMessage.headers.date || "",
        }));
      } else {
        const outlook = await getOutlookClientWithRefresh({
          accessToken: emailAccount.tokens.access_token,
          refreshToken: emailAccount.tokens.refresh_token,
          expiresAt: emailAccount.tokens.expires_at || null,
          emailAccountId: emailAccount.id,
        });

        const messages = await getOutlookMessages(outlook, {
          query: "",
          maxResults: PREVIEW_RUN_COUNT,
          after: subDays(new Date(), daysOld),
        });

        return messages.messages.map((message) => ({
          id: message.id || "",
          threadId: message.threadId || "",
          snippet: message.snippet || "",
          from: message.headers.from || "",
          subject: message.headers.subject || "",
          date: message.headers.date || "",
        }));
      }
    } catch (error) {
      logger.error("Failed to fetch preview emails", {
        error: error instanceof Error ? error.message : String(error),
        provider: emailAccount.account.provider,
      });
      throw error;
    }
  });
