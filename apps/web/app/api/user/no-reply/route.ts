import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { getGmailClient } from "@/utils/gmail/client";
import { type MessageWithPayload, isDefined } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import { withAuth } from "@/utils/middleware";
import { getThread } from "@/utils/gmail/thread";
import { getMessages } from "@/utils/gmail/message";
import { getTokens } from "@/utils/account";

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

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;
  const tokens = await getTokens({ email });
  const gmail = getGmailClient(tokens);
  const result = await getNoReply({ email, gmail });

  return NextResponse.json(result);
});
