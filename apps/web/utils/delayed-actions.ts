import { ActionType } from "@prisma/client";

// Action types that support delayed execution
const SUPPORTED_DELAYED_ACTIONS: ActionType[] = [
  ActionType.ARCHIVE,
  ActionType.LABEL,
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,
  ActionType.DRAFT_EMAIL,
  ActionType.CALL_WEBHOOK,
  ActionType.MARK_READ,
  ActionType.MOVE_FOLDER,
];

export function canActionBeDelayed(actionType: ActionType): boolean {
  return SUPPORTED_DELAYED_ACTIONS.includes(actionType);
}
