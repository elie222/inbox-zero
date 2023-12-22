import { z } from "zod";
import he from "he";
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { getPlan } from "@/utils/redis/plan";
import { INBOX_LABEL_ID } from "@/utils/label";
import { ThreadWithPayloadMessages } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getCategory } from "@/utils/redis/category";
import { getThreadsBatch } from "@/utils/gmail/thread";
import { withError } from "@/utils/middleware";

export const dynamic = "force-dynamic";

export const maxDuration = 30;

const threadsQuery = z.object({
  fromEmail: z.string().nullish(),
  limit: z.coerce.number().max(100).nullish(),
  includeAll: z.coerce.boolean().nullish(),
});
export type ThreadsQuery = z.infer<typeof threadsQuery>;
export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads(query: ThreadsQuery) {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const accessToken = token?.token;

  if (!accessToken) throw new Error("Missing access token");

  const [gmailThreads, rules] = await Promise.all([
    gmail.users.threads.list({
      userId: "me",
      labelIds: query.includeAll ? undefined : [INBOX_LABEL_ID],
      maxResults: query.limit || 50,
      q: query.fromEmail ? `from:${query.fromEmail}` : undefined,
    }),
    prisma.rule.findMany({ where: { userId: session.user.id } }),
  ]);

  // may have been faster not using batch method, but doing 50 getMessages in parallel
  const threads = await getThreadsBatch(
    gmailThreads.data.threads?.map((thread) => thread.id!) || [],
    accessToken,
  );

  const threadsWithMessages = await Promise.all(
    threads.map(async (thread) => {
      const id = thread.id!;
      const messages = parseMessages(thread as ThreadWithPayloadMessages);

      const plan = await getPlan({ userId: session.user.id, threadId: id });
      const rule = plan
        ? rules.find((r) => r.id === plan?.rule?.id)
        : undefined;

      return {
        id: thread.id,
        historyId: thread.historyId,
        messages,
        snippet: he.decode(thread.snippet || ""),
        plan: plan ? { ...plan, databaseRule: rule } : undefined,
        category: await getCategory({ email, threadId: id }),
      };
    }) || [],
  );

  return { threads: threadsWithMessages };
}

export const GET = withError(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const fromEmail = searchParams.get("fromEmail");
  const includeAll = searchParams.get("includeAll");
  const query = threadsQuery.parse({ limit, fromEmail, includeAll });

  const threads = await getThreads(query);
  return NextResponse.json(threads);
});
