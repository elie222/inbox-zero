import { z } from "zod";
import { publishToQstash } from "@/utils/upstash";

export const MAX_REPLIED_SENDER_EXCLUSION_ATTEMPTS = 6;

export const repliedSenderExclusionRetryBody = z.object({
  emailAccountId: z.string().min(1),
  messageId: z.string().min(1),
  attempt: z.number().int().min(1),
});

export async function enqueueRepliedSenderExclusionRetry({
  emailAccountId,
  messageId,
  attempt,
  continueAfterMaxAttempts = false,
}: z.infer<typeof repliedSenderExclusionRetryBody> & {
  continueAfterMaxAttempts?: boolean;
}) {
  if (
    attempt > MAX_REPLIED_SENDER_EXCLUSION_ATTEMPTS &&
    !continueAfterMaxAttempts
  ) {
    return false;
  }

  await publishToQstash("/api/cold-email/exclude-replied-sender", {
    emailAccountId,
    messageId,
    attempt,
  });
  return true;
}
