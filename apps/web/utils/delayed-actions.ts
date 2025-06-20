import { ActionType } from "@prisma/client";

// Supported action types for delayed execution
const SUPPORTED_DELAYED_ACTIONS: ActionType[] = [
  ActionType.ARCHIVE,
  ActionType.LABEL,
  ActionType.MARK_READ,
  ActionType.MARK_SPAM,
];

/**
 * Check if an action type supports delayed execution
 * This is a client-safe utility function
 */
export function isSupportedDelayedAction(actionType: ActionType): boolean {
  return SUPPORTED_DELAYED_ACTIONS.includes(actionType);
}
