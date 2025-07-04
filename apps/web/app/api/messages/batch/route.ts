import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { messagesBatchQuery } from "@/app/api/messages/validation";
import { parseReply } from "@/utils/mail";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";

export type MessagesBatchResponse = {
  messages: Awaited<ReturnType<typeof getMessagesBatch>>;
};

async function getMessagesBatch({
  messageIds,
  emailAccountId,
  parseReplies,
}: {
  messageIds: string[];
  emailAccountId: string;
  parseReplies?: boolean;
}) {
  // Get the email account to determine the provider
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: { provider: true },
      },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
  });

  const messages = await emailProvider.getMessagesBatch(messageIds);

  if (parseReplies) {
    return messages.map((message) => ({
      ...message,
      textPlain: parseReply(message.textPlain || ""),
      textHtml: parseReply(message.textHtml || ""),
    }));
  }

  return messages;
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  const parseReplies = searchParams.get("parseReplies");
  const query = messagesBatchQuery.parse({
    ids: ids ? ids.split(",") : [],
    parseReplies: parseReplies === "true",
  });

  const messages = await getMessagesBatch({
    messageIds: query.ids,
    emailAccountId,
    parseReplies: query.parseReplies,
  });

  return NextResponse.json({ messages });
});
