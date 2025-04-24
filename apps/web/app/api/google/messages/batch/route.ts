import { z } from "zod";
import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { uniq } from "lodash";
import { getMessagesBatch } from "@/utils/gmail/message";
import { parseReply } from "@/utils/mail";
import { getTokens } from "@/utils/account";

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

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;
  const tokens = await getTokens({ email });
  const accessToken = await getGmailAccessToken(tokens);

  if (!accessToken.token)
    return NextResponse.json({ error: "Invalid access token" });

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  const parseReplies = searchParams.get("parseReplies");
  const query = messagesBatchQuery.parse({
    ids: ids ? ids.split(",") : [],
    parseReplies: parseReplies === "true",
  });

  const messages = await getMessagesBatch(query.ids, accessToken.token);

  const result = query.parseReplies
    ? messages.map((message) => ({
        ...message,
        textPlain: parseReply(message.textPlain || ""),
        textHtml: parseReply(message.textHtml || ""),
      }))
    : messages;

  return NextResponse.json({ messages: result });
});
