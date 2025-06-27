import { ActionType } from "@prisma/client";

// Action types that do NOT support delayed execution
const UNSUPPORTED_DELAYED_ACTIONS: ActionType[] = [
  ActionType.MARK_SPAM,
  ActionType.TRACK_THREAD,
  ActionType.DIGEST,
];

/**
 * Check if an action type supports delayed execution
 * This is a client-safe utility function
 */
export function canActionBeDelayed(actionType: ActionType): boolean {
  return !UNSUPPORTED_DELAYED_ACTIONS.includes(actionType);
}
