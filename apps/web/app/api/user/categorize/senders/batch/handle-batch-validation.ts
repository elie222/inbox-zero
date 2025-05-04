import { z } from "zod";

export const aiCategorizeSendersSchema = z.object({
  emailAccountId: z.string(),
  senders: z.array(z.string()),
});
export type AiCategorizeSenders = z.infer<typeof aiCategorizeSendersSchema>;
