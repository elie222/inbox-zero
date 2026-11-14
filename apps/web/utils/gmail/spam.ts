import type { gmail_v1 } from "@googleapis/gmail";
import { GmailLabel, getLabel, getOrCreateLabel } from "@/utils/gmail/label";
import { withGmailRetry } from "@/utils/gmail/retry";
import { getReviewBeforeDeleteLabel } from "@/utils/review-before-delete";

export async function markSpam(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  reviewLabel?: string;
}) {
  const { gmail, threadId } = options;
  const reviewLabel = options.reviewLabel ?? getReviewBeforeDeleteLabel();

  if (reviewLabel) {
    const label = await getOrCreateLabel({ gmail, name: reviewLabel });
    if (!label?.id) {
      throw new Error(`Failed to resolve or create review label: "${reviewLabel}"`);
    }
    return withGmailRetry(() =>
      gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: {
          addLabelIds: [label.id],
          removeLabelIds: [GmailLabel.INBOX],
        },
      }),
    );
  }

  return withGmailRetry(() =>
    gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: {
        addLabelIds: [GmailLabel.SPAM],
      },
    }),
  );
}

export async function markNotSpam(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  reviewLabel?: string;
}) {
  const { gmail, threadId } = options;
  const reviewLabel = options.reviewLabel ?? getReviewBeforeDeleteLabel();

  if (reviewLabel) {
    const label = await getLabel({ gmail, name: reviewLabel });
    return withGmailRetry(() =>
      gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: {
          addLabelIds: [GmailLabel.INBOX],
          removeLabelIds: label?.id
            ? [label.id, GmailLabel.SPAM]
            : [GmailLabel.SPAM],
        },
      }),
    );
  }

  return withGmailRetry(() =>
    gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: {
        addLabelIds: [GmailLabel.INBOX],
        removeLabelIds: [GmailLabel.SPAM],
      },
    }),
  );
}
