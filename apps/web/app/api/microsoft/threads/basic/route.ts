import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getOutlookClientForEmail } from "@/utils/account";
import type { OutlookClient } from "@/utils/outlook/client";

export type GetThreadsResponse = Awaited<ReturnType<typeof getGetThreads>>;
const getThreadsQuery = z.object({
  from: z.string(),
  labelId: z.string().nullish(),
});
type GetThreadsQuery = z.infer<typeof getThreadsQuery>;

async function getGetThreads(
  { from, labelId }: GetThreadsQuery,
  outlook: OutlookClient,
) {
  const client = outlook.getClient();

  // Build the filter query for Microsoft Graph API
  const escapedEmail = from.replace(/'/g, "''");
  const filter = `from/emailAddress/address eq '${escapedEmail}'`;

  // Get messages from Microsoft Graph API
  let endpoint = "/me/messages";

  // If labelId is specified, use the folder-specific endpoint
  if (labelId) {
    endpoint = `/me/mailFolders/${labelId}/messages`;
  }

  const response = await client
    .api(endpoint)
    .select(
      "id,conversationId,subject,bodyPreview,from,toRecipients,receivedDateTime",
    )
    .filter(filter)
    .top(500)
    .get();

  // Group messages by conversationId to create threads
  const messagesByThread = new Map<string, any[]>();
  response.value.forEach((message: any) => {
    const messages = messagesByThread.get(message.conversationId) || [];
    messages.push(message);
    messagesByThread.set(message.conversationId, messages);
  });

  // Return thread IDs
  return Array.from(messagesByThread.keys()).map((threadId) => ({
    id: threadId,
  }));
}

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const outlook = await getOutlookClientForEmail({ emailAccountId });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const labelId = searchParams.get("labelId");
  const query = getThreadsQuery.parse({ from, labelId });

  const result = await getGetThreads(query, outlook);

  return NextResponse.json(result);
});
