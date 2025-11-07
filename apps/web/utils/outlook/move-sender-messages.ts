import { createScopedLogger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import { moveMessagesInBatches } from "@/utils/outlook/batch";

const logger = createScopedLogger("outlook/sender-move");

export async function moveMessagesForSenders(options: {
  client: OutlookClient;
  senders: string[];
  destinationId: string;
  action: "archive" | "trash";
  ownerEmail?: string;
}): Promise<void> {
  const { client, senders, destinationId, action, ownerEmail } = options;

  if (senders.length === 0) {
    return;
  }

  for (const sender of senders) {
    if (!sender) {
      continue;
    }

    const filterExpression = `from/emailAddress/address eq '${escapeODataString(sender)}'`;
    const processedMessageIds = new Set<string>();
    let skipToken: string | undefined;

    do {
      let request = client
        .getClient()
        .api("/me/messages")
        .filter(filterExpression)
        .top(50)
        .select("id");

      if (skipToken) {
        request = request.skipToken(skipToken);
      }

      const response: {
        value?: Array<{ id?: string | null }>;
        "@odata.nextLink"?: string;
      } = await request.get();

      const messageIds = (response.value ?? [])
        .map((message) => message.id ?? undefined)
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            id.length > 0 &&
            !processedMessageIds.has(id),
        );

      messageIds.forEach((id) => processedMessageIds.add(id));

      if (messageIds.length > 0) {
        try {
          await moveMessagesInBatches({
            client,
            messageIds,
            destinationId,
            action,
          });
        } catch (error) {
          logger.error("Failed to move messages via batch", {
            action,
            sender,
            ownerEmail,
            destinationId,
            messageIds,
            error: error instanceof Error ? error.message : error,
          });
          throw error;
        }
      }

      const nextLink = response["@odata.nextLink"];
      if (nextLink) {
        const url = new URL(nextLink);
        skipToken = url.searchParams.get("$skiptoken") ?? undefined;
      } else {
        skipToken = undefined;
      }
    } while (skipToken);
  }
}
