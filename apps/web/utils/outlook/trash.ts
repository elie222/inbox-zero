import type { OutlookClient } from "@/utils/outlook/client";
import { publishDelete, type TinybirdEmailAction } from "@inboxzero/tinybird";
import type { Logger } from "@/utils/logger";
import { withMicrosoftGraphWriteRetry } from "@/utils/outlook/retry";
import {
  listThreadMessages,
  runThreadMessageMutation,
} from "@/utils/outlook/thread-helpers";

export async function trashThread(options: {
  client: OutlookClient;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
  logger: Logger;
}) {
  const { client, threadId, ownerEmail, actionSource, logger } = options;
  const messages = await listThreadMessages({
    client,
    threadId,
    select: "id",
    logger,
  });
  const messageIds = messages.map((message) => message.id);

  await runThreadMessageMutation({
    messageIds,
    threadId,
    logger,
    failureMessage: "Failed to move message to trash",
    messageHandler: (messageId) =>
      withMicrosoftGraphWriteRetry(
        () =>
          client.getClient().api(`/me/messages/${messageId}/move`).post({
            destinationId: "deleteditems",
          }),
        logger,
      ),
  });

  try {
    await publishDelete({
      ownerEmail,
      threadId,
      actionSource,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error("Failed to publish delete action", {
      email: ownerEmail,
      threadId,
      error,
    });
  }

  return { status: 200 };
}
