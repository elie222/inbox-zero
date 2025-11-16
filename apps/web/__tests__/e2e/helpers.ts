/**
 * Shared helpers for E2E tests
 */

import type { EmailProvider } from "@/utils/email/types";

export async function findOldMessage(
  provider: EmailProvider,
  daysOld = 7,
): Promise<{ threadId: string; messageId: string }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const response = await provider.getMessagesWithPagination({
    maxResults: 1,
    before: cutoffDate,
  });

  const message = response.messages[0];
  if (!message?.id || !message?.threadId) {
    throw new Error("No old message found for testing");
  }

  return {
    threadId: message.threadId,
    messageId: message.id,
  };
}
