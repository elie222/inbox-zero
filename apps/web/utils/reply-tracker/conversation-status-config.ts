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

/** The single "Conversations" option the choosers see in place of the four conversation status rules. */
export const CONVERSATION_TRACKING_META_RULE_ID = "conversation-tracking-meta";

export const CONVERSATION_TRACKING_INSTRUCTIONS = `Conversations and communication with real people. This covers all conversation states: emails you need to reply to, emails you're awaiting replies on, FYI updates from people, and resolved discussions.

Match when:
- Questions or requests for information/action
- Updates or FYI information from real people
- Follow-ups on ongoing conversations
- Conversations that have been resolved or concluded

EXCLUDE:
- All automated notifications (LinkedIn, GitHub, Slack, Figma, Jira, Facebook, social media platforms, marketing)
- System emails (order confirmations, receipts, calendar invites)
- Emails with List-Unsubscribe headers or unsubscribe links are a strong signal of mass/automated emails

IMPORTANT:
- Only use this rule for human-to-human communication. If an email is automated or system-generated and another rule is a better fit, do not use this rule.
- When this rule matches, it should typically be the primary match.`;
