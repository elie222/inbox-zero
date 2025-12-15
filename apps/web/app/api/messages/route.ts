import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { messageQuerySchema } from "@/app/api/messages/validation";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { GmailLabel } from "@/utils/gmail/label";
import type { EmailProvider } from "@/utils/email/types";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { Logger } from "@/utils/logger";

export type MessagesResponse = Awaited<ReturnType<typeof getMessages>>;

export const GET = withEmailProvider("messages", async (request) => {
  const { emailProvider } = request;
  const { emailAccountId, email } = request.auth;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const pageToken = searchParams.get("pageToken");
  const r = messageQuerySchema.parse({ q: query, pageToken });

  const result = await getMessages({
    emailAccountId,
    query: r.q,
    pageToken: r.pageToken,
    emailProvider,
    email,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

async function getMessages({
  query,
  pageToken,
  emailAccountId,
  emailProvider,
  email,
  logger,
}: {
  query?: string | null;
  pageToken?: string | null;
  emailAccountId: string;
  emailProvider: EmailProvider;
  email: string;
  logger: Logger;
}) {
  try {
    const { messages, nextPageToken } =
      await emailProvider.getMessagesWithPagination({
        query: query?.trim(),
        maxResults: 20,
        pageToken: pageToken ?? undefined,
      });

    // Filter messages based on provider-specific logic
    const incomingMessages = messages.filter((message) => {
      const fromEmail = message.headers.from;
      const toEmail = message.headers.to;

      // Don't include messages from/to the assistant
      if (
        isAssistantEmail({
          userEmail: email,
          emailToCheck: fromEmail,
        }) ||
        isAssistantEmail({
          userEmail: email,
          emailToCheck: toEmail,
        })
      ) {
        return false;
      }

      // Provider-specific filtering
      if (isGoogleProvider(emailProvider.name)) {
        const isSent = message.labelIds?.includes(GmailLabel.SENT);
        const isDraft = message.labelIds?.includes(GmailLabel.DRAFT);
        const isInbox = message.labelIds?.includes(GmailLabel.INBOX);

        if (isDraft) return false;

        if (isSent) {
          // Only show sent message that are in the inbox
          return isInbox;
        }
      } else if (emailProvider.name === "microsoft") {
        // For Outlook, we already filter out drafts in the message fetching
        // No additional filtering needed here
      }

      // Return all other messages
      return true;
    });

    return { messages: incomingMessages, nextPageToken };
  } catch (error) {
    logger.error("Error getting messages", {
      emailAccountId,
      query,
      pageToken,
      error,
    });
    throw error;
  }
}
