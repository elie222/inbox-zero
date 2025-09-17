import { capitalCase } from "capital-case";
import { ActionType } from "@prisma/client";
import { getEmailTerminology } from "@/utils/terminology";

export function getActionDisplay(
  action: {
    type: ActionType;
    label?: string | null;
    folderName?: string | null;
    content?: string | null;
  },
  provider: string,
): string {
  const terminology = getEmailTerminology(provider);
  switch (action.type) {
    case ActionType.DRAFT_EMAIL:
      if (action.content) {
        const preview = action.content.substring(0, 10);
        return `Draft Reply: ${preview}${action.content.length > 10 ? "..." : ""}`;
      }
      return "Draft Reply";
    case ActionType.LABEL:
      return action.label
        ? `${terminology.label.action}: ${action.label}`
        : terminology.label.action;
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
      return `Auto-update reply ${terminology.label.singular}`;
    case ActionType.MOVE_FOLDER:
      return action.folderName
        ? `Folder: ${action.folderName}`
        : "Move to folder";
    default:
      // Default to capital case for other action types
      return capitalCase(action.type);
  }
}
