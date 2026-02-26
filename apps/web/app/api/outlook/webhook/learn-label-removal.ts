import { ActionType, type SystemType } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { recordLabelRemovalLearning } from "@/utils/rule/record-label-removal-learning";
import type { ParsedMessage } from "@/utils/types";

export async function learnFromOutlookLabelRemoval({
  message,
  emailAccountId,
  logger,
}: {
  message: ParsedMessage;
  emailAccountId: string;
  logger: Logger;
}) {
  const sender = extractEmailAddress(message.headers.from);
  if (!sender || !message.threadId) return;

  if (!message.labelIds || message.labelIds.length === 0) {
    logger.info("Skipping label removal learning - missing label state");
    return;
  }

  const currentLabels = new Set(message.labelIds);

  const executedRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      messageId: message.id,
      threadId: message.threadId,
      rule: { systemType: { not: null } },
      actionItems: {
        some: {
          type: ActionType.LABEL,
          OR: [{ labelId: { not: null } }, { label: { not: null } }],
        },
      },
    },
    select: {
      rule: {
        select: {
          id: true,
          systemType: true,
        },
      },
      actionItems: {
        where: {
          type: ActionType.LABEL,
          OR: [{ labelId: { not: null } }, { label: { not: null } }],
        },
        select: {
          labelId: true,
          label: true,
        },
      },
    },
  });

  const removedRules = new Map<
    string,
    {
      systemType: SystemType | null | undefined;
    }
  >();

  for (const executedRule of executedRules) {
    const ruleId = executedRule.rule?.id;
    if (!ruleId) continue;

    const hasRemovedLabel = executedRule.actionItems.some((action) => {
      const hasMatchingLabelId =
        !!action.labelId && currentLabels.has(action.labelId);
      const hasMatchingLabelName =
        !!action.label && currentLabels.has(action.label);

      return !hasMatchingLabelId && !hasMatchingLabelName;
    });

    if (hasRemovedLabel) {
      removedRules.set(ruleId, {
        systemType: executedRule.rule?.systemType,
      });
    }
  }

  if (removedRules.size === 0) return;

  for (const [ruleId, { systemType }] of removedRules) {
    await recordLabelRemovalLearning({
      sender,
      ruleId,
      systemType,
      messageId: message.id,
      threadId: message.threadId,
      emailAccountId,
      logger,
    });
  }
}
