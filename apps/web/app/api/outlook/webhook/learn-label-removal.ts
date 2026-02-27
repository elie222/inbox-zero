import { ActionType, type SystemType } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { recordLabelRemovalLearning } from "@/utils/rule/record-label-removal-learning";
import type { ParsedMessage } from "@/utils/types";

const LABEL_OR_FOLDER_ACTION_FILTER = {
  OR: [
    {
      type: ActionType.LABEL,
      OR: [{ labelId: { not: null } }, { label: { not: null } }],
    },
    {
      type: ActionType.MOVE_FOLDER,
      OR: [{ folderId: { not: null } }, { folderName: { not: null } }],
    },
  ],
} as const;

export async function learnFromOutlookCategoryReversal({
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
    logger.info("Skipping category reversal learning - missing label state");
    return;
  }

  const currentLabels = new Set(message.labelIds);
  const isInInbox = currentLabels.has("INBOX");

  const executedRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      messageId: message.id,
      threadId: message.threadId,
      rule: { systemType: { not: null } },
      actionItems: { some: LABEL_OR_FOLDER_ACTION_FILTER },
    },
    select: {
      rule: {
        select: {
          id: true,
          systemType: true,
        },
      },
      actionItems: {
        where: LABEL_OR_FOLDER_ACTION_FILTER,
        select: {
          type: true,
          labelId: true,
          label: true,
          folderId: true,
          folderName: true,
        },
      },
    },
  });

  const resolvedLabelIdsByRuleAndName = await getResolvedLabelIdsByRuleAndName(
    executedRules,
    emailAccountId,
  );

  const removedRules = new Map<
    string,
    {
      systemType: SystemType | null | undefined;
    }
  >();

  for (const executedRule of executedRules) {
    const ruleId = executedRule.rule?.id;
    if (!ruleId) continue;

    const labelActions = executedRule.actionItems.filter(
      (a) => a.type === ActionType.LABEL,
    );
    const folderActions = executedRule.actionItems.filter(
      (a) => a.type === ActionType.MOVE_FOLDER,
    );

    const hasRemovedLabel = labelActions.some((action) => {
      const resolvedLabelIds = resolveActionLabelIds({
        action,
        ruleId,
        resolvedLabelIdsByRuleAndName,
      });

      // Without a stable ID for this action label we cannot tell if the label
      // was removed or if message labels are represented as IDs.
      if (resolvedLabelIds.length === 0) return false;

      const hasMatchingLabelId = resolvedLabelIds.some((labelId) =>
        currentLabels.has(labelId),
      );
      const hasMatchingLabelName =
        !!action.label && currentLabels.has(action.label);

      return !hasMatchingLabelId && !hasMatchingLabelName;
    });

    // For MOVE_FOLDER actions: if the message is back in the inbox,
    // the user has undone the folder move (Outlook messages can only
    // be in one folder at a time).
    const hasReversedFolderMove =
      isInInbox && folderActions.some((a) => !!(a.folderId || a.folderName));

    if (hasRemovedLabel || hasReversedFolderMove) {
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

async function getResolvedLabelIdsByRuleAndName(
  executedRules: Array<{
    rule: { id: string; systemType: SystemType | null } | null;
    actionItems: Array<{ labelId: string | null; label: string | null }>;
  }>,
  emailAccountId: string,
) {
  const ruleIds = new Set<string>();
  const unresolvedLabelNames = new Set<string>();

  for (const executedRule of executedRules) {
    const ruleId = executedRule.rule?.id;
    if (!ruleId) continue;
    ruleIds.add(ruleId);

    for (const action of executedRule.actionItems) {
      if (!action.labelId && action.label) {
        unresolvedLabelNames.add(action.label);
      }
    }
  }

  if (ruleIds.size === 0 || unresolvedLabelNames.size === 0) {
    return new Map<string, Map<string, Set<string>>>();
  }

  const actions = await prisma.action.findMany({
    where: {
      rule: { emailAccountId },
      ruleId: { in: [...ruleIds] },
      type: ActionType.LABEL,
      label: { in: [...unresolvedLabelNames] },
      labelId: { not: null },
    },
    select: {
      ruleId: true,
      label: true,
      labelId: true,
    },
  });

  const resolvedLabelIdsByRuleAndName = new Map<
    string,
    Map<string, Set<string>>
  >();

  for (const action of actions) {
    if (!action.label || !action.labelId) continue;

    const labelsByName =
      resolvedLabelIdsByRuleAndName.get(action.ruleId) || new Map();
    const labelIds = labelsByName.get(action.label) || new Set();
    labelIds.add(action.labelId);

    labelsByName.set(action.label, labelIds);
    resolvedLabelIdsByRuleAndName.set(action.ruleId, labelsByName);
  }

  return resolvedLabelIdsByRuleAndName;
}

function resolveActionLabelIds({
  action,
  ruleId,
  resolvedLabelIdsByRuleAndName,
}: {
  action: { labelId: string | null; label: string | null };
  ruleId: string;
  resolvedLabelIdsByRuleAndName: Map<string, Map<string, Set<string>>>;
}) {
  const resolvedLabelIds = new Set<string>();

  if (action.labelId) {
    resolvedLabelIds.add(action.labelId);
  }

  if (action.label) {
    const labelIds =
      resolvedLabelIdsByRuleAndName.get(ruleId)?.get(action.label) || new Set();
    for (const labelId of labelIds) {
      resolvedLabelIds.add(labelId);
    }
  }

  return [...resolvedLabelIds];
}
