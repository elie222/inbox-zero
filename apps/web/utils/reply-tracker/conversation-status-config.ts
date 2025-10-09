import { ruleConfig } from "@/utils/rule/consts";
import { SystemType } from "@prisma/client";

export type ConversationStatus =
  | "TO_REPLY"
  | "FYI"
  | "AWAITING_REPLY"
  | "ACTIONED";

// TODO: replace this config
export const CONVERSATION_STATUSES = [
  {
    systemType: SystemType.TO_REPLY,
    name: "To Reply",
    labelName: ruleConfig.ToReply.label,
    labelType: SystemType.TO_REPLY,
    description: "Emails you need to respond to",
  },
  {
    systemType: SystemType.FYI,
    name: "FYI",
    labelName: ruleConfig.Fyi.label,
    labelType: SystemType.FYI,
    description: "Emails that don't require your response, but are important",
  },
  {
    systemType: SystemType.AWAITING_REPLY,
    name: "Awaiting Reply",
    labelName: ruleConfig.AwaitingReply.label,
    labelType: SystemType.AWAITING_REPLY,
    description: "Emails you're expecting a reply to",
  },
  {
    systemType: SystemType.ACTIONED,
    name: "Actioned",
    labelName: ruleConfig.Actioned.label,
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
