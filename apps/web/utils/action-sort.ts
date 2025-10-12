import sortBy from "lodash/sortBy";
import { ActionType } from "@prisma/client";

/**
 * Defines the priority order for action types when displaying them.
 * Lower index = higher priority (appears first).
 */
const ACTION_TYPE_PRIORITY_ORDER: ActionType[] = [
  ActionType.LABEL,

  ActionType.MOVE_FOLDER,
  ActionType.ARCHIVE,
  ActionType.MARK_READ,

  ActionType.DRAFT_EMAIL,
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,

  ActionType.DIGEST,

  ActionType.MARK_SPAM,
  ActionType.CALL_WEBHOOK,
  ActionType.TRACK_THREAD,
];

/**
 * Gets the priority index for an action type.
 * Lower numbers indicate higher priority (appears first).
 */
function getActionTypePriority(actionType: ActionType): number {
  const index = ACTION_TYPE_PRIORITY_ORDER.indexOf(actionType);
  // If action type is not in our priority list, give it a very low priority
  return index === -1 ? 999 : index;
}

/**
 * Sorts an array of actions by their type priority.
 * Actions with lower priority numbers (higher priority) appear first.
 */
export function sortActionsByPriority<T extends { type: ActionType }>(
  actions: T[],
): T[] {
  return sortBy(
    actions,
    [(action) => getActionTypePriority(action.type)],
    ["asc"],
  );
}
