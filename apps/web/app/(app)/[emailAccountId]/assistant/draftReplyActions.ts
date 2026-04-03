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

      const nextAction = actions[index + 1];
      if (nextAction?.type === ActionType.DRAFT_MESSAGING_CHANNEL) {
        normalizedActions.push(
          buildDraftMessagingAction({
            action: nextAction,
            sourceAction: action,
            messagingChannelId: nextAction.messagingChannelId ?? null,
          }),
        );
        index += 1;
      }

      continue;
    }

    if (action.type === ActionType.DRAFT_MESSAGING_CHANNEL) {
      normalizedActions.push(
        buildDraftMessagingAction({
          action,
          sourceAction: action,
          messagingChannelId: action.messagingChannelId ?? null,
        }),
      );
      continue;
    }

    normalizedActions.push(action);
  }

  return normalizedActions;
}

export function buildVisibleDraftReplyGroups(actions: RuleFormAction[]) {
  const groups: Array<{
    primaryIndex: number;
    draftMessagingIndex: number | null;
    actionType: ActionType;
  }> = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (!action) continue;

    if (action.type === ActionType.DRAFT_EMAIL) {
      const nextAction = actions[index + 1];
      if (nextAction?.type === ActionType.DRAFT_MESSAGING_CHANNEL) {
        groups.push({
          primaryIndex: index,
          draftMessagingIndex: index + 1,
          actionType: ActionType.DRAFT_EMAIL,
        });
        index += 1;
        continue;
      }
    }

    groups.push({
      primaryIndex: index,
      draftMessagingIndex: null,
      actionType: isDraftReplyActionType(action.type)
        ? ActionType.DRAFT_EMAIL
        : action.type,
    });
  }

  return groups;
}

export function getDraftReplyDelivery({
  primaryAction,
  draftMessagingAction,
}: {
  primaryAction?: RuleFormAction;
  draftMessagingAction?: RuleFormAction | null;
}): DraftReplyDelivery {
  if (draftMessagingAction) return "EMAIL_AND_MESSAGING";
  if (primaryAction?.type === ActionType.DRAFT_MESSAGING_CHANNEL)
    return "MESSAGING";
  return "EMAIL";
}

export function getDraftReplyMessagingChannelId({
  primaryAction,
  draftMessagingAction,
}: {
  primaryAction?: RuleFormAction;
  draftMessagingAction?: RuleFormAction | null;
}) {
  if (draftMessagingAction?.messagingChannelId) {
    return draftMessagingAction.messagingChannelId;
  }

  if (primaryAction?.type === ActionType.DRAFT_MESSAGING_CHANNEL) {
    return primaryAction.messagingChannelId ?? null;
  }

  return null;
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
