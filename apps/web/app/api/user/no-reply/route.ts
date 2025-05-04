import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { type MessageWithPayload, isDefined } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import { withEmailAccount } from "@/utils/middleware";
import { getThread } from "@/utils/gmail/thread";
import { getMessages } from "@/utils/gmail/message";
import { getGmailClientForEmail } from "@/utils/account";

export type NoReplyResponse = Awaited<ReturnType<typeof getNoReply>>;

async function getNoReply({
  emailAccountId,
  gmail,
  userEmail,
}: {
  emailAccountId: string;
  gmail: gmail_v1.Gmail;
  userEmail: string;
}) {
  const sentEmails = await getMessages(gmail, {
    query: "in:sent",
    maxResults: 50,
  });

  const sentEmailsWithThreads = (
    await Promise.all(
      sentEmails.messages?.map(async (message) => {
        const thread = await getThread(message.threadId || "", gmail);

        const lastMessage = thread.messages?.[thread.messages?.length - 1];
        const lastMessageFrom = lastMessage?.payload?.headers?.find(
          (header) => header.name?.toLowerCase() === "from",
        )?.value;
        const isSentByUser = lastMessageFrom?.includes(userEmail);

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

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const userEmail = request.auth.email;

  const gmail = await getGmailClientForEmail({ emailAccountId });
  const result = await getNoReply({ emailAccountId, gmail, userEmail });

  return NextResponse.json(result);
});
