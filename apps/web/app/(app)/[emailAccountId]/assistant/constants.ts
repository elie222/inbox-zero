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
  FileTextIcon,
  FolderInputIcon,
  BellIcon,
} from "lucide-react";
import { ActionType } from "@/generated/prisma/enums";

export const ACTION_TYPE_TEXT_COLORS = {
  [ActionType.LABEL]: "text-blue-500",
  [ActionType.DRAFT_EMAIL]: "text-green-500",
  [ActionType.DRAFT_MESSAGING_CHANNEL]: "text-green-500",
  [ActionType.REPLY]: "text-green-500",
  [ActionType.SEND_EMAIL]: "text-purple-500",
  [ActionType.FORWARD]: "text-purple-500",
  [ActionType.ARCHIVE]: "text-yellow-500",
  [ActionType.MARK_READ]: "text-orange-500",
  [ActionType.MARK_SPAM]: "text-red-500",
  [ActionType.CALL_WEBHOOK]: "text-gray-500",
  [ActionType.DIGEST]: "text-teal-500",
  [ActionType.MOVE_FOLDER]: "text-emerald-500",
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: "text-sky-500",
  [ActionType.NOTIFY_SENDER]: "text-amber-500",
} as const;

export const ACTION_TYPE_ICONS = {
  [ActionType.LABEL]: TagIcon,
  [ActionType.DRAFT_EMAIL]: MailIcon,
  [ActionType.DRAFT_MESSAGING_CHANNEL]: MailIcon,
  [ActionType.REPLY]: ReplyIcon,
  [ActionType.SEND_EMAIL]: SendIcon,
  [ActionType.FORWARD]: ForwardIcon,
  [ActionType.ARCHIVE]: ArchiveIcon,
  [ActionType.MARK_READ]: MailOpenIcon,
  [ActionType.MARK_SPAM]: ShieldCheckIcon,
  [ActionType.CALL_WEBHOOK]: WebhookIcon,
  [ActionType.DIGEST]: FileTextIcon,
  [ActionType.MOVE_FOLDER]: FolderInputIcon,
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: BellIcon,
  [ActionType.NOTIFY_SENDER]: BellIcon,
} as const;
