import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { SystemType } from "@prisma/client";
import {
  CONVERSATION_STATUSES,
  type ConversationStatusLabelType,
} from "./conversation-status-config";

const logger = createScopedLogger("reply-tracker-labels");

const THREAD_STATUS_LABEL_TYPES = CONVERSATION_STATUSES.map((s) => s.labelType);

const LABEL_TYPE_TO_NAME = Object.fromEntries(
  CONVERSATION_STATUSES.map((s) => [s.labelType, s.labelName]),
) as Record<ConversationStatusLabelType, string>;

function statusToLabelType(status: SystemType): ConversationStatusLabelType {
  const found = CONVERSATION_STATUSES.find((s) => s.systemType === status);
  if (!found) throw new Error(`Not a conversation status type: ${status}`);
  return found.labelType;
}

/**
 * Fetches or creates all thread status labels in one go.
 * Makes a single API call to the provider to get all labels.
 */
async function getOrCreateAllThreadStatusLabels(
  emailAccountId: string,
  provider: EmailProvider,
): Promise<Record<ConversationStatusLabelType, string | null>> {
  // First, check DB for existing label IDs
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      needsReplyLabelId: true,
      awaitingReplyLabelId: true,
      fyiLabelId: true,
      actionedLabelId: true,
    },
  });

  if (!emailAccount)
    return {
      needsReply: null,
      awaitingReply: null,
      fyi: null,
      actioned: null,
    };

  const dbLabelIds = {
    needsReply: emailAccount.needsReplyLabelId,
    awaitingReply: emailAccount.awaitingReplyLabelId,
    fyi: emailAccount.fyiLabelId,
    actioned: emailAccount.actionedLabelId,
  };

  // If all labels exist in DB, return them
  if (Object.values(dbLabelIds).every((id) => id)) {
    return dbLabelIds;
  }

  // Fetch ALL labels from provider in one API call
  try {
    const allLabels = await provider.getLabels();
    const labelsByName = new Map(allLabels.map((l) => [l.name, l.id]));

    const updates: Record<string, string> = {};

    // Find or create each thread status label
    for (const type of THREAD_STATUS_LABEL_TYPES) {
      if (dbLabelIds[type]) continue; // Already have it

      const labelName = LABEL_TYPE_TO_NAME[type];
      let labelId = labelsByName.get(labelName);

      // Create label if it doesn't exist
      if (!labelId) {
        logger.info("Creating thread status label", { type, labelName });
        const newLabel = await provider.createLabel(labelName);
        labelId = newLabel.id;
      }

      dbLabelIds[type] = labelId;
      updates[`${type}LabelId`] = labelId;
    }

    // Update DB with any new label IDs
    if (Object.keys(updates).length > 0) {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: updates,
      });
    }

    return dbLabelIds;
  } catch (error) {
    logger.error("Failed to fetch/create thread status labels", { error });
    return dbLabelIds;
  }
}

/**
 * Applies a thread status label to a message/thread while removing all other
 * mutually exclusive thread status labels from the thread.
 * This ensures only one status label is active on a thread at a time.
 */
export async function applyThreadStatusLabel(options: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  status: SystemType;
  provider: EmailProvider;
}): Promise<void> {
  const { emailAccountId, threadId, messageId, status, provider } = options;

  const targetLabelType = statusToLabelType(status);

  logger.info("Applying thread status label", {
    threadId,
    messageId,
    status,
    labelType: targetLabelType,
  });

  // Fetch or create all thread status labels in one go (single provider API call)
  const labelIds = await getOrCreateAllThreadStatusLabels(
    emailAccountId,
    provider,
  );

  const targetLabelId = labelIds[targetLabelType];
  if (!targetLabelId) {
    logger.error("Failed to get or create target label", {
      labelType: targetLabelType,
    });
    return;
  }

  // Remove all other thread status labels from the thread (only if they exist)
  const removePromises = THREAD_STATUS_LABEL_TYPES.filter(
    (type) => type !== targetLabelType,
  )
    .map((type) => labelIds[type])
    .filter((labelId): labelId is string => !!labelId)
    .map((labelId) =>
      provider.removeThreadLabel(threadId, labelId).catch((error) =>
        logger.error("Failed to remove thread label", {
          labelId,
          error,
        }),
      ),
    );

  // Apply the target label to the message
  const applyPromise = provider
    .labelMessage({ messageId, labelId: targetLabelId })
    .catch((error) =>
      logger.error("Failed to apply thread status label", {
        labelType: targetLabelType,
        error,
      }),
    );

  await Promise.all([...removePromises, applyPromise]);

  logger.info("Thread status label applied successfully", {
    threadId,
    status,
  });
}

/**
 * Removes all thread status labels from a thread.
 * Useful when you want to clear the status without setting a new one.
 */
export async function removeAllThreadStatusLabels(options: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
}): Promise<void> {
  const { emailAccountId, threadId, provider } = options;

  // Fetch or create all thread status labels
  const labelIds = await getOrCreateAllThreadStatusLabels(
    emailAccountId,
    provider,
  );

  // Remove all labels that exist
  const removePromises = Object.values(labelIds)
    .filter((labelId): labelId is string => !!labelId)
    .map((labelId) =>
      provider.removeThreadLabel(threadId, labelId).catch((error) =>
        logger.error("Failed to remove thread label", {
          labelId,
          error,
        }),
      ),
    );

  await Promise.all(removePromises);
}
