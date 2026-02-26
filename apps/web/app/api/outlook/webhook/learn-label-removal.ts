import { ActionType, GroupItemSource } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { shouldLearnFromLabelRemoval } from "@/utils/rule/consts";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
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
    const systemType = executedRule.rule?.systemType;
    if (!ruleId || !systemType || !shouldLearnFromLabelRemoval(systemType)) {
      continue;
    }

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

  logger.info("Processing Outlook label removal for learning", {
    ruleCount: removedRuleIds.size,
  });
  logger.trace("Outlook label removal sender", {
    from: sender,
  });

  for (const ruleId of removedRuleIds) {
    await saveLearnedPattern({
      emailAccountId,
      from: sender,
      ruleId,
      exclude: true,
      logger,
      messageId: message.id,
      threadId: message.threadId,
      reason: "Label removed",
      source: GroupItemSource.LABEL_REMOVED,
    });
  }
}
