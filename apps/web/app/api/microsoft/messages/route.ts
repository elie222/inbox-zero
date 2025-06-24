import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { messageQuerySchema } from "@/app/api/microsoft/messages/validation";
import { createScopedLogger } from "@/utils/logger";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { getOutlookClientForEmail } from "@/utils/account";
import { queryBatchMessages } from "@/utils/outlook/message";

const logger = createScopedLogger("api/microsoft/messages");

// Outlook equivalent of Gmail labels
const OutlookLabel = {
  DRAFT: "draft",
  SENT: "sent",
  INBOX: "inbox",
} as const;

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
    const outlook = await getOutlookClientForEmail({ emailAccountId });

    logger.info("Fetching messages", {
      emailAccountId,
      query,
      pageToken,
    });

    const { messages, nextPageToken } = await queryBatchMessages(outlook, {
      query: query?.trim(),
      maxResults: 20,
      pageToken: pageToken ?? undefined,
    });

    logger.info("Received messages from Outlook", {
      emailAccountId,
      messageCount: messages.length,
      hasNextPageToken: !!nextPageToken,
      nextPageToken,
    });

    // Filter out draft messages and messages from/to the assistant
    const incomingMessages = messages.filter((message) => {
      const isDraft = message.labelIds?.includes(OutlookLabel.DRAFT);
      const fromEmail = message.headers.from;
      const toEmail = message.headers.to;

      if (isDraft) return false;

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

      return true;
    });

    logger.info("Filtered messages", {
      emailAccountId,
      originalCount: messages.length,
      filteredCount: incomingMessages.length,
      hasNextPageToken: !!nextPageToken,
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
