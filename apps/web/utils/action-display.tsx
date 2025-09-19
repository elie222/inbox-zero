import { capitalCase } from "capital-case";
import { ActionType } from "@prisma/client";
import { getEmailTerminology } from "@/utils/terminology";
import {
  ArchiveIcon,
  FolderInputIcon,
  ForwardIcon,
  MailOpenIcon,
  PenIcon,
  ReplyIcon,
  ShieldCheckIcon,
  SendIcon,
  TagIcon,
  WebhookIcon,
  FileTextIcon,
  EyeIcon,
  MailIcon,
  NewspaperIcon,
} from "lucide-react";

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
        ? `${terminology.label.action} as '${action.label}'`
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
        ? `Move to '${action.folderName}' folder`
        : "Move to folder";
    default:
      // Default to capital case for other action types
      return capitalCase(action.type);
  }
}

export function getActionIcon(actionType: ActionType) {
  switch (actionType) {
    case ActionType.LABEL:
      return TagIcon;
    case ActionType.ARCHIVE:
      return ArchiveIcon;
    case ActionType.MOVE_FOLDER:
      return FolderInputIcon;
    case ActionType.DRAFT_EMAIL:
      return FileTextIcon;
    case ActionType.REPLY:
      return ReplyIcon;
    case ActionType.SEND_EMAIL:
      return SendIcon;
    case ActionType.FORWARD:
      return ForwardIcon;
    case ActionType.MARK_SPAM:
      return ShieldCheckIcon;
    case ActionType.MARK_READ:
      return MailIcon;
    case ActionType.CALL_WEBHOOK:
      return WebhookIcon;
    case ActionType.TRACK_THREAD:
      return EyeIcon;
    case ActionType.DIGEST:
      return NewspaperIcon;
    default: {
      const exhaustiveCheck: never = actionType;
      return exhaustiveCheck;
    }
  }
}
