import { SystemType } from "@prisma/client";
import {
  NEEDS_REPLY_LABEL_NAME,
  FYI_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
  ACTIONED_LABEL_NAME,
} from "./consts";

export type ThreadStatus = "TO_REPLY" | "FYI" | "AWAITING_REPLY" | "ACTIONED";

export type ConversationStatusLabelType =
  | "needsReply"
  | "awaitingReply"
  | "fyi"
  | "actioned";

export const CONVERSATION_STATUSES = [
  {
    systemType: SystemType.TO_REPLY,
    name: "To Reply",
    labelName: NEEDS_REPLY_LABEL_NAME,
    labelType: "needsReply" as const,
    description: "Emails you need to respond to",
    icon: "🔵",
  },
  {
    systemType: SystemType.FYI,
    name: "FYI",
    labelName: FYI_LABEL_NAME,
    labelType: "fyi" as const,
    description: "Emails that don't require your response, but are important",
    icon: "⚪",
  },
  {
    systemType: SystemType.AWAITING_REPLY,
    name: "Awaiting Reply",
    labelName: AWAITING_REPLY_LABEL_NAME,
    labelType: "awaitingReply" as const,
    description: "Emails you're expecting a reply to",
    icon: "🟡",
  },
  {
    systemType: SystemType.ACTIONED,
    name: "Actioned",
    labelName: ACTIONED_LABEL_NAME,
    labelType: "actioned" as const,
    description: "Email threads that have been resolved",
    icon: "✅",
  },
] as const;

export function isConversationStatusType(
  systemType: SystemType | null | undefined,
): boolean {
  if (!systemType) return false;

  const CONVERSATION_STATUS_TYPES: string[] = [
    SystemType.TO_REPLY,
    SystemType.FYI,
    SystemType.AWAITING_REPLY,
    SystemType.ACTIONED,
  ];

  return CONVERSATION_STATUS_TYPES.includes(systemType);
}

export function systemTypeToString(
  systemType: SystemType,
): ThreadStatus | null {
  const mapping: Record<SystemType, ThreadStatus | null> = {
    [SystemType.TO_REPLY]: "TO_REPLY",
    [SystemType.FYI]: "FYI",
    [SystemType.AWAITING_REPLY]: "AWAITING_REPLY",
    [SystemType.ACTIONED]: "ACTIONED",
    [SystemType.NEWSLETTER]: null,
    [SystemType.MARKETING]: null,
    [SystemType.CALENDAR]: null,
    [SystemType.RECEIPT]: null,
    [SystemType.NOTIFICATION]: null,
  };
  return mapping[systemType];
}

export function stringToSystemType(status: ThreadStatus): SystemType {
  const mapping: Record<ThreadStatus, SystemType> = {
    TO_REPLY: SystemType.TO_REPLY,
    FYI: SystemType.FYI,
    AWAITING_REPLY: SystemType.AWAITING_REPLY,
    ACTIONED: SystemType.ACTIONED,
  };
  return mapping[status];
}
