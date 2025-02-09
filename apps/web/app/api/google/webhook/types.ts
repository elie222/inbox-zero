import type { gmail_v1 } from "@googleapis/gmail";
import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { UserEmailWithAI } from "@/utils/llms/types";
import type { User } from "@prisma/client";

export type ProcessHistoryOptions = {
  history: gmail_v1.Schema$History[];
  email: string;
  gmail: gmail_v1.Gmail;
  accessToken: string;
  rules: RuleWithActionsAndCategories[];
  hasAutomationRules: boolean;
  hasColdEmailAccess: boolean;
  hasAiAutomationAccess: boolean;
  user: Pick<
    User,
    | "id"
    | "about"
    | "coldEmailPrompt"
    | "coldEmailBlocker"
    | "autoCategorizeSenders"
  > &
    UserEmailWithAI;
};
