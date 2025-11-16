import { NextResponse } from "next/server";
import { isDefined } from "@/utils/types";
import { withEmailProvider } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

export type NoReplyResponse = Awaited<ReturnType<typeof getNoReply>>;

async function getNoReply({
  emailAccountId,
  userEmail,
  provider,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  provider: string;
  logger: Logger;
}) {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  const sentEmails = await emailProvider.getSentMessages(50);

  const sentEmailsWithThreads = (
    await Promise.all(
      sentEmails.map(async (message) => {
        const thread = await emailProvider.getThread(message.threadId || "");

        const lastMessage = thread.messages?.[thread.messages?.length - 1];
        const lastMessageFrom = lastMessage?.headers?.from;
        const isSentByUser = lastMessageFrom?.includes(userEmail);

        if (isSentByUser)
          return {
            ...message,
            thread: {
              ...thread,
              messages: thread.messages,
            },
          };
      }) || [],
    )
  ).filter(isDefined);

  return sentEmailsWithThreads;
}

export const GET = withEmailProvider("user/no-reply", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const userEmail = request.auth.email;

  const result = await getNoReply({
    emailAccountId,
    userEmail,
    provider: request.emailProvider.name,
    logger: request.logger,
  });

  return NextResponse.json(result);
});
