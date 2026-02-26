import prisma from "@/utils/prisma";
import { withPrismaRetry } from "@/utils/prisma-retry";
import type { EmailProvider, EmailLabel } from "@/utils/email/types";
import { FOLLOW_UP_LABEL } from "@/utils/label";
import type { Logger } from "@/utils/logger";

export async function getOrCreateFollowUpLabel(
  provider: EmailProvider,
  existingLabels?: EmailLabel[],
): Promise<{ id: string; name: string }> {
  const existingFromLabels = existingLabels?.find(
    (label) => label.name === FOLLOW_UP_LABEL,
  );
  if (existingFromLabels) {
    return { id: existingFromLabels.id, name: existingFromLabels.name };
  }

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

  let clearedTrackerCount = 0;
  let shouldAttemptLabelRemoval = false;
  let removalReason:
    | "cleared-unresolved-trackers"
    | "existing-follow-up-tracker"
    | "db-error-fallback"
    | null = null;

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
    clearedTrackerCount = count;

    if (count > 0) {
      shouldAttemptLabelRemoval = true;
      removalReason = "cleared-unresolved-trackers";
    } else {
      const existingFollowUpTracker = await withPrismaRetry(
        () =>
          prisma.threadTracker.findFirst({
            where: {
              emailAccountId,
              threadId,
              followUpAppliedAt: { not: null },
            },
            select: { id: true },
          }),
        { logger },
      );

      if (existingFollowUpTracker) {
        shouldAttemptLabelRemoval = true;
        removalReason = "existing-follow-up-tracker";
      }
    }
  } catch (error) {
    logger.error("Failed to clear follow-up tracker state", {
      threadId,
      error,
    });
    shouldAttemptLabelRemoval = true;
    removalReason = "db-error-fallback";
  }

  if (!shouldAttemptLabelRemoval) {
    logger.info(
      "Skipping follow-up label removal; no app-managed follow-up tracker found",
      {
        threadId,
        clearedTrackerCount,
      },
    );
    return;
  }

  logger.info("Removing follow-up label", { threadId, removalReason });

  try {
    await removeFollowUpLabel({ provider, threadId, logger });

    logger.info("Completed follow-up label removal check", {
      threadId,
      clearedTrackerCount,
      removalReason,
    });
  } catch (error) {
    logger.error("Failed to remove follow-up label", { threadId, error });
  }
}
