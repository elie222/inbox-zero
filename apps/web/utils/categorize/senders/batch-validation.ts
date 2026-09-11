import { z } from "zod";

const senderSchema = z.object({
  email: z.string(),
  name: z.string().nullable(),
});

export const aiCategorizeSendersSchema = z.object({
  emailAccountId: z.string(),
  senders: z.array(senderSchema),
});
export type AiCategorizeSenders = z.infer<typeof aiCategorizeSendersSchema>;
export type Sender = z.infer<typeof senderSchema>;
