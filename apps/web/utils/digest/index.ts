import { enqueueJob } from "@/utils/queue/queue-manager";
import { createScopedLogger } from "@/utils/logger";
import { emailToContent } from "@/utils/mail";
import type { ParsedMessage } from "@/utils/types";
import type { EmailForAction } from "@/utils/ai/types";

const logger = createScopedLogger("digest");

export async function enqueueDigestItem({
  email,
  emailAccountId,
  actionId,
  coldEmailId,
}: {
  email: ParsedMessage | EmailForAction;
  emailAccountId: string;
  actionId?: string;
  coldEmailId?: string;
}) {
  try {
    await enqueueJob("digest-item-summarize", {
      emailAccountId,
      actionId,
      coldEmailId,
      message: {
        id: email.id,
        threadId: email.threadId,
        from: email.headers.from,
        to: email.headers.to || "",
        subject: email.headers.subject,
        content: emailToContent(email),
      },
    });
  } catch (error) {
    logger.error("Failed to enqueue digest job", {
      emailAccountId,
      error,
    });
  }
}
