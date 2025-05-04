import { NextResponse } from "next/server";
import { queryBatchMessages } from "@/utils/gmail/message";
import { withEmailAccount } from "@/utils/middleware";
import { messageQuerySchema } from "@/app/api/google/messages/validation";
import { createScopedLogger } from "@/utils/logger";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { GmailLabel } from "@/utils/gmail/label";
import { getGmailClientForEmail } from "@/utils/account";

const logger = createScopedLogger("api/google/messages");

export type MessagesResponse = Awaited<ReturnType<typeof getMessages>>;

async function getMessages({
  query,
  pageToken,
  emailAccountId,
  userEmail,
}: {
  query?: string | null;
  pageToken?: string | null;
  emailAccountId: string;
  userEmail: string;
}) {
  try {
    const gmail = await getGmailClientForEmail({ emailAccountId });

    const { messages, nextPageToken } = await queryBatchMessages(gmail, {
      query: query?.trim(),
      maxResults: 20,
      pageToken: pageToken ?? undefined,
    });

    // filter out SENT messages from the user
    // NOTE: -from:me doesn't work because it filters out messages from threads where the user responded
    const incomingMessages = messages.filter((message) => {
      const isSent = message.labelIds?.includes(GmailLabel.SENT);
      const isDraft = message.labelIds?.includes(GmailLabel.DRAFT);
      const isInbox = message.labelIds?.includes(GmailLabel.INBOX);

      if (isDraft) return false;

      if (isSent) {
        // Don't include messages from/to the assistant
        if (
          isAssistantEmail({
            userEmail,
            emailToCheck: message.headers.from,
          }) ||
          isAssistantEmail({
            userEmail,
            emailToCheck: message.headers.to,
          })
        ) {
          return false;
        }

        // Only show sent message that are in the inbox
        return isInbox;
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

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const userEmail = request.auth.email;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const pageToken = searchParams.get("pageToken");
  const r = messageQuerySchema.parse({ q: query, pageToken });
  const result = await getMessages({
    emailAccountId,
    query: r.q,
    pageToken: r.pageToken,
    userEmail,
  });
  return NextResponse.json(result);
});
