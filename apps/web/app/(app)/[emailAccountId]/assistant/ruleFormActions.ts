import { ActionType } from "@/generated/prisma/enums";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { isDraftReplyActionType } from "@/utils/actions/draft-reply";
import { sortActionsByPriority } from "@/utils/action-sort";
import {
  denormalizeDraftReplyActions,
  normalizeDraftReplyActions,
} from "@/app/(app)/[emailAccountId]/assistant/draftReplyActions";

type RuleFormAction = CreateRuleBody["actions"][number];

export function getRuleFormActionState({
  actions,
  webhookActionsEnabled,
}: {
  actions: RuleFormAction[];
  webhookActionsEnabled: boolean;
}) {
  const editableActions = actions.filter(
    (action) =>
      webhookActionsEnabled || action.type !== ActionType.CALL_WEBHOOK,
  );

  return {
    actions: normalizeDraftReplyActions(
      sortActionsByPriority(
        editableActions
          .filter(
            (action) =>
              action.type !== ActionType.DIGEST &&
              action.type !== ActionType.NOTIFY_MESSAGING_CHANNEL,
          )
          .map((action) => ({
            ...action,
            content: {
              ...action.content,
              setManually: !!action.content?.value,
            },
          })),
      ),
    ),
    digest: editableActions.some((action) => action.type === ActionType.DIGEST),
    notifyMessagingChannelId:
      editableActions.find(
        (action) => action.type === ActionType.NOTIFY_MESSAGING_CHANNEL,
      )?.messagingChannelId ?? null,
    editableActionTypes: editableActions.map((action) => action.type),
  };
}

export function buildPersistedRuleActions({
  formActions,
  originalActions,
  includeDigestAction,
  notifyMessagingChannelId,
  webhookActionsEnabled,
}: {
  formActions: RuleFormAction[];
  originalActions: RuleFormAction[];
  includeDigestAction: boolean;
  notifyMessagingChannelId: string | null | undefined;
  webhookActionsEnabled: boolean;
}) {
  const actions = removeDuplicateActionIds(
    denormalizeDraftReplyActions(
      formActions.map((action) => {
        if (
          isDraftReplyActionType(action.type) &&
          !action.content?.setManually
        ) {
          return { ...action, content: { value: "", ai: false } };
        }

        return action;
      }),
    ),
  );

  if (!webhookActionsEnabled) {
    actions.push(
      ...originalActions.filter(
        (action) => action.type === ActionType.CALL_WEBHOOK,
      ),
    );
  }

  const existingDigestAction = originalActions.find(
    (action) => action.type === ActionType.DIGEST,
  );
  if (includeDigestAction) {
    actions.push({
      id: existingDigestAction?.id,
      type: ActionType.DIGEST,
    });
  }

  if (notifyMessagingChannelId) {
    const existingNotifyAction = originalActions.find(
      (action) => action.type === ActionType.NOTIFY_MESSAGING_CHANNEL,
    );
    actions.push({
      id: existingNotifyAction?.id,
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      messagingChannelId: notifyMessagingChannelId,
    });
  }

  return restorePersistedActionSequence({ actions, originalActions });
}

function removeDuplicateActionIds(actions: RuleFormAction[]) {
  const seenIds = new Set<string>();

  return actions.map((action) => {
    if (!action.id) return action;
    if (seenIds.has(action.id)) return { ...action, id: undefined };

    seenIds.add(action.id);
    return action;
  });
}

function restorePersistedActionSequence({
  actions,
  originalActions,
}: {
  actions: RuleFormAction[];
  originalActions: RuleFormAction[];
}) {
  const originalIndexById = new Map(
    originalActions.flatMap((action, index) =>
      action.id ? [[action.id, index] as const] : [],
    ),
  );

  if (originalIndexById.size === 0) return actions;

  const existing: RuleFormAction[] = [];
  const added: RuleFormAction[] = [];

  for (const action of actions) {
    if (action.id && originalIndexById.has(action.id)) {
      existing.push(action);
    } else {
      added.push(action);
    }
  }

  if (existing.length === 0) return actions;

  existing.sort(
    (a, b) =>
      (originalIndexById.get(a.id ?? "") ?? 0) -
      (originalIndexById.get(b.id ?? "") ?? 0),
  );

  return [...existing, ...added];
}
