import type { EmailProvider, EmailLabel } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";
import {
  CONVERSATION_STATUS_TYPES,
  type ConversationStatus,
} from "./conversation-status-config";
import { getRuleLabel } from "@/utils/rule/consts";

type LabelIds = Record<ConversationStatus, string | null>;

export async function removeConflictingThreadStatusLabels({
  emailAccountId,
  threadId,
  systemType,
  provider,
  dbLabelIds: providedDbLabelIds,
  providerLabels: providedProviderLabels,
}: {
  emailAccountId: string;
  threadId: string;
  systemType: ConversationStatus;
  provider: EmailProvider;
  dbLabelIds?: LabelIds;
  providerLabels?: EmailLabel[];
}): Promise<void> {
  const logger = createScopedLogger("removeConflictingThreadStatusLabels").with(
    {
      emailAccountId,
      threadId,
      systemType,
      provider,
    },
  );

  const [dbLabelIds, providerLabels] = await Promise.all([
    providedDbLabelIds ?? getLabelIdsFromDb(emailAccountId),
    providedProviderLabels ?? provider.getLabels(),
  ]);

  const removeLabelIds: string[] = [];

  for (const type of CONVERSATION_STATUS_TYPES) {
    if (type === systemType) continue;

    let labelId = dbLabelIds[type as ConversationStatus];
    if (!labelId) {
      const label = providerLabels.find((l) => l.name === getRuleLabel(type));
      if (!label?.id) {
        continue;
      }
      labelId = label.id;
    }
    removeLabelIds.push(labelId);
  }

  if (removeLabelIds.length === 0) {
    logger.info("No conflicting labels to remove");
    return;
  }

  await provider.removeThreadLabels(threadId, removeLabelIds).catch((error) =>
    logger.error("Failed to remove conflicting thread labels", {
      removeLabelIds,
      error,
    }),
  );

  logger.info("Removed conflicting thread status labels", {
    removedCount: removeLabelIds.length,
  });
}

/**
 * Applies a thread status label to a message/thread.
 * 1. Removes other mutually exclusive thread status labels from the thread
 * 2. Adds the new label
 *
 * Used primarily for outbound reply tracking where we both remove and add.
 */
export async function applyThreadStatusLabel({
  emailAccountId,
  threadId,
  messageId,
  systemType,
  provider,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  systemType: ConversationStatus;
  provider: EmailProvider;
}): Promise<void> {
  const logger = createScopedLogger("applyThreadStatusLabel").with({
    emailAccountId,
    threadId,
    messageId,
    systemType,
    provider,
  });

  const [dbLabelIds, providerLabels] = await Promise.all([
    getLabelIdsFromDb(emailAccountId),
    provider.getLabels(),
  ]);

  const addLabel = async () => {
    let targetLabelId = dbLabelIds[systemType];

    if (!targetLabelId) {
      const label =
        providerLabels.find((l) => l.name === getRuleLabel(systemType)) ||
        (await provider.createLabel(getRuleLabel(systemType)));
      if (label) targetLabelId = label.id;

      if (!targetLabelId) {
        logger.error("Failed to get or create target label");
        return;
      }
    }

    return provider
      .labelMessage({ messageId, labelId: targetLabelId })
      .catch((error) =>
        logger.error("Failed to apply thread status label", {
          labelId: targetLabelId,
          error,
        }),
      );
  };

  await Promise.all([
    removeConflictingThreadStatusLabels({
      emailAccountId,
      threadId,
      systemType,
      provider,
      dbLabelIds,
      providerLabels,
    }),
    addLabel(),
  ]);

  logger.info("Thread status label applied successfully");
}

async function getLabelIdsFromDb(emailAccountId: string): Promise<LabelIds> {
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      systemType: { in: CONVERSATION_STATUS_TYPES },
    },
    select: {
      systemType: true,
      actions: {
        where: { type: ActionType.LABEL },
        select: { type: true, labelId: true },
      },
    },
  });

  const dbLabelIds: LabelIds = {
    TO_REPLY: null,
    AWAITING_REPLY: null,
    FYI: null,
    ACTIONED: null,
  };

  for (const rule of rules) {
    if (!rule.systemType) continue;
    const labelAction = rule.actions.find((a) => a.type === ActionType.LABEL);
    if (labelAction?.labelId) {
      dbLabelIds[rule.systemType as ConversationStatus] = labelAction.labelId;
    }
  }

  return dbLabelIds;
}
