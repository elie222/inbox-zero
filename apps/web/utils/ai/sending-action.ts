import { ActionType } from "@/generated/prisma/enums";

export const SENDING_ACTION_TYPES: ActionType[] = [
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,
];

export function isSendingActionType(actionType: ActionType) {
  return SENDING_ACTION_TYPES.includes(actionType);
}
