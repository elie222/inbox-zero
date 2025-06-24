import type { OutlookClient } from "@/utils/outlook/client";
import type { ThreadsQuery } from "@/app/api/microsoft/threads/validation";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { getCategory } from "@/utils/redis/category";

export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

export async function getThreads({
  query,
  outlook,
  accessToken,
  emailAccountId,
}: {
  query: ThreadsQuery;
  outlook: OutlookClient;
  accessToken: string;
  emailAccountId: string;
}) {
  if (!accessToken) throw new SafeError("Missing access token");

  const client = outlook.getClient();

  // Build the filter query for Microsoft Graph API
  function getFilter() {
    const filters = [];

    if (query.fromEmail) {
      // Escape single quotes in email address
      const escapedEmail = query.fromEmail.replace(/'/g, "''");
      filters.push(`from/emailAddress/address eq '${escapedEmail}'`);
    }

    if (query.q) {
      // Escape single quotes in search query
      const escapedQuery = query.q.replace(/'/g, "''");
      filters.push(
        `(contains(subject,'${escapedQuery}') or contains(bodyPreview,'${escapedQuery}'))`,
      );
    }

    return filters.length > 0 ? filters.join(" and ") : undefined;
  }

  // Get messages from Microsoft Graph API
  let endpoint = "/me/messages";

  // If folder is specified, use the folder-specific endpoint
  if (query.folderId) {
    const folderId = getFolderId(query.folderId);
    if (folderId) {
      endpoint = `/me/mailFolders/${folderId}/messages`;
    }
  }

  // Build the request
  let request = client
    .api(endpoint)
    .select(
      "id,conversationId,subject,bodyPreview,from,receivedDateTime,isDraft",
    )
    .top(query.limit || 50)
    .orderby("receivedDateTime DESC");

  // Add filter if present
  const filter = getFilter();
  if (filter) {
    request = request.filter(filter);
  }

  // Handle pagination
  if (query.nextPageToken) {
    request = request.skipToken(query.nextPageToken);
  }

  const response = await request.get();

  // Group messages by conversationId to create threads
  const messagesByThread = new Map<string, any[]>();
  response.value.forEach((message: any) => {
    const messages = messagesByThread.get(message.conversationId) || [];
    messages.push(message);
    messagesByThread.set(message.conversationId, messages);
  });

  // Get executed rules for these threads
  const threadIds = Array.from(messagesByThread.keys());
  const plans = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      threadId: { in: threadIds },
      status: {
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
  });

  // Format the response
  const threads = await Promise.all(
    Array.from(messagesByThread.entries()).map(async ([threadId, messages]) => {
      const plan = plans.find((p) => p.threadId === threadId);

      return {
        id: threadId,
        messages: messages.map((msg) => ({
          id: msg.id,
          threadId: msg.conversationId,
          snippet: msg.bodyPreview,
          subject: msg.subject,
          from: msg.from,
          receivedAt: msg.receivedDateTime,
          isDraft: msg.isDraft,
        })),
        snippet: messages[0]?.bodyPreview,
        plan,
        category: await getCategory({ emailAccountId, threadId }),
      };
    }),
  );

  return {
    threads,
    nextPageToken: response["@odata.nextLink"]
      ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken")
      : undefined,
  };
}

// Helper function to get folder IDs based on type
export function getFolderId(type?: string | null) {
  switch (type?.toLowerCase()) {
    case "inbox":
      return "inbox";
    case "sent":
      return "sentitems";
    case "draft":
      return "drafts";
    case "trash":
      return "deleteditems";
    case "archive":
      return "archive";
    case "all":
      return undefined;
    default:
      if (!type || type === "undefined" || type === "null") return "inbox";
      return type;
  }
}
