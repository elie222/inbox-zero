import type { OutlookClient } from "@/utils/outlook/client";
import { publishDelete, type TinybirdEmailAction } from "@inboxzero/tinybird";
import type { Logger } from "@/utils/logger";
import {
  withMicrosoftGraphRetry,
  withMicrosoftGraphWriteRetry,
} from "@/utils/microsoft/retry";
import { runThreadMessageMutation } from "@/utils/outlook/thread-helpers";
import { resolveMicrosoftGraphNextLink } from "@/utils/outlook/page-token";

export async function trashThread(options: {
  client: OutlookClient;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
  logger: Logger;
}) {
  const { client, threadId, ownerEmail, actionSource, logger } = options;
  const escapedThreadId = threadId.replace(/'/g, "''");
  let page: { value: { id: string }[]; "@odata.nextLink"?: string } =
    await withMicrosoftGraphRetry(
      () =>
        client
          .getClient()
          .api("/me/messages")
          .filter(`conversationId eq '${escapedThreadId}'`)
          .select("id")
          .get(),
      logger,
    );

  // Finish enumeration before moving messages changes the paginated result set.
  const messageIds = new Set<string>();
  const visitedPages = new Set<string>();
  while (true) {
    for (const message of page.value) messageIds.add(message.id);
    if (!page["@odata.nextLink"]) break;

    const nextLink = resolveMicrosoftGraphNextLink(page["@odata.nextLink"]);
    if (!nextLink || visitedPages.has(nextLink)) {
      throw new Error("Unable to complete Outlook thread pagination");
    }
    visitedPages.add(nextLink);
    page = await withMicrosoftGraphRetry(
      () => client.getClient().api(nextLink).get(),
      logger,
    );
  }

  await runThreadMessageMutation({
    messageIds: [...messageIds],
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
