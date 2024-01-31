import { NextResponse } from "next/server";
import { type gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { ColdEmailStatus } from "@prisma/client";
import { getThreadsBatch, getThreadsFromSenders } from "@/utils/gmail/thread";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { parseMessages } from "@/utils/mail";
import { ThreadWithPayloadMessages } from "@/utils/types";
import { decodeSnippet } from "@/utils/gmail/decode";

export type ColdEmailsResponse = Awaited<ReturnType<typeof getColdEmails>>;

async function getColdEmails(
  options: { userId: string },
  gmail: gmail_v1.Gmail,
  accessToken: string,
) {
  const result = await prisma.newsletter.findMany({
    where: {
      userId: options.userId,
      coldEmail: ColdEmailStatus.COLD_EMAIL,
    },
    select: {
      id: true,
      email: true,
      status: true,
      createdAt: true,
    },
  });

  const gmailThreads = await getThreadsFromSenders(
    gmail,
    result.map((item) => item.email),
  );

  const threads = await getThreadsBatch(
    gmailThreads?.map((thread) => thread.id!) || [],
    accessToken,
  );

  const threadsWithMessages = await Promise.all(
    threads.map(async (thread) => {
      const id = thread.id!;
      const messages = parseMessages(thread as ThreadWithPayloadMessages);

      return {
        id,
        historyId: thread.historyId,
        messages,
        snippet: decodeSnippet(thread.snippet),
        plan: undefined,
        category: null,
      };
    }) || [],
  );

  return { threads: threadsWithMessages };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const accessToken = token?.token;

  if (!accessToken) throw new Error("Missing access token");

  const result = await getColdEmails(
    { userId: session.user.id },
    gmail,
    accessToken,
  );

  return NextResponse.json(result);
});
