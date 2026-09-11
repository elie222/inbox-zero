import { ActionType } from "@/generated/prisma/enums";

export const SENDING_ACTION_TYPES = [
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,
] satisfies ActionType[];

export function isSendingActionType(actionType: ActionType) {
  return SENDING_ACTION_TYPES.some(
    (sendingActionType) => sendingActionType === actionType,
  );
}
