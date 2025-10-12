import { ActionType } from "@prisma/client";
import { getEmailTerminology } from "@/utils/terminology";
import {
  ArchiveIcon,
  FolderInputIcon,
  ForwardIcon,
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
import { truncate } from "@/utils/string";

export function getActionDisplay(
  action: {
    type: ActionType;
    label?: string | null;
    labelId?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
  },
  provider: string,
  labels: Array<{ id: string; name: string }>,
): string {
  const terminology = getEmailTerminology(provider);
  switch (action.type) {
    case ActionType.DRAFT_EMAIL:
      if (action.content) {
        return `Draft Reply: ${truncate(action.content, 10)}`;
      }
      return "Draft Reply";
    case ActionType.LABEL: {
      let labelName: string | null | undefined = null;

      // Priority 1: Use labelId to look up current name from labels
      if (action.labelId && labels) {
        const foundLabel = labels.find((l) => l.id === action.labelId);
        if (foundLabel) {
          labelName = foundLabel.name;
        }
      }

      // Priority 2: Fallback to stored label name (may be outdated but better than nothing)
      if (!labelName && action.label) {
        labelName = action.label;
      }

      return labelName
        ? `${terminology.label.action} as '${truncate(labelName, 15)}'`
        : terminology.label.action;
    }
    case ActionType.ARCHIVE:
      return "Skip Inbox";
    case ActionType.MARK_READ:
      return "Mark Read";
    case ActionType.MARK_SPAM:
      return "Mark Spam";
    case ActionType.REPLY:
      return "Reply";
    case ActionType.SEND_EMAIL:
      return action.to
        ? `Send Email to ${truncate(action.to, 8)}`
        : "Send Email";
    case ActionType.FORWARD:
      return action.to ? `Forward to ${truncate(action.to, 8)}` : "Forward";
    case ActionType.MOVE_FOLDER:
      return action.folderName
        ? `Move to '${action.folderName}' folder`
        : "Move to folder";
    case ActionType.DIGEST:
      return "Digest";
    case ActionType.CALL_WEBHOOK:
      return "Call Webhook";
    default: {
      const exhaustiveCheck: never = action.type;
      return exhaustiveCheck;
    }
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
    case ActionType.DIGEST:
      return NewspaperIcon;
    default: {
      const exhaustiveCheck: never = actionType;
      return exhaustiveCheck;
    }
  }
}
