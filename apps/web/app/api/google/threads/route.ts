import { z } from "zod";
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { getPlan } from "@/utils/redis/plan";
import {
  DRAFT_LABEL_ID,
  IMPORTANT_LABEL_ID,
  INBOX_LABEL_ID,
  SENT_LABEL_ID,
  SPAM_LABEL_ID,
  STARRED_LABEL_ID,
  TRASH_LABEL_ID,
  UNREAD_LABEL_ID,
} from "@/utils/label";
import { ThreadWithPayloadMessages } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getCategory } from "@/utils/redis/category";
import { getThreadsBatch } from "@/utils/gmail/thread";
import { withError } from "@/utils/middleware";
import { decodeSnippet } from "@/utils/gmail/decode";

export const dynamic = "force-dynamic";

export const maxDuration = 30;

const threadsQuery = z.object({
  fromEmail: z.string().nullish(),
  limit: z.coerce.number().max(100).nullish(),
  type: z.string().nullish(),
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
      labelIds: getLabelIds(query.type),
      maxResults: query.limit || 50,
      q: query.fromEmail
        ? `from:${query.fromEmail}`
        : query.type === "archive"
          ? `-label:${INBOX_LABEL_ID}`
          : undefined,
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
        id,
        historyId: thread.historyId,
        messages,
        snippet: decodeSnippet(thread.snippet),
        plan: plan ? { ...plan, databaseRule: rule } : undefined,
        category: await getCategory({ email, threadId: id }),
      };
    }) || [],
  );

  return { threads: threadsWithMessages };
}

function getLabelIds(type?: string | null) {
  switch (type) {
    case "inbox":
      return [INBOX_LABEL_ID];
    case "sent":
      return [SENT_LABEL_ID];
    case "draft":
      return [DRAFT_LABEL_ID];
    case "trash":
      return [TRASH_LABEL_ID];
    case "spam":
      return [SPAM_LABEL_ID];
    case "starred":
      return [STARRED_LABEL_ID];
    case "important":
      return [IMPORTANT_LABEL_ID];
    case "unread":
      return [UNREAD_LABEL_ID];
    case "archive":
      return undefined;
    case "all":
      return undefined;
    default:
      if (!type || type === "undefined" || type === "null")
        return [INBOX_LABEL_ID];
      return [type];
  }
}

export const GET = withError(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const fromEmail = searchParams.get("fromEmail");
  const type = searchParams.get("type");
  const query = threadsQuery.parse({ limit, fromEmail, type });

  const threads = await getThreads(query);
  return NextResponse.json(threads);
});
