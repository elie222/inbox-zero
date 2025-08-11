import {
  TagIcon,
  MailIcon,
  ReplyIcon,
  SendIcon,
  ForwardIcon,
  ArchiveIcon,
  MailOpenIcon,
  ShieldCheckIcon,
  WebhookIcon,
  EyeIcon,
  FileTextIcon,
  FolderInputIcon,
} from "lucide-react";
import { ActionType } from "@prisma/client";

const ACTION_TYPE_COLORS = {
  [ActionType.LABEL]: "bg-blue-500",
  [ActionType.DRAFT_EMAIL]: "bg-green-500",
  [ActionType.REPLY]: "bg-green-500",
  [ActionType.SEND_EMAIL]: "bg-purple-500",
  [ActionType.FORWARD]: "bg-purple-500",
  [ActionType.ARCHIVE]: "bg-yellow-500",
  [ActionType.MARK_READ]: "bg-orange-500",
  [ActionType.MARK_SPAM]: "bg-red-500",
  [ActionType.CALL_WEBHOOK]: "bg-gray-500",
  [ActionType.TRACK_THREAD]: "bg-indigo-500",
  [ActionType.DIGEST]: "bg-teal-500",
  [ActionType.MOVE_FOLDER]: "bg-emerald-500",
} as const;

export const ACTION_TYPE_TEXT_COLORS = {
  [ActionType.LABEL]: "text-blue-500",
  [ActionType.DRAFT_EMAIL]: "text-green-500",
  [ActionType.REPLY]: "text-green-500",
  [ActionType.SEND_EMAIL]: "text-purple-500",
  [ActionType.FORWARD]: "text-purple-500",
  [ActionType.ARCHIVE]: "text-yellow-500",
  [ActionType.MARK_READ]: "text-orange-500",
  [ActionType.MARK_SPAM]: "text-red-500",
  [ActionType.CALL_WEBHOOK]: "text-gray-500",
  [ActionType.TRACK_THREAD]: "text-indigo-500",
  [ActionType.DIGEST]: "text-teal-500",
  [ActionType.MOVE_FOLDER]: "text-emerald-500",
} as const;

export const ACTION_TYPE_ICONS = {
  [ActionType.LABEL]: TagIcon,
  [ActionType.DRAFT_EMAIL]: MailIcon,
  [ActionType.REPLY]: ReplyIcon,
  [ActionType.SEND_EMAIL]: SendIcon,
  [ActionType.FORWARD]: ForwardIcon,
  [ActionType.ARCHIVE]: ArchiveIcon,
  [ActionType.MARK_READ]: MailOpenIcon,
  [ActionType.MARK_SPAM]: ShieldCheckIcon,
  [ActionType.CALL_WEBHOOK]: WebhookIcon,
  [ActionType.TRACK_THREAD]: EyeIcon,
  [ActionType.DIGEST]: FileTextIcon,
  [ActionType.MOVE_FOLDER]: FolderInputIcon,
} as const;

// Helper function to get action type from string (for RulesPrompt.tsx)
export function getActionTypeColor(example: string): string {
  const lowerExample = example.toLowerCase();

  if (lowerExample.includes("forward")) {
    return ACTION_TYPE_COLORS[ActionType.FORWARD];
  }
  if (lowerExample.includes("draft")) {
    return ACTION_TYPE_COLORS[ActionType.DRAFT_EMAIL];
  }
  if (lowerExample.includes("reply")) {
    return ACTION_TYPE_COLORS[ActionType.REPLY];
  }
  if (lowerExample.includes("archive")) {
    return ACTION_TYPE_COLORS[ActionType.ARCHIVE];
  }
  if (lowerExample.includes("spam")) {
    return ACTION_TYPE_COLORS[ActionType.MARK_SPAM];
  }
  if (lowerExample.includes("mark")) {
    return ACTION_TYPE_COLORS[ActionType.MARK_READ];
  }
  if (lowerExample.includes("label")) {
    return ACTION_TYPE_COLORS[ActionType.LABEL];
  }
  if (lowerExample.includes("digest")) {
    return ACTION_TYPE_COLORS[ActionType.DIGEST];
  }
  if (lowerExample.includes("folder")) {
    return ACTION_TYPE_COLORS[ActionType.MOVE_FOLDER];
  }

  // Default fallback
  return "bg-gray-500";
}
