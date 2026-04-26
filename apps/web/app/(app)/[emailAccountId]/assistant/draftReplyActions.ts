import { ActionType } from "@/generated/prisma/enums";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { isDraftReplyActionType } from "@/utils/actions/draft-reply";

type RuleFormAction = CreateRuleBody["actions"][number];
export type DraftReplyDelivery = "EMAIL" | "MESSAGING" | "EMAIL_AND_MESSAGING";

export function normalizeDraftReplyActions(actions: RuleFormAction[]) {
  return actions.map((action) => {
    if (
      action.type === ActionType.DRAFT_EMAIL &&
      action.messagingChannelId?.trim()
    ) {
      return {
        ...action,
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
      };
    }

    return action;
  });
}

export function denormalizeDraftReplyActions(actions: RuleFormAction[]) {
  const normalizedActions: RuleFormAction[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];

    if (action.type === ActionType.DRAFT_EMAIL) {
      normalizedActions.push({
        ...action,
        messagingChannelId: null,
      });

      const { draftMessagingIndexes, nextIndex } = collectDraftMessagingIndexes(
        actions,
        index + 1,
      );
      if (draftMessagingIndexes.length > 0) {
        for (const draftMessagingIndex of draftMessagingIndexes) {
          const messagingAction = actions[draftMessagingIndex];
          if (!messagingAction) continue;
          normalizedActions.push(
            buildDraftMessagingAction({
              action: messagingAction,
              sourceAction: action,
              messagingChannelId: messagingAction.messagingChannelId ?? null,
            }),
          );
        }

        index = nextIndex - 1;
      }

      continue;
    }

    if (action.type === ActionType.DRAFT_MESSAGING_CHANNEL) {
      const { draftMessagingIndexes, nextIndex } = collectDraftMessagingIndexes(
        actions,
        index,
      );
      for (const draftMessagingIndex of draftMessagingIndexes) {
        const messagingAction = actions[draftMessagingIndex];
        if (!messagingAction) continue;
        normalizedActions.push(
          buildDraftMessagingAction({
            action: messagingAction,
            sourceAction: action,
            messagingChannelId: messagingAction.messagingChannelId ?? null,
          }),
        );
      }

      index = nextIndex - 1;
      continue;
    }

    normalizedActions.push(action);
  }

  return normalizedActions;
}

export function buildVisibleDraftReplyGroups(actions: RuleFormAction[]) {
  const groups: Array<{
    primaryIndex: number;
    draftMessagingIndexes: number[];
    actionType: ActionType;
  }> = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (!action) continue;

    if (action.type === ActionType.DRAFT_EMAIL) {
      const { draftMessagingIndexes, nextIndex } = collectDraftMessagingIndexes(
        actions,
        index + 1,
      );

      groups.push({
        primaryIndex: index,
        draftMessagingIndexes,
        actionType: ActionType.DRAFT_EMAIL,
      });
      index = nextIndex - 1;
      continue;
    }

    if (action.type === ActionType.DRAFT_MESSAGING_CHANNEL) {
      const { draftMessagingIndexes, nextIndex } = collectDraftMessagingIndexes(
        actions,
        index + 1,
      );

      groups.push({
        primaryIndex: index,
        draftMessagingIndexes,
        actionType: ActionType.DRAFT_EMAIL,
      });
      index = nextIndex - 1;
      continue;
    }

    groups.push({
      primaryIndex: index,
      draftMessagingIndexes: [],
      actionType: isDraftReplyActionType(action.type)
        ? ActionType.DRAFT_EMAIL
        : action.type,
    });
  }

  return groups;
}

export function getDraftReplyDelivery({
  primaryAction,
  draftMessagingActions,
}: {
  primaryAction?: RuleFormAction;
  draftMessagingActions?: RuleFormAction[] | null;
}): DraftReplyDelivery {
  const hasMessagingDestinations =
    getDraftReplyMessagingChannelIds({
      primaryAction,
      draftMessagingActions,
    }).length > 0;

  if (!hasMessagingDestinations) return "EMAIL";
  if (primaryAction?.type === ActionType.DRAFT_MESSAGING_CHANNEL)
    return "MESSAGING";
  return "EMAIL_AND_MESSAGING";
}

export function getDraftReplyMessagingChannelIds({
  primaryAction,
  draftMessagingActions,
}: {
  primaryAction?: RuleFormAction;
  draftMessagingActions?: RuleFormAction[] | null;
}) {
  const messagingChannelIds = new Set<string>();

  if (primaryAction?.type === ActionType.DRAFT_MESSAGING_CHANNEL) {
    const primaryChannelId = primaryAction.messagingChannelId?.trim();
    if (primaryChannelId) messagingChannelIds.add(primaryChannelId);
  }

  for (const action of draftMessagingActions ?? []) {
    const messagingChannelId = action.messagingChannelId?.trim();
    if (messagingChannelId) messagingChannelIds.add(messagingChannelId);
  }

  return Array.from(messagingChannelIds);
}

export function buildDraftEmailAction(action: RuleFormAction): RuleFormAction {
  return {
    ...action,
    type: ActionType.DRAFT_EMAIL,
    messagingChannelId: null,
  };
}

export function buildDraftMessagingAction({
  action,
  sourceAction,
  messagingChannelId,
}: {
  action: RuleFormAction;
  sourceAction: RuleFormAction;
  messagingChannelId: string | null;
}): RuleFormAction {
  return {
    ...action,
    type: ActionType.DRAFT_MESSAGING_CHANNEL,
    messagingChannelId,
    subject: sourceAction.subject,
    content: sourceAction.content,
    to: sourceAction.to,
    cc: sourceAction.cc,
    bcc: sourceAction.bcc,
    delayInMinutes: sourceAction.delayInMinutes,
    staticAttachments: sourceAction.staticAttachments,
  };
}

function collectDraftMessagingIndexes(
  actions: RuleFormAction[],
  startIndex: number,
) {
  const draftMessagingIndexes: number[] = [];
  let nextIndex = startIndex;

  while (actions[nextIndex]?.type === ActionType.DRAFT_MESSAGING_CHANNEL) {
    draftMessagingIndexes.push(nextIndex);
    nextIndex += 1;
  }

  return { draftMessagingIndexes, nextIndex };
}
