import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { type MessageWithPayload, isDefined } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import { withError } from "@/utils/middleware";
import { getMessages } from "@/utils/gmail/message";
import { getThread } from "@/utils/gmail/thread";

export type NoReplyResponse = Awaited<ReturnType<typeof getNoReply>>;

async function getNoReply({
  userEmail,
  gmail,
}: {
  userEmail: string;
  gmail: gmail_v1.Gmail;
}) {
  const sentEmails = await getMessages(gmail, {
    query: "in:sent",
    maxResults: 50,
  });

  const processedThreadIds = new Set<string>();

  const sentEmailsWithThreads = (
    await Promise.all(
      sentEmails.messages?.map(async (message) => {
        const threadId = message.threadId;
        if (!threadId || processedThreadIds.has(threadId)) return;

        processedThreadIds.add(threadId);

        const thread = await getThread(threadId, gmail);

        const lastMessage = thread.messages?.[thread.messages?.length - 1];
        const lastMessageFrom = lastMessage?.payload?.headers?.find(
          (header) => header.name?.toLowerCase() === "from",
        )?.value;
        const isSentByUser = lastMessageFrom?.includes(userEmail);

        if (isSentByUser)
          return {
            id: threadId,
            snippet: thread.snippet || "",
            messages:
              thread.messages?.map((message) => {
                return parseMessage(message as MessageWithPayload);
              }) || [],
            plan: undefined,
            category: null,
          };
      }) || [],
    )
  ).filter(isDefined);

  return sentEmailsWithThreads;
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const result = await getNoReply({
    userEmail: session.user.email,
    gmail,
  });

  return NextResponse.json(result);
});
