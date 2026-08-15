import {
  ArchiveIcon,
  Clock3Icon,
  MailIcon,
  MailOpenIcon,
  Trash2Icon,
} from "lucide-react";
import type { Command } from "@/lib/commands/types";

type MailCommandActions = {
  archive: () => void;
  markRead: () => void;
  markUnread: () => void;
  openSnooze: () => void;
  trash: () => void;
};

export function buildMailCommandPalette({
  actions,
  hasRead,
  hasUnread,
  targetCount,
}: {
  actions: MailCommandActions;
  hasRead: boolean;
  hasUnread: boolean;
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

  if (hasUnread) {
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

  if (hasRead) {
    commands.push({
      id: "mail-mark-unread",
      label:
        targetCount === 1 ? "Mark as unread" : `Mark ${targetCount} as unread`,
      icon: MailIcon,
      section: "actions",
      priority: 2,
      keywords: ["unread", "unseen", "new"],
      action: actions.markUnread,
    });
  }

  commands.push({
    id: "mail-snooze",
    label: targetCount === 1 ? "Snooze" : `Snooze ${targetCount} conversations`,
    icon: Clock3Icon,
    section: "actions",
    priority: 3,
    keywords: ["snooze", "later", "remind"],
    action: actions.openSnooze,
    closeOnSelect: false,
  });

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

  return commands;
}
