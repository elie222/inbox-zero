import type {
  ProcessHistoryOptions,
  OutlookResourceData,
} from "@/app/api/outlook/webhook/types";
import { logger as globalLogger } from "@/app/api/outlook/webhook/logger";
import { processHistoryItem as processHistoryItemShared } from "@/utils/webhook/process-history-item";

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
