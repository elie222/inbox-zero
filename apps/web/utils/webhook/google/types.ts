import type { gmail_v1 } from "@googleapis/gmail";
import type { RuleWithActions } from "@/utils/types";
import type { EmailAccountForDrafting } from "@/utils/ai/choose-rule/choose-args";
import type { EmailAccount } from "@/generated/prisma/client";

export const HistoryEventType = {
  MESSAGE_ADDED: "messageAdded",
  LABEL_ADDED: "labelAdded",
  LABEL_REMOVED: "labelRemoved",
} as const;

export type HistoryEventType =
  (typeof HistoryEventType)[keyof typeof HistoryEventType];

export type ProcessHistoryOptions = {
  history: gmail_v1.Schema$History[];
  // Gmail labels every message in a thread as spam, so junking one thread fires one
  // event per message. Spam learning is thread-scoped, so it only runs for the first.
  spamLearnedThreadIds?: Set<string>;
  gmail: gmail_v1.Gmail;
  accessToken: string;
  rules: RuleWithActions[];
  hasAutomationRules: boolean;
  hasAiAccess: boolean;
  emailAccount: Pick<
    EmailAccount,
    | "autoCategorizeSenders"
    | "filingEnabled"
    | "filingPrompt"
    | "filingConfirmationSendEmail"
  > &
    EmailAccountForDrafting;
};
