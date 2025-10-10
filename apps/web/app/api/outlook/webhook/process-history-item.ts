import type { OutlookResourceData } from "@/app/api/outlook/webhook/types";
import { logger as globalLogger } from "@/app/api/outlook/webhook/logger";
import { processHistoryItem as processHistoryItemShared } from "@/utils/webhook/process-history-item";
import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailAccount } from "@prisma/client";
import type { EmailProvider } from "@/utils/email/types";

type ProcessHistoryOptions = {
  provider: EmailProvider;
  rules: RuleWithActionsAndCategories[];
  hasAutomationRules: boolean;
  hasAiAccess: boolean;
  emailAccount: Pick<EmailAccount, "autoCategorizeSenders"> &
    EmailAccountWithAI;
};

export async function processHistoryItem(
  resourceData: OutlookResourceData,
  {
    provider,
    emailAccount,
    hasAutomationRules,
    hasAiAccess,
    rules,
  }: ProcessHistoryOptions,
) {
  const messageId = resourceData.id;
  const userEmail = emailAccount.email;

  const logger = globalLogger.with({ email: userEmail, messageId });

  return processHistoryItemShared(
    { messageId },
    {
      provider,
      emailAccount,
      hasAutomationRules,
      hasAiAccess,
      rules,
      logger,
    },
  );
}
