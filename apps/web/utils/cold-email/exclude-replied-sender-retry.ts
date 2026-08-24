import { z } from "zod";
import { publishToQstash } from "@/utils/upstash";

export const MAX_REPLIED_SENDER_EXCLUSION_ATTEMPTS = 6;

export const repliedSenderExclusionRetryBody = z.object({
  emailAccountId: z.string().min(1),
  messageId: z.string().min(1),
  attempt: z.number().int().min(1).max(MAX_REPLIED_SENDER_EXCLUSION_ATTEMPTS),
});

export async function enqueueRepliedSenderExclusionRetry({
  emailAccountId,
  messageId,
  attempt,
}: z.infer<typeof repliedSenderExclusionRetryBody>) {
  if (attempt > MAX_REPLIED_SENDER_EXCLUSION_ATTEMPTS) return false;

  await publishToQstash(
    "/api/cold-email/exclude-replied-sender",
    { emailAccountId, messageId, attempt },
    undefined,
    undefined,
    { waitForFallback: true },
  );
  return true;
}
