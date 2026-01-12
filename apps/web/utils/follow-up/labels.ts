import prisma from "@/utils/prisma";
import { withPrismaRetry } from "@/utils/prisma-retry";
import type { EmailProvider } from "@/utils/email/types";
import { FOLLOW_UP_LABEL } from "@/utils/label";
import type { Logger } from "@/utils/logger";

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

export async function applyFollowUpLabel({
  provider,
  threadId,
  messageId,
  labelId,
  logger,
}: {
  provider: EmailProvider;
  threadId: string;
  messageId: string;
  labelId?: string;
  logger: Logger;
}): Promise<void> {
  logger.info("Applying follow-up label", { threadId, messageId });

  const finalLabelId = labelId ?? (await getOrCreateFollowUpLabel(provider)).id;

  await provider.labelMessage({
    messageId,
    labelId: finalLabelId,
    labelName: FOLLOW_UP_LABEL,
  });

  logger.info("Follow-up label applied", { threadId, labelId: finalLabelId });
}

export async function removeFollowUpLabel({
  provider,
  threadId,
  labelId,
  logger,
}: {
  provider: EmailProvider;
  threadId: string;
  labelId?: string;
  logger: Logger;
}): Promise<void> {
  logger.info("Removing follow-up label", { threadId });

  let finalLabelId = labelId;
  if (!finalLabelId) {
    const label = await provider.getLabelByName(FOLLOW_UP_LABEL);
    if (!label) {
      logger.info("Follow-up label does not exist, nothing to remove", {
        threadId,
      });
      return;
    }
    finalLabelId = label.id;
  }

  try {
    await provider.removeThreadLabel(threadId, finalLabelId);
    logger.info("Follow-up label removed", { threadId, labelId: finalLabelId });
  } catch (error) {
    logger.warn("Failed to remove follow-up label (may not exist on thread)", {
      threadId,
      error,
    });
  }
}

export async function hasFollowUpLabel({
  provider,
  threadId,
  logger,
}: {
  provider: EmailProvider;
  threadId: string;
  logger: Logger;
}): Promise<boolean> {
  const label = await provider.getLabelByName(FOLLOW_UP_LABEL);
  if (!label) return false;

  try {
    const thread = await provider.getThread(threadId);
    const messages = thread.messages;
    if (!messages?.length) return false;

    return messages.some((message) => message.labelIds?.includes(label.id));
  } catch (error) {
    logger.warn("Failed to check for follow-up label", { threadId, error });
    return false;
  }
}

export async function clearFollowUpLabel({
  emailAccountId,
  threadId,
  provider,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<void> {
  if (!threadId) return;

  try {
    const { count } = await withPrismaRetry(
      () =>
        prisma.threadTracker.updateMany({
          where: {
            emailAccountId,
            threadId,
            followUpAppliedAt: { not: null },
            resolved: false,
          },
          data: {
            followUpAppliedAt: null,
          },
        }),
      { logger },
    );

    if (count === 0) {
      return;
    }

    logger.info("Removing follow-up label", { threadId });

    await removeFollowUpLabel({ provider, threadId, logger });

    logger.info("Removed follow-up label and cleared tracker", {
      threadId,
    });
  } catch (error) {
    logger.error("Failed to remove follow-up label", { threadId, error });
  }
}
