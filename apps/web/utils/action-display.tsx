import { ActionType } from "@/generated/prisma/enums";
import { getEmailTerminology } from "@/utils/terminology";
import { sortActionsByPriority } from "@/utils/action-sort";
import {
  ArchiveIcon,
  BellIcon,
  FolderInputIcon,
  ForwardIcon,
  ReplyIcon,
  ShieldCheckIcon,
  SendIcon,
  TagIcon,
  WebhookIcon,
  FileTextIcon,
  MailIcon,
  NewspaperIcon,
  StarIcon,
} from "lucide-react";
import { truncate } from "@/utils/string";

/**
 * Hide messaging-channel draft entries when an email draft already exists,
 * so users don't see "Draft Reply" repeated once per connected chat app.
 */
export function getVisibleActions<T extends { type: ActionType }>(
  actions: T[],
): T[] {
  const sortedActions = sortActionsByPriority(actions);
  const hasEmailDraft = sortedActions.some(
    (action) => action.type === ActionType.DRAFT_EMAIL,
  );

  return sortedActions.filter(
    (action) =>
      !(action.type === ActionType.DRAFT_MESSAGING_CHANNEL && hasEmailDraft),
  );
}

export function getActionDisplay(
  action: {
    type: ActionType;
    label?: string | null;
    labelId?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
    notificationDestination?: string | null;
  },
  provider: string,
  labels: Array<{ id: string; name: string }>,
): string {
  const terminology = getEmailTerminology(provider);
  switch (action.type) {
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      if (action.content) {
        return `Draft Reply: ${truncate(action.content, 10)}`;
      }
      return "Draft Reply";
    case ActionType.LABEL: {
      let labelName: string | null | undefined = null;

      // Priority 1: Use labelId to look up current name from labels
      if (action.labelId && labels?.length) {
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
      return "Archive";
    case ActionType.MARK_READ:
      return "Mark Read";
    case ActionType.STAR:
      return "Star";
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
    case ActionType.NOTIFY_MESSAGING_CHANNEL:
      return action.notificationDestination
        ? `Notify via ${truncate(action.notificationDestination, 18)}`
        : "Notify";
    case ActionType.NOTIFY_SENDER:
      return "Notify Sender";
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
    case ActionType.DRAFT_MESSAGING_CHANNEL:
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
    case ActionType.STAR:
      return StarIcon;
    case ActionType.CALL_WEBHOOK:
      return WebhookIcon;
    case ActionType.DIGEST:
      return NewspaperIcon;
    case ActionType.NOTIFY_MESSAGING_CHANNEL:
      return BellIcon;
    case ActionType.NOTIFY_SENDER:
      return BellIcon;
    default: {
      const exhaustiveCheck: never = actionType;
      return exhaustiveCheck;
    }
  }
}
