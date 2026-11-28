import type { gmail_v1 } from "@googleapis/gmail";
import { publishDelete, type TinybirdEmailAction } from "@inboxzero/tinybird";
import { createScopedLogger } from "@/utils/logger";
import { withGmailRetry } from "@/utils/gmail/retry";
import { GmailLabel, getLabel, getOrCreateLabel } from "@/utils/gmail/label";
import { getReviewBeforeDeleteLabel } from "@/utils/review-before-delete";

const logger = createScopedLogger("gmail/trash");

// trash moves the thread/message to the trash folder
// delete immediately deletes the thread/message
// trash does not require delete access from Gmail API

export async function trashThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
  reviewLabel?: string;
}) {
  const { gmail, threadId, ownerEmail, actionSource } = options;
  const reviewLabel = options.reviewLabel ?? getReviewBeforeDeleteLabel();

  const trashPromise = withGmailRetry(async () => {
    if (reviewLabel) {
      const label = await getOrCreateLabel({ gmail, name: reviewLabel });
      if (!label?.id) {
        throw new Error(`Failed to resolve or create review label: "${reviewLabel}"`);
      }
      return (
        await gmail.users.threads.modify({
          userId: "me",
          id: threadId,
          requestBody: {
            addLabelIds: [label.id],
            removeLabelIds: [GmailLabel.INBOX],
          },
        })
      ).data;
    }

    return (
      await gmail.users.threads.trash({
        userId: "me",
        id: threadId,
      })
    ).data;
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
    const error = trashResult.reason;

    if (
      error.message === "Requested entity was not found." ||
      error.status === 404 ||
      error.code === 404
    ) {
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

/**
 * Restores a trashed thread. Gmail returns it to the labels it held before the
 * trash, so a thread trashed from the inbox lands back in the inbox.
 */
export async function untrashThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  reviewLabel?: string;
}) {
  const { gmail, threadId } = options;
  const reviewLabel = options.reviewLabel ?? getReviewBeforeDeleteLabel();

  if (reviewLabel) {
    const label = await getLabel({ gmail, name: reviewLabel });
    if (label?.id) {
      return (
        await withGmailRetry(() =>
          gmail.users.threads.modify({
            userId: "me",
            id: threadId,
            requestBody: {
              addLabelIds: [GmailLabel.INBOX],
              removeLabelIds: [label.id!],
            },
          }),
        )
      ).data;
    }
  }

  return withGmailRetry(() =>
    gmail.users.threads.untrash({
      userId: "me",
      id: threadId,
    }),
  );
}

export async function trashMessage(options: {
  gmail: gmail_v1.Gmail;
  messageId: string;
  reviewLabel?: string;
}) {
  const { gmail, messageId } = options;
  const reviewLabel = options.reviewLabel ?? getReviewBeforeDeleteLabel();

  if (reviewLabel) {
    const label = await getOrCreateLabel({ gmail, name: reviewLabel });
    if (!label?.id) {
      throw new Error(`Failed to resolve or create review label: "${reviewLabel}"`);
    }
    return (
      await withGmailRetry(() =>
        gmail.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: {
            addLabelIds: [label.id!],
            removeLabelIds: [GmailLabel.INBOX],
          },
        }),
      )
    ).data;
  }

  return withGmailRetry(() =>
    gmail.users.messages.trash({
      userId: "me",
      id: messageId,
    }),
  );
}
