import type { EmailProvider } from "@/utils/email/types";
import { FOLLOW_UP_LABEL } from "@/utils/label";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("follow-up/labels");

/**
 * Gets or creates the "Follow-up" label
 */
export async function getOrCreateFollowUpLabel(
  provider: EmailProvider,
): Promise<{ id: string; name: string }> {
  const existingLabel = await provider.getLabelByName(FOLLOW_UP_LABEL);
  if (existingLabel) {
    return { id: existingLabel.id, name: existingLabel.name };
  }

  const createdLabel = await provider.createLabel(FOLLOW_UP_LABEL);
  return { id: createdLabel.id, name: createdLabel.name };
}

/**
 * Applies the "Follow-up" label to a thread
 */
export async function applyFollowUpLabel({
  provider,
  threadId,
  messageId,
}: {
  provider: EmailProvider;
  threadId: string;
  messageId: string;
}): Promise<void> {
  logger.info("Applying follow-up label", { threadId, messageId });

  const label = await getOrCreateFollowUpLabel(provider);

  await provider.labelMessage({
    messageId,
    labelId: label.id,
    labelName: FOLLOW_UP_LABEL,
  });

  logger.info("Follow-up label applied", { threadId, labelId: label.id });
}

/**
 * Removes the "Follow-up" label from a thread
 */
export async function removeFollowUpLabel({
  provider,
  threadId,
}: {
  provider: EmailProvider;
  threadId: string;
}): Promise<void> {
  logger.info("Removing follow-up label", { threadId });

  const label = await provider.getLabelByName(FOLLOW_UP_LABEL);
  if (!label) {
    logger.info("Follow-up label does not exist, nothing to remove", {
      threadId,
    });
    return;
  }

  try {
    await provider.removeThreadLabel(threadId, label.id);
    logger.info("Follow-up label removed", { threadId, labelId: label.id });
  } catch (error) {
    // Label might not be on the thread, which is fine
    logger.warn("Failed to remove follow-up label (may not exist on thread)", {
      threadId,
      error,
    });
  }
}

/**
 * Checks if a thread has the "Follow-up" label
 */
export async function hasFollowUpLabel({
  provider,
  threadId,
}: {
  provider: EmailProvider;
  threadId: string;
}): Promise<boolean> {
  const label = await provider.getLabelByName(FOLLOW_UP_LABEL);
  if (!label) return false;

  try {
    const thread = await provider.getThread(threadId);
    const messages = thread.messages;
    if (!messages?.length) return false;

    // Check if any message in the thread has the follow-up label
    return messages.some((message) => message.labelIds?.includes(label.id));
  } catch (error) {
    logger.warn("Failed to check for follow-up label", { threadId, error });
    return false;
  }
}
