import { z } from "zod";
import { sendEmailBody } from "@/utils/types/mail";

export const scheduleEmailBody = z.object({
  clientMutationId: z.string().uuid(),
  threadId: z.string().min(1).max(512).nullable(),
  messageIds: z.array(z.string().min(1).max(512)).max(1000),
  email: sendEmailBody,
  sendAt: z.iso.datetime().nullable(),
  remindAt: z.iso.datetime().nullable(),
});

export const scheduledEmailIdBody = z.object({ id: z.string().min(1) });
