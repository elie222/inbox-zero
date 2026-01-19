import { SystemType } from "@/generated/prisma/enums";

export const CONVERSATION_STATUS_TYPES: SystemType[] = [
  SystemType.TO_REPLY,
  SystemType.AWAITING_REPLY,
  SystemType.FYI,
  SystemType.ACTIONED,
];

export type ConversationStatus =
  | "TO_REPLY"
  | "AWAITING_REPLY"
  | "FYI"
  | "ACTIONED";

export function isConversationStatusType(
  systemType: SystemType | null | undefined,
): systemType is ConversationStatus {
  if (!systemType) return false;

  return CONVERSATION_STATUS_TYPES.includes(systemType);
}
