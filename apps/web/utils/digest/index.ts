import { publishToQstashQueue } from "@/utils/upstash";
import type { Logger } from "@/utils/logger";
import { emailToContent } from "@/utils/mail";
import { getInternalApiUrl } from "@/utils/internal-api";
import type { DigestBody } from "@/app/api/ai/digest/validation";
import type { ParsedMessage } from "@/utils/types";
import type { EmailForAction } from "@/utils/ai/types";

export async function enqueueDigestItem({
  email,
  emailAccountId,
  actionId,
  coldEmailId,
  logger,
}: {
  email: ParsedMessage | EmailForAction;
  emailAccountId: string;
  actionId?: string;
  coldEmailId?: string;
  logger: Logger;
}) {
  const url = `${getInternalApiUrl()}/api/ai/digest`;
  try {
    await publishToQstashQueue<DigestBody>({
      queueName: "digest-item-summarize",
      parallelism: 3, // Allow up to 3 concurrent jobs from this queue
      url,
      body: {
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
      },
    });
  } catch (error) {
    logger.error("Failed to publish to Qstash", { error });
  }
}
