import { NextResponse } from "next/server";
import { z } from "zod";
import { type gmail_v1 } from "googleapis";
import orderBy from "lodash/orderBy";
import uniqBy from "lodash/uniqBy";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getMessages, getMessagesBatch } from "@/utils/gmail/message";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { isDefined } from "@/utils/types";

const largestEmailsQuery = z.object({});
export type LargestEmailsQuery = z.infer<typeof largestEmailsQuery>;
export type LargestEmailsResponse = Awaited<ReturnType<typeof getLargeEmails>>;

async function findEmailsLargerThan(
  query: string,
  gmail: gmail_v1.Gmail,
  accessToken: string,
  limit: number,
) {
  const twentyMbEmails = await getMessages(gmail, {
    query,
    maxResults: limit ?? undefined,
  });

  const messages = await getMessagesBatch(
    twentyMbEmails.messages?.map((m) => m.id).filter(isDefined) || [],
    accessToken,
  );

  return messages;
}

// TODO less copy/paste
async function getLargeEmails(gmail: gmail_v1.Gmail, accessToken: string) {
  const limit = 20;

  let messages = await findEmailsLargerThan(
    "larger:20M",
    gmail,
    accessToken,
    limit,
  );

  if (messages.length < limit) {
    const messages10 = await findEmailsLargerThan(
      "larger:10M",
      gmail,
      accessToken,
      limit - messages.length,
    );
    messages = uniqBy([...messages, ...messages10], (m) => m.id);
  }

  if (messages.length < limit) {
    const messages5 = await findEmailsLargerThan(
      "larger:5M",
      gmail,
      accessToken,
      limit - messages.length,
    );
    messages = uniqBy([...messages, ...messages5], (m) => m.id);
  }

  if (messages.length < limit) {
    const messages1 = await findEmailsLargerThan(
      "larger:1M",
      gmail,
      accessToken,
      limit - messages.length,
    );
    messages = uniqBy([...messages, ...messages1], (m) => m.id);
  }

  return {
    largestEmails: orderBy(messages, (m) => -(m.sizeEstimate || 0)),
  };
}

export const GET = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);

  if (!token.token) return NextResponse.json({ error: "Missing access token" });

  const result = await getLargeEmails(gmail, token.token);

  return NextResponse.json(result);
});
