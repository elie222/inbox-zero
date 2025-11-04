import type { gmail_v1 } from "@googleapis/gmail";
import { publishDelete, type TinybirdEmailAction } from "@inboxzero/tinybird";
import { createScopedLogger } from "@/utils/logger";
import { withGmailRetry } from "@/utils/gmail/retry";

const logger = createScopedLogger("gmail/trash");

// trash moves the thread/message to the trash folder
// delete immediately deletes the thread/message
// trash does not require delete access from Gmail API

export async function trashThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
}) {
  const { gmail, threadId, ownerEmail, actionSource } = options;

  const trashPromise = withGmailRetry(() =>
    gmail.users.threads.trash({
      userId: "me",
      id: threadId,
    }),
  );

  const publishPromise = publishDelete({
    ownerEmail,
    threadId,
    actionSource,
    timestamp: Date.now(),
  });

  const [trashResult, publishResult] = await Promise.allSettled([
    trashPromise,
    publishPromise,
  ]);

  if (trashResult.status === "rejected") {
    const error = trashResult.reason;

    if (error.message === "Requested entity was not found.") {
      // thread doesn't exist, so it's already been deleted
      logger.warn("Failed to trash non-existant thread", {
        email: ownerEmail,
        threadId,
        error,
      });
      return { status: 200 };
    } else {
      logger.error("Failed to trash thread", {
        email: ownerEmail,
        threadId,
        error,
      });
      throw error;
    }
  }

  if (publishResult.status === "rejected") {
    logger.error("Failed to publish delete action", {
      email: ownerEmail,
      threadId,
      error: publishResult.reason,
    });
  }

  return trashResult.value;
}

export async function trashMessage(options: {
  gmail: gmail_v1.Gmail;
  messageId: string;
}) {
  const { gmail, messageId } = options;

  return withGmailRetry(() =>
    gmail.users.messages.trash({
      userId: "me",
      id: messageId,
    }),
  );
}
