import { SystemType } from "@prisma/client";

export const CONVERSATION_STATUS_TYPES: SystemType[] = [
  SystemType.TO_REPLY,
  SystemType.FYI,
  SystemType.AWAITING_REPLY,
  SystemType.ACTIONED,
];

export type ConversationStatus =
  | "TO_REPLY"
  | "FYI"
  | "AWAITING_REPLY"
  | "ACTIONED";

export function isConversationStatusType(
  systemType: SystemType | null | undefined,
): systemType is ConversationStatus {
  if (!systemType) return false;

  return CONVERSATION_STATUS_TYPES.includes(systemType);
}
