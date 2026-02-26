import { ActionType } from "@/generated/prisma/enums";
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

  const currentLabels = new Set(message.labelIds || []);

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

  const removedRuleIds = new Set<string>();

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
      removedRuleIds.add(ruleId);
    }
  }

  if (removedRuleIds.size === 0) return;

  for (const executedRule of executedRules) {
    const ruleId = executedRule.rule?.id;
    if (!ruleId || !removedRuleIds.has(ruleId)) continue;

    await recordLabelRemovalLearning({
      sender,
      ruleId,
      systemType: executedRule.rule?.systemType,
      messageId: message.id,
      threadId: message.threadId,
      emailAccountId,
      logger,
    });
  }
}
