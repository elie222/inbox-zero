import type { EmailProvider } from "@/utils/email/types";
import { runWithBoundedConcurrency } from "@/utils/async";

export async function applyLabelToThread({
  emailProvider,
  threadId,
  labelId,
  labelName,
}: {
  emailProvider: EmailProvider;
  threadId: string;
  labelId: string;
  labelName: string | null;
}) {
  const messages = await emailProvider.getThreadMessages(threadId);
  const results = await runWithBoundedConcurrency({
    items: messages,
    concurrency: 1,
    run: async (message) => {
      await emailProvider.labelMessage({
        messageId: message.id,
        labelId,
        labelName,
      });
    },
  });

  const failures = results.flatMap(({ result }) =>
    result.status === "rejected" ? [result.reason] : [],
  );

  if (failures.length > 0) {
    // Keep the provider error so callers can tell rate limits apart.
    throw new Error(`Failed to label ${failures.length} messages in thread`, {
      cause: failures[0],
    });
  }
}
