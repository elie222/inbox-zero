import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { queryBatchMessages } from "@/utils/gmail/message";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { messageQuerySchema } from "@/app/api/google/messages/validation";
import { createScopedLogger } from "@/utils/logger";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { GmailLabel } from "@/utils/gmail/label";

const logger = createScopedLogger("api/google/messages");

export type MessagesResponse = Awaited<ReturnType<typeof getMessages>>;

async function getMessages({
  query,
  pageToken,
}: {
  query?: string | null;
  pageToken?: string | null;
}) {
  const session = await auth();
  if (!session?.user.email) throw new SafeError("Not authenticated");

  try {
    const gmail = getGmailClient(session);

    const { messages, nextPageToken } = await queryBatchMessages(gmail, {
      query: query?.trim(),
      maxResults: 20,
      pageToken: pageToken ?? undefined,
    });

    const email = session.user.email;

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
            userEmail: email,
            emailToCheck: message.headers.from,
          }) ||
          isAssistantEmail({
            userEmail: email,
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
      email: session?.user.email,
      query,
      pageToken,
      error,
    });
    throw error;
  }
}

export const GET = withError(async (request) => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const pageToken = searchParams.get("pageToken");
  const r = messageQuerySchema.parse({ q: query, pageToken });
  const result = await getMessages({ query: r.q, pageToken: r.pageToken });
  return NextResponse.json(result);
});
