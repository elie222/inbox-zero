import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { messagesBatchQuery } from "@/app/api/messages/validation";
import { parseReply } from "@/utils/mail";
import type { EmailProvider } from "@/utils/email/types";

export type MessagesBatchResponse = {
  messages: Awaited<ReturnType<typeof getMessagesBatch>>;
};

async function getMessagesBatch({
  messageIds,
  emailProvider,
  parseReplies,
}: {
  messageIds: string[];
  emailProvider: EmailProvider;
  parseReplies?: boolean;
}) {
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

export const GET = withEmailProvider(async (request) => {
  const { emailProvider } = request;

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  const parseReplies = searchParams.get("parseReplies");
  const query = messagesBatchQuery.parse({
    ids: ids ? ids.split(",") : [],
    parseReplies: parseReplies === "true",
  });

  const messages = await getMessagesBatch({
    messageIds: query.ids,
    emailProvider,
    parseReplies: query.parseReplies,
  });

  return NextResponse.json({ messages });
});
