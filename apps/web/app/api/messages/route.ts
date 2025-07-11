import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { messageQuerySchema } from "@/app/api/messages/validation";
import { createScopedLogger } from "@/utils/logger";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { GmailLabel } from "@/utils/gmail/label";
import { EmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("api/messages");

export type MessagesResponse = Awaited<ReturnType<typeof getMessages>>;

async function getMessages({
  query,
  pageToken,
  emailAccountId,
  userEmail,
  emailProvider,
}: {
  query?: string | null;
  pageToken?: string | null;
  emailAccountId: string;
  userEmail: string;
  emailProvider: EmailProvider;
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
          userEmail,
          emailToCheck: fromEmail,
        }) ||
        isAssistantEmail({
          userEmail,
          emailToCheck: toEmail,
        })
      ) {
        return false;
      }

      // Provider-specific filtering
      if (emailProvider.name === "google") {
        const isSent = message.labelIds?.includes(GmailLabel.SENT);
        const isDraft = message.labelIds?.includes(GmailLabel.DRAFT);
        const isInbox = message.labelIds?.includes(GmailLabel.INBOX);

        if (isDraft) return false;

        if (isSent) {
          // Only show sent message that are in the inbox
          return isInbox;
        }
      } else if (emailProvider.name === "microsoft-entra-id") {
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

export const GET = withEmailProvider(async (request) => {
  const { emailProvider } = request;
  const { emailAccountId, email: userEmail } = request.auth;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const pageToken = searchParams.get("pageToken");
  const r = messageQuerySchema.parse({ q: query, pageToken });
  const result = await getMessages({
    emailAccountId,
    query: r.q,
    pageToken: r.pageToken,
    userEmail,
    emailProvider,
  });
  return NextResponse.json(result);
});
