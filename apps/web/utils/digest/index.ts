import { env } from "@/env";
import { publishToQstashQueue } from "@/utils/upstash";
import { createScopedLogger } from "@/utils/logger";
import { emailToContent } from "@/utils/mail";
import type { DigestBody } from "@/app/api/ai/digest/validation";
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
  const url = `${env.NEXT_PUBLIC_BASE_URL}/api/ai/digest`;
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
    logger.error("Failed to publish to Qstash", {
      emailAccountId,
      error,
    });
  }
}
