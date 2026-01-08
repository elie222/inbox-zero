import { z } from "zod";

export const sendSummaryEmailBody = z.object({
  emailAccountId: z.string(),
});

export type SendSummaryEmailBody = z.infer<typeof sendSummaryEmailBody>;
