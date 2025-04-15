import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { uniq } from "lodash";
import { getMessagesBatch } from "@/utils/gmail/message";

const messagesBatchQuery = z.object({
  ids: z
    .array(z.string())
    .max(100)
    .transform((arr) => uniq(arr)),
});
export type MessagesBatchQuery = z.infer<typeof messagesBatchQuery>;
export type MessagesBatchResponse = {
  messages: Awaited<ReturnType<typeof getMessagesBatch>>;
};

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  const query = messagesBatchQuery.parse({ ids: ids ? ids.split(",") : [] });

  const accessToken = await getGmailAccessToken(session);

  if (!accessToken.token)
    return NextResponse.json({ error: "Invalid access token" });

  const messages = await getMessagesBatch(query.ids, accessToken.token);

  return NextResponse.json({ messages });
});
