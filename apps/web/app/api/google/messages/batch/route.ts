import { z } from "zod";
import { NextResponse } from "next/server";
import uniq from "lodash/uniq";
import { withEmailAccount } from "@/utils/middleware";
import { getMessagesBatch } from "@/utils/gmail/message";
import { parseReply } from "@/utils/mail";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";

const messagesBatchQuery = z.object({
  ids: z
    .array(z.string())
    .max(100)
    .transform((arr) => uniq(arr)),
  parseReplies: z.coerce.boolean().optional(),
});
export type MessagesBatchQuery = z.infer<typeof messagesBatchQuery>;
export type MessagesBatchResponse = {
  messages: Awaited<ReturnType<typeof getMessagesBatch>>;
};

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { accessToken } = await getGmailAndAccessTokenForEmail({
    emailAccountId,
  });

  if (!accessToken) return NextResponse.json({ error: "Invalid access token" });

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  const parseReplies = searchParams.get("parseReplies");
  const query = messagesBatchQuery.parse({
    ids: ids ? ids.split(",") : [],
    parseReplies: parseReplies === "true",
  });

  const messages = await getMessagesBatch({
    messageIds: query.ids,
    accessToken,
  });

  const result = query.parseReplies
    ? messages.map((message) => ({
        ...message,
        textPlain: parseReply(message.textPlain || ""),
        textHtml: parseReply(message.textHtml || ""),
      }))
    : messages;

  return NextResponse.json({ messages: result });
});
