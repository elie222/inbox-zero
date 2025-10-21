import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";
import {
  CONVERSATION_STATUS_TYPES,
  type ConversationStatus,
} from "./conversation-status-config";
import { getRuleLabel } from "@/utils/rule/consts";

const logger = createScopedLogger("reply-tracker-labels");

/**
 * 1. Applies a thread status label to a message/thread
 * 2. Removes other mutually exclusive thread status labels from the thread
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
  const [dbLabelIds, providerLabels] = await Promise.all([
    getLabelIdsFromDb(emailAccountId),
    provider.getLabels(),
  ]);

  const removeLabels = async () => {
    const removeLabelIds: string[] = [];

    for (const type of CONVERSATION_STATUS_TYPES) {
      if (type === systemType) continue;

      let labelId = dbLabelIds[type as ConversationStatus];
      if (!labelId) {
        const label = providerLabels.find((l) => l.name === getRuleLabel(type));
        if (!label?.id) {
          // Label doesn't exist yet - this is expected if user hasn't set up or used all status types yet
          logger.info("Skipping removal of non-existent label", { type });
          continue;
        }
        labelId = label.id;
      }
      removeLabelIds.push(labelId);
    }

    return provider
      .removeThreadLabels(threadId, removeLabelIds)
      .catch((error) =>
        logger.error("Failed to remove thread label", {
          removeLabelIds,
          error,
        }),
      );
  };

  const addLabel = async () => {
    let targetLabelId = dbLabelIds[systemType];

    if (!targetLabelId) {
      const label =
        providerLabels.find((l) => l.name === getRuleLabel(systemType)) ||
        (await provider.createLabel(getRuleLabel(systemType)));
      if (label) targetLabelId = label.id;

      if (!targetLabelId) {
        logger.error("Failed to get or create target label", { systemType });
        return;
      }
    }

    return provider
      .labelMessage({ messageId, labelId: targetLabelId })
      .catch((error) =>
        logger.error("Failed to apply thread status label", {
          systemType,
          error,
        }),
      );
  };

  await Promise.all([removeLabels(), addLabel()]);

  logger.info("Thread status label applied successfully", {
    threadId,
    systemType,
  });
}

async function getLabelIdsFromDb(emailAccountId: string) {
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

  const dbLabelIds: Record<ConversationStatus, string | null> = {
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
