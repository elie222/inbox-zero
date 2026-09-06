import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  Clock3Icon,
  ExternalLinkIcon,
  FolderInputIcon,
  ForwardIcon,
  MailXIcon,
  MailIcon,
  MailOpenIcon,
  ShieldAlertIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";
import type { Command } from "@/lib/commands/types";
import { getShortcutHint } from "@/lib/shortcuts/registry";

type MailCommandActions = {
  archive: () => void;
  forward?: () => void;
  label?: () => void;
  markRead?: () => void;
  markSpam?: () => void;
  markUnread?: () => void;
  move?: () => void;
  openSnooze?: () => void;
  openExternal?: () => void;
  trash?: () => void;
  toggleAutoArchive?: () => void;
  unsubscribe?: () => void;
};

export function buildMailCommandPalette({
  actions,
  hasRead,
  hasUnread,
  isAutoArchived = false,
  isAutoArchiveDisabled = false,
  isUnsubscribeDisabled = false,
  openExternalLabel = "Open in email provider",
  targetCount,
}: {
  actions: MailCommandActions;
  hasRead: boolean;
  hasUnread: boolean;
  isAutoArchived?: boolean;
  isAutoArchiveDisabled?: boolean;
  isUnsubscribeDisabled?: boolean;
  openExternalLabel?: string;
  targetCount: number;
}): Command[] {
  if (targetCount === 0) return [];

  const commands: Command[] = [
    {
      id: "mail-archive",
      label:
        targetCount === 1
          ? "Archive conversation"
          : `Archive ${targetCount} conversations`,
      icon: ArchiveIcon,
      shortcut: "E",
      section: "actions",
      priority: 0,
      keywords: ["archive", "remove", "inbox"],
      action: actions.archive,
    },
  ];

  if (targetCount === 1 && actions.forward) {
    commands.push({
      id: "mail-forward",
      label: "Forward",
      icon: ForwardIcon,
      shortcut: getShortcutHint("forward"),
      section: "actions",
      priority: 1,
      keywords: ["forward", "send", "share"],
      action: actions.forward,
    });
  }

  if (actions.label) {
    commands.push({
      id: "mail-label",
      label: "Label",
      icon: TagIcon,
      shortcut: getShortcutHint("label"),
      section: "actions",
      priority: 2,
      keywords: ["label", "tag", "categorize"],
      action: actions.label,
    });
  }

  if (actions.move) {
    commands.push({
      id: "mail-move",
      label: "Move",
      icon: FolderInputIcon,
      shortcut: getShortcutHint("move"),
      section: "actions",
      priority: 3,
      keywords: ["move", "folder"],
      action: actions.move,
    });
  }

  if (hasUnread && actions.markRead) {
    commands.push({
      id: "mail-mark-read",
      label: targetCount === 1 ? "Mark as read" : `Mark ${targetCount} as read`,
      icon: MailOpenIcon,
      section: "actions",
      priority: 1,
      keywords: ["read", "seen", "open"],
      action: actions.markRead,
    });
  }

  if (hasRead && actions.markUnread) {
    commands.push({
      id: "mail-mark-unread",
      label:
        targetCount === 1 ? "Mark as unread" : `Mark ${targetCount} as unread`,
      icon: MailIcon,
      shortcut: getShortcutHint("markUnread"),
      section: "actions",
      priority: 2,
      keywords: ["unread", "unseen", "new"],
      action: actions.markUnread,
    });
  }

  if (actions.openSnooze) {
    commands.push({
      id: "mail-snooze",
      label:
        targetCount === 1 ? "Snooze" : `Snooze ${targetCount} conversations`,
      icon: Clock3Icon,
      shortcut: getShortcutHint("snooze"),
      section: "actions",
      priority: 3,
      keywords: ["snooze", "later", "remind"],
      action: actions.openSnooze,
      closeOnSelect: false,
    });
  }

  if (actions.trash) {
    commands.push({
      id: "mail-delete",
      label:
        targetCount === 1
          ? "Delete conversation"
          : `Delete ${targetCount} conversations`,
      icon: Trash2Icon,
      shortcut: "#",
      section: "actions",
      priority: 10,
      keywords: ["delete", "trash", "remove"],
      action: actions.trash,
    });
  }

  if (actions.markSpam) {
    commands.push({
      id: "mail-mark-spam",
      label: "Mark as spam",
      icon: ShieldAlertIcon,
      shortcut: getShortcutHint("markSpam"),
      section: "actions",
      priority: 11,
      keywords: ["spam", "junk", "report"],
      action: actions.markSpam,
    });
  }

  if (targetCount === 1 && actions.unsubscribe) {
    commands.push({
      id: "mail-unsubscribe",
      label: "Unsubscribe from sender",
      icon: MailXIcon,
      section: "actions",
      priority: 12,
      keywords: ["unsubscribe", "newsletter", "sender"],
      action: actions.unsubscribe,
      disabled: isUnsubscribeDisabled,
    });
  }

  if (targetCount === 1 && actions.toggleAutoArchive) {
    commands.push({
      id: "mail-auto-archive",
      label: isAutoArchived
        ? "Disable auto archive"
        : "Auto archive future emails",
      icon: isAutoArchived ? ArchiveRestoreIcon : ArchiveIcon,
      section: "actions",
      priority: 13,
      keywords: ["auto archive", "future", "sender"],
      action: actions.toggleAutoArchive,
      disabled: isAutoArchiveDisabled,
    });
  }

  if (targetCount === 1 && actions.openExternal) {
    commands.push({
      id: "mail-open-external",
      label: openExternalLabel,
      icon: ExternalLinkIcon,
      shortcut: getShortcutHint("openExternal"),
      section: "actions",
      priority: 14,
      keywords: ["open", "external", "provider", "gmail", "outlook"],
      action: actions.openExternal,
    });
  }

  return commands;
}
