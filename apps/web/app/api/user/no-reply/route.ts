import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { gmail_v1 } from "googleapis";
import { getGmailClient } from "@/utils/gmail/client";
import { MessageWithPayload, isDefined } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import { withError } from "@/utils/middleware";

export type NoReplyResponse = Awaited<ReturnType<typeof getNoReply>>;

async function getNoReply(options: { email: string; gmail: gmail_v1.Gmail }) {
  const sentEmails = await options.gmail.users.messages.list({
    userId: "me",
    q: `in:sent`,
    maxResults: 50,
  });

  const sentEmailsWithThreads = (
    await Promise.all(
      sentEmails.data.messages?.map(async (message) => {
        const thread = (
          await options.gmail.users.threads.get({
            userId: "me",
            id: message.threadId!,
          })
        ).data;

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
                return {
                  ...message,
                  parsedMessage: parseMessage(message as MessageWithPayload),
                };
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
