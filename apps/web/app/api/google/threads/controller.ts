import { parseMessages } from "@/utils/mail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
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
import { ThreadWithPayloadMessages, isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getCategory } from "@/utils/redis/category";
import { getThreadsBatch } from "@/utils/gmail/thread";
import { decodeSnippet } from "@/utils/gmail/decode";
import { ThreadsQuery } from "@/app/api/google/threads/validation";
import { ExecutedRuleStatus } from "@prisma/client";

export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

export async function getThreads(query: ThreadsQuery) {
  const session = await auth();
  const email = session?.user.email;
  if (!email) throw new Error("Not authenticated");

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const accessToken = token?.token;

  if (!accessToken) throw new Error("Missing access token");

  const gmailThreads = await gmail.users.threads.list({
    userId: "me",
    labelIds: getLabelIds(query.type),
    maxResults: query.limit || 50,
    q:
      query.q ||
      (query.fromEmail
        ? `from:${query.fromEmail}`
        : query.type === "archive"
          ? `-label:${INBOX_LABEL_ID}`
          : undefined),
    pageToken: query.nextPageToken || undefined,
  });

  const threadIds =
    gmailThreads.data.threads?.map((t) => t.id).filter(isDefined) || [];

  const [threads, plans] = await Promise.all([
    getThreadsBatch(threadIds, accessToken), // may have been faster not using batch method, but doing 50 getMessages in parallel
    prisma.executedRule.findMany({
      where: {
        userId: session.user.id,
        threadId: { in: threadIds },
        status: {
          // TODO probably want to show applied rules here in the future too
          in: [ExecutedRuleStatus.PENDING, ExecutedRuleStatus.SKIPPED],
        },
      },
      select: {
        id: true,
        messageId: true,
        threadId: true,
        rule: true,
        actionItems: true,
        status: true,
        reason: true,
      },
    }),
  ]);

  const threadsWithMessages = await Promise.all(
    threads.map(async (thread) => {
      const id = thread.id!;
      const messages = parseMessages(thread as ThreadWithPayloadMessages);

      const plan = plans.find((p) => p.threadId === id);

      return {
        id,
        messages,
        snippet: decodeSnippet(thread.snippet),
        plan,
        category: await getCategory({ email, threadId: id }),
      };
    }) || [],
  );

  return {
    threads: threadsWithMessages,
    nextPageToken: gmailThreads.data.nextPageToken,
  };
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
