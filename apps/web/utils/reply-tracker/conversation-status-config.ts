import { SystemType } from "@prisma/client";
import {
  NEEDS_REPLY_LABEL_NAME,
  FYI_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
  ACTIONED_LABEL_NAME,
} from "./consts";

export type ConversationStatus =
  | "TO_REPLY"
  | "FYI"
  | "AWAITING_REPLY"
  | "ACTIONED";

export const CONVERSATION_STATUSES = [
  {
    systemType: SystemType.TO_REPLY,
    name: "To Reply",
    labelName: NEEDS_REPLY_LABEL_NAME,
    labelType: SystemType.TO_REPLY,
    description: "Emails you need to respond to",
  },
  {
    systemType: SystemType.FYI,
    name: "FYI",
    labelName: FYI_LABEL_NAME,
    labelType: SystemType.FYI,
    description: "Emails that don't require your response, but are important",
  },
  {
    systemType: SystemType.AWAITING_REPLY,
    name: "Awaiting Reply",
    labelName: AWAITING_REPLY_LABEL_NAME,
    labelType: SystemType.AWAITING_REPLY,
    description: "Emails you're expecting a reply to",
  },
  {
    systemType: SystemType.ACTIONED,
    name: "Actioned",
    labelName: ACTIONED_LABEL_NAME,
    labelType: SystemType.ACTIONED,
    description: "Email threads that have been resolved",
  },
] as const;

export const CONVERSATION_STATUS_TYPES: SystemType[] = [
  SystemType.TO_REPLY,
  SystemType.FYI,
  SystemType.AWAITING_REPLY,
  SystemType.ACTIONED,
];

export function isConversationStatusType(
  systemType: SystemType | null | undefined,
): boolean {
  if (!systemType) return false;

  return CONVERSATION_STATUS_TYPES.includes(systemType);
}
