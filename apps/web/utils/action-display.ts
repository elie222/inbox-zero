import { capitalCase } from "capital-case";
import { ActionType } from "@prisma/client";

export function getActionDisplay(action: {
  type: ActionType;
  label?: string | null;
}): string {
  switch (action.type) {
    case ActionType.DRAFT_EMAIL:
      return "Draft Reply";
    case ActionType.LABEL:
      return action.label ? `Label: ${action.label}` : "Label";
    case ActionType.ARCHIVE:
      return "Skip Inbox";
    case ActionType.MARK_READ:
      return "Mark Read";
    case ActionType.MARK_SPAM:
      return "Mark Spam";
    case ActionType.SEND_EMAIL:
      return "Send Email";
    case ActionType.CALL_WEBHOOK:
      return "Call Webhook";
    case ActionType.TRACK_THREAD:
      return "Auto-update reply label";
    default:
      // Default to capital case for other action types
      return capitalCase(action.type);
  }
}
