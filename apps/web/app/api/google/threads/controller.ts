import { parseMessages } from "@/utils/gmail/message";
import type { gmail_v1 } from "@googleapis/gmail";
import { GmailLabel } from "@/utils/gmail/label";
import { isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getCategory } from "@/utils/redis/category";
import {
  getThreadsBatch,
  getThreadsWithNextPageToken,
} from "@/utils/gmail/thread";
import { decodeSnippet } from "@/utils/gmail/decode";
import { ExecutedRuleStatus } from "@prisma/client";
import { SafeError } from "@/utils/error";
import type { ThreadsQuery } from "@/app/api/threads/validation";

export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

export async function getThreads({
  query,
  gmail,
  accessToken,
  emailAccountId,
}: {
  query: ThreadsQuery;
  gmail: gmail_v1.Gmail;
  accessToken: string;
  emailAccountId: string;
}) {
  if (!accessToken) throw new SafeError("Missing access token");

  function getQuery() {
    if (query.q) {
      return query.q;
    }
    if (query.fromEmail) {
      return `from:${query.fromEmail}`;
    }
    if (query.type === "archive") {
      return `-label:${GmailLabel.INBOX}`;
    }
    return undefined;
  }

  const { threads: gmailThreads, nextPageToken } =
    await getThreadsWithNextPageToken({
      gmail,
      q: getQuery(),
      labelIds: query.labelId ? [query.labelId] : getLabelIds(query.type),
      maxResults: query.limit || 50,
      pageToken: query.nextPageToken || undefined,
    });

  const threadIds = gmailThreads?.map((t) => t.id).filter(isDefined) || [];

  const [threads, plans] = await Promise.all([
    getThreadsBatch(threadIds, accessToken), // may have been faster not using batch method, but doing 50 getMessages in parallel
    prisma.executedRule.findMany({
      where: {
        emailAccountId,
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
      const id = thread.id;
      if (!id) return;
      const messages = parseMessages(thread, { withoutIgnoredSenders: true });

      const plan = plans.find((p) => p.threadId === id);

      return {
        id,
        messages,
        snippet: decodeSnippet(thread.snippet),
        plan,
        category: await getCategory({ emailAccountId, threadId: id }),
      };
    }) || [],
  );

  return {
    threads: threadsWithMessages.filter(isDefined),
    nextPageToken,
  };
}

function getLabelIds(type?: string | null) {
  switch (type) {
    case "inbox":
      return [GmailLabel.INBOX];
    case "sent":
      return [GmailLabel.SENT];
    case "draft":
      return [GmailLabel.DRAFT];
    case "trash":
      return [GmailLabel.TRASH];
    case "spam":
      return [GmailLabel.SPAM];
    case "starred":
      return [GmailLabel.STARRED];
    case "important":
      return [GmailLabel.IMPORTANT];
    case "unread":
      return [GmailLabel.UNREAD];
    case "archive":
      return undefined;
    case "all":
      return undefined;
    default:
      if (!type || type === "undefined" || type === "null")
        return [GmailLabel.INBOX];
      return [type];
  }
}
