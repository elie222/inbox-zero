import type { EmailProvider, EmailLabel } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";
import {
  CONVERSATION_STATUS_TYPES,
  type ConversationStatus,
} from "./conversation-status-config";
import { getRuleLabel } from "@/utils/rule/consts";

type LabelIds = Record<
  ConversationStatus,
  {
    labelId: string | null;
    label: string | null;
  }
>;

export async function removeConflictingThreadStatusLabels({
  emailAccountId,
  threadId,
  systemType,
  provider,
  dbLabels: providedDbLabels,
  providerLabels: providedProviderLabels,
}: {
  emailAccountId: string;
  threadId: string;
  systemType: ConversationStatus;
  provider: EmailProvider;
  dbLabels?: LabelIds;
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

  const [dbLabels, providerLabels] = await Promise.all([
    providedDbLabels ?? getLabelsFromDb(emailAccountId),
    providedProviderLabels ?? provider.getLabels(),
  ]);

  const removeLabelIds: string[] = [];

  for (const type of CONVERSATION_STATUS_TYPES) {
    if (type === systemType) continue;

    let label = dbLabels[type as ConversationStatus];
    if (!label) {
      const l = providerLabels.find((l) => l.name === getRuleLabel(type));
      if (!l?.id) {
        continue;
      }
      label = {
        labelId: l.id,
        label: l.name,
      };
    }
    if (!label.labelId) {
      continue;
    }
    removeLabelIds.push(label.labelId);
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

  const [dbLabels, providerLabels] = await Promise.all([
    getLabelsFromDb(emailAccountId),
    provider.getLabels(),
  ]);

  const addLabel = async () => {
    let targetLabel = dbLabels[systemType];

    if (!targetLabel) {
      const label =
        providerLabels.find((l) => l.name === getRuleLabel(systemType)) ||
        (await provider.createLabel(getRuleLabel(systemType)));
      if (label) {
        targetLabel = {
          labelId: label.id,
          label: label.name,
        };
      }
    }

    if (!targetLabel?.labelId && !targetLabel?.label) {
      logger.error("Failed to get or create target label");
      return;
    }

    return provider
      .labelMessage({
        messageId,
        labelId: targetLabel.labelId ?? "",
        labelName: targetLabel.label ?? "",
      })
      .catch((error) =>
        logger.error("Failed to apply thread status label", {
          labelId: targetLabel.labelId,
          labelName: targetLabel.label,
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
      dbLabels,
      providerLabels,
    }),
    addLabel(),
  ]);

  logger.info("Thread status label applied successfully");
}

async function getLabelsFromDb(emailAccountId: string): Promise<LabelIds> {
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      systemType: { in: CONVERSATION_STATUS_TYPES },
    },
    select: {
      systemType: true,
      actions: {
        where: { type: ActionType.LABEL },
        select: { type: true, labelId: true, label: true },
      },
    },
  });

  const dbLabels: LabelIds = {
    TO_REPLY: { labelId: null, label: null },
    AWAITING_REPLY: { labelId: null, label: null },
    FYI: { labelId: null, label: null },
    ACTIONED: { labelId: null, label: null },
  };

  for (const rule of rules) {
    if (!rule.systemType) continue;
    const labelAction = rule.actions.find((a) => a.type === ActionType.LABEL);
    if (labelAction?.labelId || labelAction?.label) {
      dbLabels[rule.systemType as ConversationStatus] = {
        labelId: labelAction.labelId,
        label: labelAction.label,
      };
    }
  }

  return dbLabels;
}
