import { z } from "zod";

export const actEmail = z.object({
  from: z.string(),
  to: z.string().optional(), // used when forwarding
  date: z.string().optional(), // used when forwarding
  replyTo: z.string().optional(),
  cc: z.string().optional(),
  subject: z.string(),
  textPlain: z.string().nullable(),
  textHtml: z.string().nullable(),
  threadId: z.string(),
  messageId: z.string(), // gmail message id
  headerMessageId: z.string(),
  references: z.string().optional(),
});

export const actBody = z.object({
  email: actEmail,
  allowExecute: z.boolean().optional(),
  forceExecute: z.boolean().optional(),
});
export type ActBody = z.infer<typeof actBody>;
