import { z } from "zod";

export const actBody = z.object({
  email: z.object({
    from: z.string(),
    to: z.string().optional(), // used when forwarding
    date: z.string().optional(), // used when forwarding
    replyTo: z.string().optional(),
    cc: z.string().optional(),
    subject: z.string(),
    content: z.string(),
    threadId: z.string(),
    messageId: z.string(), // gmail message id
    headerMessageId: z.string(),
    references: z.string().optional(),
  }),
  allowExecute: z.boolean().optional(),
  forceExecute: z.boolean().optional(),
});
export type ActBody = z.infer<typeof actBody>;
