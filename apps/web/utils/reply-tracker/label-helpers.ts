import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { SystemType } from "@prisma/client";
import { ActionType } from "@prisma/client";
import {
  CONVERSATION_STATUSES,
  type ConversationStatus,
} from "./conversation-status-config";

const logger = createScopedLogger("reply-tracker-labels");

const THREAD_STATUS_LABEL_TYPES = CONVERSATION_STATUSES.map((s) => s.labelType);

const LABEL_TYPE_TO_NAME = Object.fromEntries(
  CONVERSATION_STATUSES.map((s) => [s.labelType, s.labelName]),
) as Record<ConversationStatus, string>;

function statusToLabelType(status: SystemType): ConversationStatus {
  const found = CONVERSATION_STATUSES.find((s) => s.systemType === status);
  if (!found) throw new Error(`Not a conversation status type: ${status}`);
  return found.labelType;
}

function systemTypeFromLabelType(labelType: ConversationStatus): SystemType {
  const found = CONVERSATION_STATUSES.find((s) => s.labelType === labelType);
  if (!found)
    throw new Error(`Not a conversation status label type: ${labelType}`);
  return found.systemType;
}

/**
 * Fetches or creates all thread status labels in one go.
 * Looks up label IDs from rules, and creates rules+labels if they don't exist.
 */
async function getOrCreateAllThreadStatusLabels(
  emailAccountId: string,
  provider: EmailProvider,
): Promise<Record<ConversationStatus, string | null>> {
  // First, check rules for existing label IDs
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      systemType: {
        in: CONVERSATION_STATUSES.map((s) => s.systemType),
      },
    },
    include: {
      actions: {
        where: { type: ActionType.LABEL },
      },
    },
  });

  const dbLabelIds: Record<ConversationStatus, string | null> = {
    TO_REPLY: null,
    AWAITING_REPLY: null,
    FYI: null,
    ACTIONED: null,
  };

  // Extract label IDs from existing rules
  for (const rule of rules) {
    if (!rule.systemType) continue;
    const labelType = statusToLabelType(rule.systemType);
    const labelAction = rule.actions.find((a) => a.labelId);
    if (labelAction?.labelId) {
      dbLabelIds[labelType] = labelAction.labelId;
    }
  }

  // If all labels exist, return them
  if (Object.values(dbLabelIds).every((id) => id)) {
    return dbLabelIds;
  }

  // Fetch ALL labels from provider in one API call
  try {
    const allLabels = await provider.getLabels();
    const labelsByName = new Map(allLabels.map((l) => [l.name, l.id]));

    // Find or create each missing thread status label
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

      // Create or update the rule with this label
      const systemType = systemTypeFromLabelType(type);
      const existingRule = rules.find((r) => r.systemType === systemType);

      if (existingRule) {
        // Update existing rule's label action
        const labelAction = existingRule.actions.find(
          (a) => a.type === ActionType.LABEL,
        );
        if (labelAction) {
          await prisma.action.update({
            where: { id: labelAction.id },
            data: {
              labelId,
              label: labelName,
            },
          });
        } else {
          // Create new label action for existing rule
          await prisma.action.create({
            data: {
              type: ActionType.LABEL,
              labelId,
              label: labelName,
              ruleId: existingRule.id,
            },
          });
        }
      }
      // Note: If rule doesn't exist, it will be created when user enables it
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
 * Only removes labels that already exist - does not create new labels.
 */
export async function removeAllThreadStatusLabels(options: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
}): Promise<void> {
  const { emailAccountId, threadId, provider } = options;

  // Fetch only existing thread status labels (do not create new ones)
  const labelIds = await getAllThreadStatusLabels(emailAccountId);

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

/**
 * Fetches all thread status labels without creating any new ones.
 * Looks up labels from rules in the database.
 */
async function getAllThreadStatusLabels(
  emailAccountId: string,
): Promise<Record<ConversationStatus, string | null>> {
  // Check rules for existing label IDs
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      systemType: {
        in: CONVERSATION_STATUSES.map((s) => s.systemType),
      },
    },
    include: {
      actions: {
        where: { type: ActionType.LABEL },
      },
    },
  });

  const dbLabelIds: Record<ConversationStatus, string | null> = {
    TO_REPLY: null,
    AWAITING_REPLY: null,
    FYI: null,
    ACTIONED: null,
  };

  // Extract label IDs from existing rules
  for (const rule of rules) {
    if (!rule.systemType) continue;
    const labelType = statusToLabelType(rule.systemType);
    const labelAction = rule.actions.find((a) => a.labelId);
    if (labelAction?.labelId) {
      dbLabelIds[labelType] = labelAction.labelId;
    }
  }

  return dbLabelIds;
}
