import { env } from "@/env";
import { ActionType } from "@/generated/prisma/enums";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

export function getAvailableActionsForRuleEditor({
  provider,
  existingActionTypes = [],
}: {
  provider: string;
  existingActionTypes?: ActionType[];
}) {
  const includesExistingActionType = (actionType: ActionType) =>
    existingActionTypes.includes(actionType);

  const supportsMoveFolder =
    isMicrosoftProvider(provider) ||
    includesExistingActionType(ActionType.MOVE_FOLDER);
  // The rule editor exposes a single "Draft reply" option for both persisted
  // draft action variants, so the UI only needs the normalized DRAFT_EMAIL type.
  const showsDraftReplyOption =
    !env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED ||
    includesExistingActionType(ActionType.DRAFT_EMAIL) ||
    includesExistingActionType(ActionType.DRAFT_MESSAGING_CHANNEL);

  return [
    ActionType.LABEL,
    ...(supportsMoveFolder ? [ActionType.MOVE_FOLDER] : []),
    ActionType.ARCHIVE,
    ActionType.MARK_READ,
    ...(showsDraftReplyOption ? [ActionType.DRAFT_EMAIL] : []),
    ...getAvailableSendActions(existingActionTypes),
    ActionType.MARK_SPAM,
  ] as ActionType[];
}

export function getExtraAvailableActionsForRuleEditor() {
  return [
    ActionType.DIGEST,
    ...(env.NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED !== false
      ? [ActionType.CALL_WEBHOOK]
      : []),
  ] as ActionType[];
}

function getAvailableSendActions(existingActionTypes: ActionType[]) {
  const sendActions = [
    ActionType.REPLY,
    ActionType.FORWARD,
    ActionType.SEND_EMAIL,
  ] as const;

  if (env.NEXT_PUBLIC_EMAIL_SEND_ENABLED !== false) {
    return [...sendActions];
  }

  return sendActions.filter((actionType) =>
    existingActionTypes.includes(actionType),
  );
}
