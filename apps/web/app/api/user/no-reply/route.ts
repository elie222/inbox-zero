import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { type MessageWithPayload, isDefined } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import { withError } from "@/utils/middleware";
import { getThread } from "@/utils/gmail/thread";
import { getMessages } from "@/utils/gmail/message";

export type NoReplyResponse = Awaited<ReturnType<typeof getNoReply>>;

async function getNoReply(options: { email: string; gmail: gmail_v1.Gmail }) {
  const sentEmails = await getMessages(options.gmail, {
    query: "in:sent",
    maxResults: 50,
  });

  const sentEmailsWithThreads = (
    await Promise.all(
      sentEmails.messages?.map(async (message) => {
        const thread = await getThread(message.threadId || "", options.gmail);

        const lastMessage = thread.messages?.[thread.messages?.length - 1];
        const lastMessageFrom = lastMessage?.payload?.headers?.find(
          (header) => header.name?.toLowerCase() === "from",
        )?.value;
        const isSentByUser = lastMessageFrom?.includes(options.email);

        if (isSentByUser)
          return {
            ...message,
            thread: {
              ...thread,
              messages: thread.messages?.map((message) => {
                // TODO need to fetch full message with `getMessage()` here?
                return parseMessage(message as MessageWithPayload);
              }),
            },
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
  const result = await getNoReply({ email: session.user.email, gmail });

  return NextResponse.json(result);
});
