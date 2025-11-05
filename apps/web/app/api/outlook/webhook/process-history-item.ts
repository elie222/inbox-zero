import type { OutlookResourceData } from "@/app/api/outlook/webhook/types";
import { processHistoryItem as processHistoryItemShared } from "@/utils/webhook/process-history-item";
import type { RuleWithActions } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailAccount } from "@prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

type ProcessHistoryOptions = {
  provider: EmailProvider;
  rules: RuleWithActions[];
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
    logger: log,
  }: ProcessHistoryOptions & { logger: Logger },
) {
  const messageId = resourceData.id;

  const logger = log.with({ messageId });

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
