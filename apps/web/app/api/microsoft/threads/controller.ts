import type { OutlookClient } from "@/utils/outlook/client";
import type { ThreadsQuery } from "@/app/api/microsoft/threads/validation";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { getCategory } from "@/utils/redis/category";
import type { ParsedMessage } from "@/utils/types";

export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

// Helper function to convert Outlook messages to ParsedMessage format
function convertOutlookMessages(messages: any[]): ParsedMessage[] {
  return messages.map((message) => {
    const subject = message.subject || "";
    const date = message.receivedDateTime || new Date().toISOString();
    return {
      id: message.id || "",
      threadId: message.conversationId || "",
      snippet: message.bodyPreview || "",
      textPlain: message.body?.content || "",
      textHtml: message.body?.content || "",
      headers: {
        from: message.from?.emailAddress?.address || "",
        to: message.toRecipients?.[0]?.emailAddress?.address || "",
        subject,
        date,
      },
      subject,
      date,
      labelIds: [],
      internalDate: date,
      historyId: "",
      inline: [],
    };
  });
}

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
    const filters: string[] = [];

    // Add folder filter based on type
    if (query.type === "all") {
      // For "all" type, include both inbox and archive
      filters.push(
        "(parentFolderId eq 'inbox' or parentFolderId eq 'archive')",
      );
    } else {
      // Default to inbox only
      filters.push("parentFolderId eq 'inbox'");
    }

    // Add other filters
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
  // Always use the main messages endpoint since we're filtering by folder in the query
  const endpoint = "/me/messages";

  // Build the request
  let request = client
    .api(endpoint)
    .select(
      "id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime,isDraft,body,categories,parentFolderId",
    )
    .top(query.limit || 50);

  // Add filter if present
  const filter = getFilter();
  if (filter) {
    request = request.filter(filter);
  }

  // Only add ordering if we don't have a fromEmail filter to avoid complexity
  if (!query.fromEmail) {
    request = request.orderby("receivedDateTime DESC");
  }

  // Handle pagination
  if (query.nextPageToken) {
    request = request.skipToken(query.nextPageToken);
  }

  const response = await request.get();

  // Sort messages by receivedDateTime if we filtered by fromEmail (since we couldn't use orderby)
  let sortedMessages = response.value;
  if (query.fromEmail) {
    sortedMessages = response.value.sort(
      (a: any, b: any) =>
        new Date(b.receivedDateTime).getTime() -
        new Date(a.receivedDateTime).getTime(),
    );
  }

  // Group messages by conversationId to create threads
  const messagesByThread = new Map<string, any[]>();
  sortedMessages.forEach((message: any) => {
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

      // Convert messages to ParsedMessage format
      const parsedMessages = convertOutlookMessages(messages);

      return {
        id: threadId,
        messages: parsedMessages,
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
