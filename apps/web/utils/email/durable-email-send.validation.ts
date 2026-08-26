import { z } from "zod";
import { sendEmailBody } from "@/utils/types/mail";

export const durableEmailSendBody = z.object({
  mutationId: z.string().uuid(),
  queuedAt: z.number().int().nonnegative(),
  threadId: z.string().min(1).max(512),
  messageIds: z.array(z.string().min(1).max(512)).max(1000),
  email: sendEmailBody,
});

export type DurableEmailSendBody = z.infer<typeof durableEmailSendBody>;
