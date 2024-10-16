import { publishDelete, type TinybirdEmailAction } from "@inboxzero/tinybird";
import type { gmail_v1 } from "@googleapis/gmail";

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

  const trashPromise = gmail.users.threads.trash({
    userId: "me",
    id: threadId,
  });

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
    console.error(`Failed to trash thread: ${threadId}`, trashResult.reason);
    throw trashResult.reason;
  }

  if (publishResult.status === "rejected") {
    console.error(
      `Failed to publish delete action: ${threadId}`,
      publishResult.reason,
    );
  }

  return trashResult.value;
}

export async function trashMessage(options: {
  gmail: gmail_v1.Gmail;
  messageId: string;
}) {
  const { gmail, messageId } = options;

  return gmail.users.messages.trash({
    userId: "me",
    id: messageId,
  });
}
