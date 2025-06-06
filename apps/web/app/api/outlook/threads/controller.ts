import { parseMessages } from "@/utils/mail";
import { isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getCategory } from "@/utils/redis/category";
import { ExecutedRuleStatus } from "@prisma/client";
import { SafeError } from "@/utils/error";
import { Client } from "@microsoft/microsoft-graph-client";

export type OutlookThreadsResponse = Awaited<
  ReturnType<typeof getOutlookThreads>
>;

export async function getOutlookThreads({
  query,
  graphClient,
  accessToken,
  emailAccountId,
}: {
  query: {
    q?: string;
    fromEmail?: string;
    type?: string;
    limit?: number;
    nextPageToken?: string;
    folderId?: string;
  };
  graphClient: Client;
  accessToken: string;
  emailAccountId: string;
}) {
  if (!accessToken) throw new SafeError("Missing access token");

  // filter string for Microsoft Graph
  function getFilter() {
    const filters: string[] = [];
    if (query.q) {
      filters.push(`contains(subject,'${query.q}')`);
    }
    if (query.fromEmail) {
      filters.push(`from/emailAddress/address eq '${query.fromEmail}'`);
    }

    return filters.length ? filters.join(" and ") : undefined;
  }

  // /me/conversations to get threads
  let request = graphClient.api("/me/conversations").top(query.limit || 50);

  if (query.nextPageToken) {
    request = request.header("skipToken", query.nextPageToken);
  }
  const filter = getFilter();
  if (filter) {
    request = request.filter(filter);
  }

  const response = await request.get();
  const conversations = response.value || [];
  const nextPageToken = response["@odata.nextLink"] || null;

  const conversationIds = conversations.map((c: any) => c.id);

  const plans = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      threadId: { in: conversationIds },
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

  const threadsWithMessages = await Promise.all(
    conversations.map(async (conv: any) => {
      const id = conv.id;

      // messages in the conversation
      const messagesRes = await graphClient
        .api(`/me/conversations/${id}/threads`)
        .get();
      const messages = messagesRes.value || [];

      const plan = plans.find((p) => p.threadId === id);

      return {
        id,
        messages,
        snippet: messages[0]?.bodyPreview || "",
        plan,
        category: await getCategory({ emailAccountId, threadId: id }),
      };
    }),
  );

  return {
    threads: threadsWithMessages,
    nextPageToken,
  };
}
