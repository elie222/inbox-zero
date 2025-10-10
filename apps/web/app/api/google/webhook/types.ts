import type { gmail_v1 } from "@googleapis/gmail";
import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailAccount } from "@prisma/client";

export const HistoryEventType = {
  MESSAGE_ADDED: "messageAdded",
  LABEL_ADDED: "labelAdded",
  LABEL_REMOVED: "labelRemoved",
} as const;

export type HistoryEventType =
  (typeof HistoryEventType)[keyof typeof HistoryEventType];

export type ProcessHistoryOptions = {
  history: gmail_v1.Schema$History[];
  gmail: gmail_v1.Gmail;
  accessToken: string;
  rules: RuleWithActionsAndCategories[];
  hasAutomationRules: boolean;
  hasAiAccess: boolean;
  emailAccount: Pick<EmailAccount, "autoCategorizeSenders"> &
    EmailAccountWithAI;
};
