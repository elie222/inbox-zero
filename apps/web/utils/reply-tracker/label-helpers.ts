import type { EmailProvider } from "@/utils/email/types";
import { getOrCreateSystemLabelId } from "@/utils/label-config";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("reply-tracker-labels");

export async function labelMessageAsAwaitingReply(options: {
  emailAccountId: string;
  messageId: string;
  provider: EmailProvider;
}): Promise<void> {
  const { emailAccountId, messageId, provider } = options;

  const labelId = await getOrCreateSystemLabelId({
    emailAccountId,
    type: "awaitingReply",
    provider,
  });

  if (!labelId) {
    logger.error("Failed to get or create awaiting reply label");
    return;
  }

  await provider.labelMessage(messageId, labelId);
}

export async function removeAwaitingReplyLabelFromThread(options: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
}): Promise<void> {
  const { emailAccountId, threadId, provider } = options;

  const labelId = await getOrCreateSystemLabelId({
    emailAccountId,
    type: "awaitingReply",
    provider,
  });

  if (!labelId) {
    return;
  }

  await provider.removeThreadLabel(threadId, labelId);
}

export async function removeNeedsReplyLabelFromThread(options: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
}): Promise<void> {
  const { emailAccountId, threadId, provider } = options;

  const labelId = await getOrCreateSystemLabelId({
    emailAccountId,
    type: "needsReply",
    provider,
  });

  if (!labelId) {
    return;
  }

  await provider.removeThreadLabel(threadId, labelId);
}

/**
 * Applies the "Done" label to a thread and removes state labels.
 * Marks thread as completed - no longer needs attention.
 */
export async function markThreadAsDone(options: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
}): Promise<void> {
  const { emailAccountId, threadId, provider } = options;

  // Get all state label IDs
  const [doneLabelId, needsReplyLabelId, awaitingReplyLabelId] =
    await Promise.all([
      getOrCreateSystemLabelId({
        emailAccountId,
        type: "done",
        provider,
      }),
      getOrCreateSystemLabelId({
        emailAccountId,
        type: "needsReply",
        provider,
      }),
      getOrCreateSystemLabelId({
        emailAccountId,
        type: "awaitingReply",
        provider,
      }),
    ]);

  // Remove active state labels
  const removePromises = [];
  if (needsReplyLabelId) {
    removePromises.push(
      provider.removeThreadLabel(threadId, needsReplyLabelId),
    );
  }
  if (awaitingReplyLabelId) {
    removePromises.push(
      provider.removeThreadLabel(threadId, awaitingReplyLabelId),
    );
  }

  // Apply Done label
  if (doneLabelId) {
    removePromises.push(provider.labelMessage(threadId, doneLabelId));
  }

  await Promise.allSettled(removePromises);
}
